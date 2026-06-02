import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/config/app_config.dart';
import '../core/network/api_client.dart';

class ChatbotService {
  ChatbotService({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  /// Hỏi đáp JSON (Không streaming)
  Future<Map<String, dynamic>> ask(String question) async {
    final raw = await _apiClient.post('/chatbot/ask', data: {'question': question});
    return (raw as Map).cast<String, dynamic>();
  }

  /// Tóm tắt nhóm chat (Cán bộ)
  Future<Map<String, dynamic>> summarizeGroup(String groupId, {int messageCount = 100}) async {
    final raw = await _apiClient.post('/chatbot/officer/summarize-group', data: {
      'groupId': groupId,
      'messageCount': messageCount,
    });
    return (raw as Map).cast<String, dynamic>();
  }

  /// Phân tích phản ánh (Cán bộ)
  Future<Map<String, dynamic>> generateReportAnalysis({
    String? status,
    String? locationCode,
    String? category,
    String? groupId,
  }) async {
    final raw = await _apiClient.post('/chatbot/officer/generate-report', data: {
      if (status != null) 'status': status,
      if (locationCode != null) 'locationCode': locationCode,
      if (category != null) 'category': category,
      if (groupId != null) 'groupId': groupId,
    });
    return (raw as Map).cast<String, dynamic>();
  }

  /// Streaming ask (SSE)
  Stream<String> askStream(String question) async* {
    // API Client của mình thường dùng Dio và có envelope xử lý chung.
    // SSE cần HTTP client hỗ trợ stream raw.
    final baseUrl = AppConfig.apiBaseUrl;
    final url = Uri.parse('$baseUrl/chatbot/ask/stream');
    
    final request = http.Request('POST', url);
    request.headers['Content-Type'] = 'application/json';
    request.body = jsonEncode({'question': question});

    final response = await request.send();
    
    if (response.statusCode != 200) {
      yield 'Lỗi kết nối server (${response.statusCode})';
      return;
    }

    await for (final line in response.stream.transform(utf8.decoder).transform(const LineSplitter())) {
      if (line.startsWith('data: ')) {
        final data = line.substring(6).trim();
        if (data == '[DONE]') break;
        
        try {
          final decoded = jsonDecode(data);
          if (decoded is String) {
            yield decoded;
          } else if (decoded is Map && decoded.containsKey('text')) {
            yield decoded['text'];
          }
        } catch (_) {
          // Bỏ qua nếu data không phải JSON hợp lệ (ví dụ text thô)
          if (!data.startsWith('{')) yield data;
        }
      }
    }
  }
}
