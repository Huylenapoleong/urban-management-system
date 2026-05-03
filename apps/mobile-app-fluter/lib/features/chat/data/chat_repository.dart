import '../../../core/network/api_client.dart';
import '../models/chat_message.dart';
import '../models/conversation.dart';

class ChatRepository {
  ChatRepository(this._api);

  final ApiClient _api;

  Future<List<Conversation>> getConversations({String? query}) async {
    final data = await _api.get('/conversations', queryParameters: {
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
    });

    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(Conversation.fromMap)
        .toList();
  }

  Future<List<ChatMessage>> getMessages(
    String conversationId, {
    int limit = 30,
  }) async {
    final data = await _api.get(
      '/conversations/${Uri.encodeComponent(conversationId)}/messages',
      queryParameters: {'limit': limit.toString()},
    );

    if (data is! List) return const [];

    final messages = data
        .whereType<Map<String, dynamic>>()
        .map(ChatMessage.fromMap)
        .toList();

    messages.sort((a, b) => b.sentAt.compareTo(a.sentAt));
    return messages;
  }

  Future<ChatMessage?> sendTextMessage({
    required String conversationId,
    required String content,
    required String clientMessageId,
  }) async {
    final data = await _api.post(
      '/conversations/${Uri.encodeComponent(conversationId)}/messages',
      data: {
        'content': content,
        'type': 'TEXT',
        'clientMessageId': clientMessageId,
      },
    );

    if (data is! Map<String, dynamic>) return null;
    return ChatMessage.fromMap(data);
  }
}
