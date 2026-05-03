import "../core/network/api_client.dart";
import "../core/network/api_exception.dart";
import "../models/conversation_summary.dart";
import "../models/message_item.dart";
import "../models/paginated_result.dart";
import "local_cache_service.dart";

const Object _unsetConversationPreference = Object();

class ConversationService {
  const ConversationService({required ApiClient apiClient})
      : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<PaginatedResult<ConversationSummary>> listConversations({
    String? q,
    bool? isGroup,
    bool? unreadOnly,
    bool? includeArchived,
    String? cursor,
    int? limit,
  }) async {
    final raw = await _apiClient.getPaginated(
      "/conversations",
      queryParameters: {
        if (q != null && q.trim().isNotEmpty) "q": q.trim(),
        if (isGroup != null) "isGroup": isGroup,
        if (unreadOnly != null) "unreadOnly": unreadOnly,
        if (includeArchived != null) "includeArchived": includeArchived,
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor.trim(),
        if (limit != null) "limit": limit,
      },
    );
    return PaginatedResult.fromRaw(raw, ConversationSummary.fromJson);
  }

  Future<List<ConversationSummary>> listDirectRequests({
    String? direction,
    String? status,
    String? cursor,
    int? limit,
  }) async {
    final raw = await _apiClient.get(
      "/conversations/direct-requests",
      queryParameters: {
        if (direction != null && direction.trim().isNotEmpty)
          "direction": direction.trim(),
        if (status != null && status.trim().isNotEmpty) "status": status.trim(),
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor.trim(),
        if (limit != null) "limit": limit,
      },
    );
    return (raw as List)
        .map((item) =>
            ConversationSummary.fromJson((item as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<MessageItem> sendDirectMessage({
    required String recipientUserId,
    required String content,
    required String clientMessageId,
    String type = "TEXT",
    String? attachmentKey,
    String? attachmentUrl,
    String? replyTo,
  }) async {
    final raw = await _apiClient.post(
      "/conversations/direct",
      data: {
        "recipientUserId": recipientUserId,
        "content": content,
        "clientMessageId": clientMessageId,
        "type": type,
        if (attachmentKey != null) "attachmentKey": attachmentKey,
        if (attachmentUrl != null) "attachmentUrl": attachmentUrl,
        if (replyTo != null) "replyTo": replyTo,
      },
    );
    return MessageItem.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ConversationSummary> createDirectRequest({
    required String recipientUserId,
    required String content,
    required String clientMessageId,
  }) async {
    final raw = await _apiClient.post(
      "/conversations/direct-requests",
      data: {
        "recipientUserId": recipientUserId,
        "content": content,
        "clientMessageId": clientMessageId,
      },
    );
    return ConversationSummary.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ConversationSummary> acceptDirectRequest(String conversationId) async {
    final raw = await _apiClient.post(
      "/conversations/direct-requests/${Uri.encodeComponent(conversationId)}/accept",
    );
    return ConversationSummary.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ConversationSummary> ignoreDirectRequest(String conversationId) async {
    final raw = await _apiClient.post(
      "/conversations/direct-requests/${Uri.encodeComponent(conversationId)}/ignore",
    );
    return ConversationSummary.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ConversationSummary> rejectDirectRequest(String conversationId) async {
    final raw = await _apiClient.post(
      "/conversations/direct-requests/${Uri.encodeComponent(conversationId)}/reject",
    );
    return ConversationSummary.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ConversationSummary> blockDirectRequest(String conversationId) async {
    final raw = await _apiClient.post(
      "/conversations/direct-requests/${Uri.encodeComponent(conversationId)}/block",
    );
    return ConversationSummary.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<PaginatedResult<MessageItem>> listMessages(
    String conversationId, {
    int limit = 100,
    String? before,
    String? after,
    String? q,
    String? type,
    String? fromUserId,
    String? cursor,
  }) async {
    final raw = await _apiClient.getPaginated(
      "/conversations/${Uri.encodeComponent(conversationId)}/messages",
      queryParameters: {
        "limit": limit,
        if (before != null) "before": before,
        if (after != null) "after": after,
        if (q != null && q.trim().isNotEmpty) "q": q.trim(),
        if (type != null && type.trim().isNotEmpty) "type": type.trim(),
        if (fromUserId != null && fromUserId.trim().isNotEmpty)
          "fromUserId": fromUserId.trim(),
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor.trim(),
      },
    );
    return PaginatedResult.fromRaw(raw, MessageItem.fromJson);
  }

  Future<List<Map<String, dynamic>>> listConversationAuditEvents(
    String conversationId,
  ) async {
    final raw = await _apiClient.get(
      "/conversations/${Uri.encodeComponent(conversationId)}/audit",
    );
    return (raw as List)
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<ConversationSummary> updateConversationPreferences(
    String conversationId, {
    bool? isPinned,
    bool? archived,
    Object? mutedUntil = _unsetConversationPreference,
  }) async {
    final raw = await _apiClient.patch(
      "/conversations/${Uri.encodeComponent(conversationId)}/preferences",
      data: {
        if (isPinned != null) "isPinned": isPinned,
        if (archived != null) "archived": archived,
        if (mutedUntil != _unsetConversationPreference) "mutedUntil": mutedUntil,
      },
    );
    return ConversationSummary.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<MessageItem> sendMessage(
    String conversationId, {
    required String content,
    required String clientMessageId,
    String type = "TEXT",
    String? attachmentKey,
    String? attachmentUrl,
    String? replyTo,
  }) async {
    try {
      final raw = await _apiClient.post(
        "/conversations/${Uri.encodeComponent(conversationId)}/messages",
        data: {
          "content": content,
          "clientMessageId": clientMessageId,
          "type": type,
          if (attachmentKey != null) "attachmentKey": attachmentKey,
          if (attachmentUrl != null) "attachmentUrl": attachmentUrl,
          if (replyTo != null) "replyTo": replyTo,
        },
      );
      return MessageItem.fromJson((raw as Map).cast<String, dynamic>());
    } catch (e) {
      if (e is ApiException && e.statusCode != null && e.statusCode! < 500) {
        rethrow;
      }
      final pendingMessage = MessageItem(
        id: clientMessageId,
        conversationId: conversationId,
        senderId: "pending",
        senderName: "Me",
        type: type,
        content: content,
        sentAt: DateTime.now().toUtc().toIso8601String(),
        attachmentUrl: attachmentUrl,
        attachmentKey: attachmentKey,
        isPending: true,
      );
      await LocalCacheService.instance.savePendingMessage(pendingMessage.toJson());
      return pendingMessage;
    }
  }

  Future<MessageItem> updateMessage(
    String conversationId,
    String messageId, {
    String? content,
    String? attachmentKey,
    String? attachmentUrl,
  }) async {
    final raw = await _apiClient.patch(
      "/conversations/${Uri.encodeComponent(conversationId)}/messages/${Uri.encodeComponent(messageId)}",
      data: {
        if (content != null) "content": content,
        if (attachmentKey != null) "attachmentKey": attachmentKey,
        if (attachmentUrl != null) "attachmentUrl": attachmentUrl,
      },
    );
    return MessageItem.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<Map<String, dynamic>> recallMessage(
    String conversationId,
    String messageId, {
    String scope = "EVERYONE",
  }) async {
    final raw = await _apiClient.post(
      "/conversations/${Uri.encodeComponent(conversationId)}/messages/${Uri.encodeComponent(messageId)}/recall",
      data: {"scope": scope},
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<List<MessageItem>> forwardMessage(
    String conversationId,
    String messageId, {
    required List<String> targetConversationIds,
  }) async {
    final raw = await _apiClient.post(
      "/conversations/${Uri.encodeComponent(conversationId)}/messages/${Uri.encodeComponent(messageId)}/forward",
      data: {"conversationIds": targetConversationIds},
    );
    return (raw as List)
        .map((item) => MessageItem.fromJson((item as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<void> deleteMessage(String conversationId, String messageId) async {
    await _apiClient.delete(
      "/conversations/${Uri.encodeComponent(conversationId)}/messages/${Uri.encodeComponent(messageId)}",
    );
  }

  Future<void> deleteConversation(String conversationId) async {
    await _apiClient.delete(
      "/conversations/${Uri.encodeComponent(conversationId)}",
    );
  }

  Future<Map<String, dynamic>> clearConversationHistory(
    String conversationId,
  ) async {
    final raw = await _apiClient.post(
      "/conversations/${Uri.encodeComponent(conversationId)}/clear",
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<ConversationSummary> markConversationAsRead(String conversationId) async {
    final raw = await _apiClient.post(
      "/conversations/${Uri.encodeComponent(conversationId)}/read",
    );
    return ConversationSummary.fromJson((raw as Map).cast<String, dynamic>());
  }
}
