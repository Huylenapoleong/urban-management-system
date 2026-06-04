import "dart:convert";

import "media_asset.dart";

class MessageItem {
  const MessageItem({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.senderName,
    this.senderAvatarUrl,
    required this.type,
    required this.content,
    required this.sentAt,
    this.updatedAt,
    this.replyTo,
    this.deletedAt,
    this.recalledAt,
    this.attachmentUrl,
    this.attachmentKey,
    this.attachmentAsset,
    this.clientMessageId,
    this.isPending = false,
    this.deliveryState,
    this.recipientCount,
    this.deliveredCount,
    this.readByCount,
    this.lastReadAt,
  });

  MessageItem copyWith({
    String? id,
    String? conversationId,
    String? senderId,
    String? senderName,
    String? type,
    String? content,
    String? sentAt,
    String? updatedAt,
    String? replyTo,
    String? deletedAt,
    String? recalledAt,
    String? attachmentUrl,
    String? attachmentKey,
    MediaAsset? attachmentAsset,
    String? senderAvatarUrl,
    bool? isPending,
    String? clientMessageId,
    String? deliveryState,
    int? recipientCount,
    int? deliveredCount,
    int? readByCount,
    String? lastReadAt,
    // Add these purely for local UI override since contentText/resolvedAttachmentUrl use getters
    String? contentText,
    String? resolvedAttachmentUrl,
    bool? isDeleted,
  }) {
    // If the local override fields are provided, we should probably encode them
    // but the simplest way is to just let the model handle content, so we will update `content`
    // and `deletedAt` respectively.
    String finalContent = content ?? this.content;
    if (contentText != null) {
       finalContent = contentText; // A simplistic override for UI deletion
    }

    String? finalDeletedAt = deletedAt ?? this.deletedAt;
    if (isDeleted != null && isDeleted) {
       finalDeletedAt = DateTime.now().toUtc().toIso8601String();
    }

    return MessageItem(
      id: id ?? this.id,
      conversationId: conversationId ?? this.conversationId,
      senderId: senderId ?? this.senderId,
      senderName: senderName ?? this.senderName,
      senderAvatarUrl: senderAvatarUrl ?? this.senderAvatarUrl,
      type: type ?? this.type,
      content: finalContent,
      sentAt: sentAt ?? this.sentAt,
      updatedAt: updatedAt ?? this.updatedAt,
      replyTo: replyTo ?? this.replyTo,
      deletedAt: finalDeletedAt,
      recalledAt: recalledAt ?? this.recalledAt,
      attachmentUrl: attachmentUrl ?? this.attachmentUrl,
      attachmentKey: attachmentKey ?? this.attachmentKey,
      attachmentAsset: attachmentAsset ?? this.attachmentAsset,
      clientMessageId: clientMessageId ?? this.clientMessageId,
      isPending: isPending ?? this.isPending,
      deliveryState: deliveryState ?? this.deliveryState,
      recipientCount: recipientCount ?? this.recipientCount,
      deliveredCount: deliveredCount ?? this.deliveredCount,
      readByCount: readByCount ?? this.readByCount,
      lastReadAt: lastReadAt ?? this.lastReadAt,
    );
  }

  final String id;
  final String conversationId;
  final String senderId;
  final String senderName;
  final String? senderAvatarUrl;
  final String type;
  final String content;
  final String sentAt;
  final String? updatedAt;
  final String? replyTo;
  final String? deletedAt;
  final String? recalledAt;
  final String? attachmentUrl;
  final String? attachmentKey;
  final MediaAsset? attachmentAsset;
  final String? clientMessageId;
  final bool isPending;
  final String? deliveryState;
  final int? recipientCount;
  final int? deliveredCount;
  final int? readByCount;
  final String? lastReadAt;

  factory MessageItem.fromJson(Map<String, dynamic> json) {
    final assetRaw = json["attachmentAsset"];
    return MessageItem(
      id: (json["id"] ?? json["messageId"] ?? "").toString(),
      conversationId: (json["conversationId"] ?? "").toString(),
      senderId: (json["senderId"] ?? "").toString(),
      senderName: (json["senderName"] ?? "Unknown").toString(),
      senderAvatarUrl: json["senderAvatarUrl"]?.toString() ?? json["senderAvatar"]?.toString(),
      type: (json["type"] ?? "TEXT").toString(),
      content: (json["content"] ?? "").toString(),
      sentAt: (json["sentAt"] ?? json["createdAt"] ?? "").toString(),
      updatedAt: json["updatedAt"]?.toString(),
      replyTo: json["replyTo"]?.toString(),
      deletedAt: json["deletedAt"]?.toString(),
      recalledAt: json["recalledAt"]?.toString(),
      attachmentUrl: json["attachmentUrl"]?.toString(),
      attachmentKey: json["attachmentKey"]?.toString(),
      clientMessageId: json["clientMessageId"]?.toString(),
      attachmentAsset: assetRaw is Map<String, dynamic>
          ? MediaAsset.fromJson(assetRaw)
          : null,
      deliveryState: json["deliveryState"]?.toString(),
      recipientCount: json["recipientCount"] is int
          ? json["recipientCount"] as int
          : int.tryParse(json["recipientCount"]?.toString() ?? ""),
      deliveredCount: json["deliveredCount"] is int
          ? json["deliveredCount"] as int
          : int.tryParse(json["deliveredCount"]?.toString() ?? ""),
      readByCount: json["readByCount"] is int
          ? json["readByCount"] as int
          : int.tryParse(json["readByCount"]?.toString() ?? ""),
      lastReadAt: json["lastReadAt"]?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      "id": id,
      "conversationId": conversationId,
      "senderId": senderId,
      "senderName": senderName,
      "senderAvatarUrl": senderAvatarUrl,
      "type": type,
      "content": content,
      "sentAt": sentAt,
      "updatedAt": updatedAt,
      "replyTo": replyTo,
      "deletedAt": deletedAt,
      "recalledAt": recalledAt,
      "attachmentUrl": attachmentUrl,
      "attachmentKey": attachmentKey,
      "clientMessageId": clientMessageId,
      "deliveryState": deliveryState,
      "recipientCount": recipientCount,
      "deliveredCount": deliveredCount,
      "readByCount": readByCount,
      "lastReadAt": lastReadAt,
    };
  }

  String get contentText {
    final raw = content.trim();
    if (raw.isEmpty) {
      return "";
    }

    if (!raw.startsWith("{") && !raw.startsWith("[")) {
      return raw;
    }

    try {
      final parsed = jsonDecode(raw);
      if (parsed is Map) {
        final textValue = parsed["text"] ?? parsed["content"];
        if (textValue != null) {
          return "$textValue";
        }
      }
      return raw;
    } catch (_) {
      return raw;
    }
  }

  String? get resolvedAttachmentUrl {
    final raw = attachmentAsset?.resolvedUrl ??
        attachmentUrl ??
        attachmentAsset?.key ??
        attachmentKey;
    if (raw == null) {
      return null;
    }

    final value = raw.trim();
    if (value.isEmpty) {
      return null;
    }
    return value;
  }

  String get attachmentName {
    final fromAsset =
        attachmentAsset?.fileName ?? attachmentAsset?.originalFileName;
    if (fromAsset != null && fromAsset.trim().isNotEmpty) {
      return fromAsset.trim();
    }
    if (contentText.isNotEmpty) {
      return contentText;
    }
    return "Attachment";
  }

  bool get isDeleted => deletedAt != null || recalledAt != null;

  DateTime? get sentAtDate => DateTime.tryParse(sentAt);

  bool get isImage {
    if (type.toUpperCase() == "IMAGE") {
      return true;
    }
    final url = resolvedAttachmentUrl?.toLowerCase() ?? "";
    return url.endsWith(".jpg") ||
        url.endsWith(".jpeg") ||
        url.endsWith(".png") ||
        url.endsWith(".webp") ||
        url.endsWith(".gif");
  }

  bool get isVideo => type.toUpperCase() == "VIDEO";
  bool get isAudio => type.toUpperCase() == "AUDIO";
  bool get isDocument => type.toUpperCase() == "DOC";
}
