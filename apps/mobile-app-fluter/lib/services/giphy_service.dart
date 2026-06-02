import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

class GiphyService {
  final Dio _dio = Dio();
  
  String get _apiKey => dotenv.env['GIPHY_API_KEY'] ?? '';

  Future<List<Map<String, dynamic>>> fetchTrending({int offset = 0, int limit = 20}) async {
    if (_apiKey.isEmpty) return [];
    try {
      final response = await _dio.get(
        'https://api.giphy.com/v1/gifs/trending',
        queryParameters: {
          'api_key': _apiKey,
          'limit': limit,
          'offset': offset,
          'rating': 'g',
        },
      );
      final data = response.data['data'] as List;
      return data.map((e) => e as Map<String, dynamic>).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> searchGifs(String query, {int offset = 0, int limit = 20}) async {
    if (_apiKey.isEmpty || query.trim().isEmpty) return [];
    try {
      final response = await _dio.get(
        'https://api.giphy.com/v1/gifs/search',
        queryParameters: {
          'api_key': _apiKey,
          'q': query,
          'limit': limit,
          'offset': offset,
          'rating': 'g',
        },
      );
      final data = response.data['data'] as List;
      return data.map((e) => e as Map<String, dynamic>).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> fetchTrendingStickers({int offset = 0, int limit = 20}) async {
    if (_apiKey.isEmpty) return [];
    try {
      final response = await _dio.get(
        'https://api.giphy.com/v1/stickers/trending',
        queryParameters: {
          'api_key': _apiKey,
          'limit': limit,
          'offset': offset,
          'rating': 'g',
        },
      );
      final data = response.data['data'] as List;
      return data.map((e) => e as Map<String, dynamic>).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> searchStickers(String query, {int offset = 0, int limit = 20}) async {
    if (_apiKey.isEmpty || query.trim().isEmpty) return [];
    try {
      final response = await _dio.get(
        'https://api.giphy.com/v1/stickers/search',
        queryParameters: {
          'api_key': _apiKey,
          'q': query,
          'limit': limit,
          'offset': offset,
          'rating': 'g',
        },
      );
      final data = response.data['data'] as List;
      return data.map((e) => e as Map<String, dynamic>).toList();
    } catch (e) {
      return [];
    }
  }
}
