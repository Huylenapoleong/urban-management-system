import 'dart:typed_data';

import 'package:dio/dio.dart';
import '../models/chat_models.dart';

class ChatApi {
  final Dio _dio;

  ChatApi(this._dio);

  Future<List<ConversationSummary>> listConversations({
    String? q,
    bool? isGroup,
    bool? unreadOnly,
    int? limit = 20,
  }) async {
    final response = await _dio.get('/api/conversations', queryParameters: {
      if (q != null && q.isNotEmpty) 'q': q,
      if (isGroup != null) 'isGroup': isGroup,
      if (unreadOnly != null) 'unreadOnly': unreadOnly,
      if (limit != null) 'limit': limit,
    });

    final data = response.data['data'] as List?;
    if (data == null) return [];
    return data.map((e) => ConversationSummary.fromJson(e)).toList();
  }

  Future<List<MessageItem>> listMessages(
    String conversationId, {
    String? before,
    int? limit = 20,
  }) async {
    final response = await _dio.get(
      '/api/conversations/${Uri.encodeComponent(conversationId)}/messages',
      queryParameters: {
        if (before != null) 'before': before,
        if (limit != null) 'limit': limit,
      },
    );

    final data = response.data['data'] as List?;
    if (data == null) return [];
    return data.map((e) => MessageItem.fromJson(e)).toList();
  }
  Future<MessageItem?> sendMessage(
    String conversationId, {
    required String content,
    String? replyTo,
    String? attachmentKey,
    String type = 'TEXT',
  }) async {
    final response = await _dio.post(
      '/api/conversations/${Uri.encodeComponent(conversationId)}/messages',
      data: {
        'content': content,
        'type': type,
        'clientMessageId': '${DateTime.now().millisecondsSinceEpoch}',
        if (replyTo != null) 'replyTo': replyTo,
        if (attachmentKey != null) 'attachmentKey': attachmentKey,
      },
    );

    final data = response.data['data'];
    if (data == null) return null;
    return MessageItem.fromJson(data);
  }

  Future<bool> recallMessage(String conversationId, String messageId) async {
    try {
      await _dio.post(
        '/api/conversations/${Uri.encodeComponent(conversationId)}/messages/${Uri.encodeComponent(messageId)}/recall',
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<String?> uploadMedia({
    required String conversationId,
    required String fileName,
    required String contentType,
    required Uint8List bytes,
  }) async {
    try {
      final formData = FormData.fromMap({
        'target': 'MESSAGE',
        'entityId': conversationId,
        'file': MultipartFile.fromBytes(
          bytes,
          filename: fileName,
          contentType: DioMediaType.parse(contentType),
        ),
      });

      final uploadRes = await _dio.post(
        '/api/uploads/media',
        data: formData,
        options: Options(
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        ),
      );

      final payload = uploadRes.data['data'];
      if (payload == null || payload is! Map<String, dynamic>) {
        return null;
      }

      final key = payload['key']?.toString();
      if (key == null || key.isEmpty) {
        return null;
      }

      return key;
    } catch (e) {
      return null;
    }
  }
}
