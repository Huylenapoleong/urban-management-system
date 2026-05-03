import "dart:io";

import "package:background_downloader/background_downloader.dart";
import "package:flutter_image_compress/flutter_image_compress.dart";
import "package:dio/dio.dart";
import "package:http_parser/http_parser.dart";
import "package:mime/mime.dart";
import "package:path_provider/path_provider.dart";

import "../core/network/api_client.dart";
import "../models/uploaded_asset.dart";

class UploadService {
  const UploadService({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<UploadedAsset> uploadMedia({
    required String filePath,
    String? fileName,
    String? mimeType,
    required String target,
    String? entityId,
  }) async {
    String finalPath = filePath;
    final resolvedMimeType = mimeType ?? lookupMimeType(filePath) ?? "application/octet-stream";
    
    if (resolvedMimeType.startsWith("image/")) {
      try {
        final tempDir = await getTemporaryDirectory();
        final fileNameOnly = fileName ?? filePath.split("/").last;
        final targetPath = "${tempDir.path}/compressed_$fileNameOnly";
        
        final compressed = await FlutterImageCompress.compressAndGetFile(
          filePath,
          targetPath,
          quality: 80,
        );
        if (compressed != null) {
          finalPath = compressed.path;
        }
      } catch (e) {
        print("Image compression failed: $e");
      }
    }

    final file = File(finalPath);
    if (!await file.exists()) {
      throw Exception("File does not exist: $finalPath");
    }

    final fileNameOnly = fileName ?? finalPath.split("/").last;

    final formData = FormData.fromMap({
      "target": target,
      if (entityId != null && entityId.trim().isNotEmpty) "entityId": entityId,
      "file": await MultipartFile.fromFile(
        finalPath,
        filename: fileNameOnly,
        contentType: MediaType.parse(resolvedMimeType),
      ),
    });

    final response = await _apiClient.upload(
      "/uploads/media",
      formData: formData,
    );

    return UploadedAsset.fromJson(response as Map<String, dynamic>);
  }

  Future<List<Map<String, dynamic>>> listMedia({
    required String target,
    String? entityId,
    String? cursor,
    int? limit,
  }) async {
    final raw = await _apiClient.get(
      "/uploads/media",
      queryParameters: {
        "target": target,
        if (entityId != null && entityId.trim().isNotEmpty) "entityId": entityId,
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor,
        if (limit != null) "limit": limit,
      },
    );
    return (raw as List)
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> getUploadLimits() async {
    final raw = await _apiClient.get("/uploads/limits");
    return (raw as Map).cast<String, dynamic>();
  }

  Future<void> deleteMedia({
    required String key,
    String? target,
    String? entityId,
  }) async {
    await _apiClient.delete(
      "/uploads/media",
      data: {
        "key": key,
        if (target != null && target.trim().isNotEmpty) "target": target,
        if (entityId != null && entityId.trim().isNotEmpty) "entityId": entityId,
      },
    );
  }

  Future<Map<String, dynamic>> getPresignedUploadUrl({
    required String fileName,
    required String contentType,
    required String target,
    int? size,
    String? entityId,
  }) async {
    final raw = await _apiClient.post(
      "/uploads/presign/upload",
      data: {
        "fileName": fileName,
        "contentType": contentType,
        "target": target,
        if (size != null) "size": size,
        if (entityId != null && entityId.trim().isNotEmpty) "entityId": entityId,
      },
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> getPresignedDownloadUrl({
    required String key,
    String? target,
    String? entityId,
  }) async {
    final raw = await _apiClient.post(
      "/uploads/presign/download",
      data: {
        "key": key,
        if (target != null && target.trim().isNotEmpty) "target": target,
        if (entityId != null && entityId.trim().isNotEmpty) "entityId": entityId,
      },
    );
    return (raw as Map).cast<String, dynamic>();
  }
}
