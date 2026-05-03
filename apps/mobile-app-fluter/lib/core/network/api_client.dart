import "dart:async";

import "package:dio/dio.dart";

import "../config/app_config.dart";
import "../storage/auth_token_store.dart";
import "api_exception.dart";

class ApiClient {
  ApiClient({
    required AuthTokenStore tokenStore,
    Dio? dio,
  })  : _tokenStore = tokenStore,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: AppConfig.apiBaseUrl,
                connectTimeout: const Duration(seconds: 15),
                receiveTimeout: const Duration(seconds: 20),
                sendTimeout: const Duration(seconds: 30),
              ),
            ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStore.readAccessToken();
          if (token != null && token.trim().isNotEmpty) {
            options.headers["Authorization"] = "Bearer $token";
          }
          handler.next(options);
        },
        onError: (DioException e, handler) async {
          if (e.response?.statusCode == 401 && 
              !e.requestOptions.path.contains("/auth/login") && 
              !e.requestOptions.path.contains("/auth/refresh") &&
              !e.requestOptions.path.contains("/auth/register")) {
            final refreshToken = await _tokenStore.readRefreshToken();
            if (refreshToken != null && refreshToken.isNotEmpty) {
              try {
                // Use a separate dio instance to avoid interceptor loop
                final refreshDio = Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl));
                final refreshResponse = await refreshDio.post(
                  "/auth/refresh", 
                  data: {"refreshToken": refreshToken},
                );
                
                final newAccessToken = refreshResponse.data['data']['tokens']['accessToken'];
                final newRefreshToken = refreshResponse.data['data']['tokens']['refreshToken'];
                
                await _tokenStore.writeTokens(
                  accessToken: newAccessToken, 
                  refreshToken: newRefreshToken,
                );
                
                // Retry the original request
                e.requestOptions.headers["Authorization"] = "Bearer $newAccessToken";
                final retryResponse = await _dio.fetch(e.requestOptions);
                return handler.resolve(retryResponse);
              } catch (_) {
                // Refresh failed, clear tokens
                await _tokenStore.clearTokens();
              }
            }
          }
          handler.next(e);
        },
      ),
    );
  }

  final AuthTokenStore _tokenStore;
  final Dio _dio;

  Future<dynamic> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _execute(
      () => _dio.get<dynamic>(
        path,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      ),
    );
  }

  Future<dynamic> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _execute(
      () => _dio.post<dynamic>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      ),
    );
  }

  Future<dynamic> patch(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _execute(
      () => _dio.patch<dynamic>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      ),
    );
  }

  Future<dynamic> delete(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _execute(
      () => _dio.delete<dynamic>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      ),
    );
  }

  Future<dynamic> upload(
    String path, {
    required FormData formData,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _execute(
      () => _dio.post<dynamic>(
        path,
        data: formData,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      ),
    );
  }

  Future<Map<String, dynamic>> getPaginated(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _executePaginated(
      () => _dio.get<dynamic>(
        path,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      ),
    );
  }

  Future<Map<String, dynamic>> _executePaginated(
    Future<Response<dynamic>> Function() request,
  ) async {
    try {
      final response = await request();
      final raw = response.data;
      if (raw is Map<String, dynamic> && raw["success"] == true) {
         return {
           "data": raw["data"],
           "meta": raw["meta"] ?? <String, dynamic>{},
         };
      }
      return <String, dynamic>{
        "data": _unwrapEnvelope(raw),
        "meta": <String, dynamic>{},
      };
    } on DioException catch (error) {
      throw _buildException(error);
    } on TimeoutException {
      throw const ApiException(message: "Request timeout. Please retry.");
    }
  }

  Future<dynamic> _execute(
    Future<Response<dynamic>> Function() request,
  ) async {
    try {
      final response = await request();
      return _unwrapEnvelope(response.data);
    } on DioException catch (error) {
      throw _buildException(error);
    } on TimeoutException {
      throw const ApiException(message: "Request timeout. Please retry.");
    }
  }

  dynamic _unwrapEnvelope(dynamic raw) {
    if (raw is! Map<String, dynamic>) {
      return raw;
    }

    final success = raw["success"];
    if (success == true) {
      return raw["data"];
    }

    if (success == false) {
      final error = raw["error"];
      if (error is Map<String, dynamic>) {
        final message = _pickErrorMessage(error) ?? "Request failed.";
        final status = _parseStatusCode(error["statusCode"]);
        throw ApiException(message: message, statusCode: status);
      }
    }

    return raw["data"] ?? raw;
  }

  ApiException _buildException(DioException error) {
    final statusCode = error.response?.statusCode;
    final payload = error.response?.data;

    if (payload is Map<String, dynamic>) {
      final message = _pickErrorMessage(payload) ?? "Network error.";
      final requestId = _extractRequestId(payload);
      return ApiException(
        message: message,
        statusCode: statusCode,
        requestId: requestId,
      );
    }

    return ApiException(
      message: error.message ?? "Network error.",
      statusCode: statusCode,
    );
  }

  String? _pickErrorMessage(Map<String, dynamic> payload) {
    final direct = payload["message"];
    if (direct is String && direct.trim().isNotEmpty) {
      return direct;
    }
    if (direct is List && direct.isNotEmpty) {
      return direct.join("\n");
    }

    final nested = payload["error"];
    if (nested is Map<String, dynamic>) {
      final nestedMessage = nested["message"];
      if (nestedMessage is String && nestedMessage.trim().isNotEmpty) {
        return nestedMessage;
      }
      if (nestedMessage is List && nestedMessage.isNotEmpty) {
        return nestedMessage.join("\n");
      }
    }

    return null;
  }

  int? _parseStatusCode(dynamic value) {
    if (value is int) {
      return value;
    }
    if (value is String) {
      return int.tryParse(value);
    }
    return null;
  }

  String? _extractRequestId(Map<String, dynamic> payload) {
    final requestId = payload["requestId"];
    if (requestId is String && requestId.trim().isNotEmpty) {
      return requestId;
    }
    return null;
  }
}
