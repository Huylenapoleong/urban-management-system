import 'dart:convert';

class ConversationSummary {
  final String id;
  final bool isGroup;
  final String title;
  final String? subtitle;
  final String? peerAvatarUrl;
  final String? groupAvatarUrl;
  final DateTime? updatedAt;

  ConversationSummary({
    required this.id,
    required this.isGroup,
    required this.title,
    this.subtitle,
    this.peerAvatarUrl,
    this.groupAvatarUrl,
    this.updatedAt,
  });

  factory ConversationSummary.fromJson(Map<String, dynamic> json) {
    return ConversationSummary(
      id: json['conversationId']?.toString() ?? json['id']?.toString() ?? '',
      isGroup: json['isGroup'] == true || json['conversationType'] == 'GROUP',
      title: json['title']?.toString() ?? json['peerName']?.toString() ?? json['groupName']?.toString() ?? 'Unknown',
      subtitle: json['latestMessageSnippet']?.toString() ?? json['subtitle']?.toString(),
      peerAvatarUrl: json['peerAvatarUrl']?.toString(),
      groupAvatarUrl: json['groupAvatarUrl']?.toString(),
      updatedAt: json['updatedAt'] != null ? DateTime.tryParse(json['updatedAt']) : null,
    );
  }
}

class MessageItem {
  final String id;
  final String content;
  final String type;
  final String senderId;
  final String? senderName;
  final DateTime createdAt;
  final bool isRecalled;
  final String? reactionEmoji;
  final String? targetMessageId;
  final String? attachmentUrl;

  MessageItem({
    required this.id,
    required this.content,
    required this.type,
    required this.senderId,
    this.senderName,
    required this.createdAt,
    this.isRecalled = false,
    this.reactionEmoji,
    this.targetMessageId,
    this.attachmentUrl,
  });

  factory MessageItem.fromJson(Map<String, dynamic> json) {
    String? reactionEmoji;
    String? targetMessageId;

    String parseContent(dynamic raw) {
      if (raw == null) return '';
      if (raw is Map) {
        return raw['text']?.toString() ?? raw['content']?.toString() ?? raw.toString();
      }
      if (raw is String) {
        if (raw.startsWith('{') && raw.endsWith('}')) {
          try {
            final decoded = jsonDecode(raw);
            if (decoded is Map) {
              if (decoded['kind'] == 'REACTION') {
                reactionEmoji = decoded['emoji']?.toString();
                targetMessageId = decoded['targetMessageId']?.toString();
                return ''; // Reaction content is empty text
              }
              return decoded['text']?.toString() ?? decoded['content']?.toString() ?? raw;
            }
          } catch (_) {}
        }
        return raw;
      }
      return raw.toString();
    }

    final parsedContent = parseContent(json['content']);

    String? resolveAttachmentUrl(Map<String, dynamic> raw) {
      final direct = raw['attachmentUrl']?.toString();
      if (direct != null && direct.isNotEmpty) return direct;

      final attachmentAsset = raw['attachmentAsset'];
      if (attachmentAsset is Map<String, dynamic>) {
        final resolved = attachmentAsset['resolvedUrl']?.toString();
        if (resolved != null && resolved.isNotEmpty) return resolved;

        final key = attachmentAsset['key']?.toString();
        if (key != null && key.isNotEmpty) return key;
      }

      final legacy = raw['attachment_url']?.toString();
      if (legacy != null && legacy.isNotEmpty) return legacy;

      return null;
    }

    return MessageItem(
      id: json['id']?.toString() ?? '',
      content: parsedContent,
      type: json['textType']?.toString() ?? json['type']?.toString() ?? 'TEXT',
      senderId: json['senderId']?.toString() ?? '',
      senderName: json['senderName']?.toString() ?? json['sender']?['fullName']?.toString(),
      createdAt: json['sentAt'] != null 
        ? DateTime.parse(json['sentAt']) 
        : (json['createdAt'] != null ? DateTime.parse(json['createdAt']) : DateTime.now()),
      isRecalled: json['isDeleted'] == true || json['isRecalled'] == true,
      reactionEmoji: reactionEmoji,
      targetMessageId: targetMessageId ?? json['replyTo']?.toString(),
      attachmentUrl: resolveAttachmentUrl(json),
    );
  }
}
