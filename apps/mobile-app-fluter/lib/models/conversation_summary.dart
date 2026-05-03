import "media_asset.dart";

class ConversationSummary {
  const ConversationSummary({
    required this.conversationId,
    required this.groupName,
    required this.unreadCount,
    required this.isGroup,
    required this.updatedAt,
    this.lastMessagePreview,
    this.lastSenderName,
    this.isPinned = false,
    this.mutedUntil,
    this.requestStatus,
    this.requestDirection,
    this.avatarUrl,
    this.peerAvatarUrl,
    this.groupAvatarUrl,
    this.avatarAsset,
    this.archivedAt,
  });

  ConversationSummary copyWith({
    String? conversationId,
    String? groupName,
    int? unreadCount,
    bool? isGroup,
    String? updatedAt,
    String? lastMessagePreview,
    String? lastSenderName,
    bool? isPinned,
    String? mutedUntil,
    String? requestStatus,
    String? requestDirection,
    String? avatarUrl,
    String? peerAvatarUrl,
    String? groupAvatarUrl,
    MediaAsset? avatarAsset,
    String? archivedAt,
  }) {
    return ConversationSummary(
      conversationId: conversationId ?? this.conversationId,
      groupName: groupName ?? this.groupName,
      unreadCount: unreadCount ?? this.unreadCount,
      isGroup: isGroup ?? this.isGroup,
      updatedAt: updatedAt ?? this.updatedAt,
      lastMessagePreview: lastMessagePreview ?? this.lastMessagePreview,
      lastSenderName: lastSenderName ?? this.lastSenderName,
      isPinned: isPinned ?? this.isPinned,
      mutedUntil: mutedUntil ?? this.mutedUntil,
      requestStatus: requestStatus ?? this.requestStatus,
      requestDirection: requestDirection ?? this.requestDirection,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      peerAvatarUrl: peerAvatarUrl ?? this.peerAvatarUrl,
      groupAvatarUrl: groupAvatarUrl ?? this.groupAvatarUrl,
      avatarAsset: avatarAsset ?? this.avatarAsset,
      archivedAt: archivedAt ?? this.archivedAt,
    );
  }

  final String conversationId;
  final String groupName;
  final String? lastMessagePreview;
  final String? lastSenderName;
  final int unreadCount;
  final bool isGroup;
  final String updatedAt;
  final bool isPinned;
  final String? mutedUntil;
  final String? requestStatus;
  final String? requestDirection;
  final String? avatarUrl;
  final String? peerAvatarUrl;
  final String? groupAvatarUrl;
  final MediaAsset? avatarAsset;
  final String? archivedAt;

  factory ConversationSummary.fromJson(Map<String, dynamic> json) {
    final avatarAssetRaw = json["avatarAsset"];
    return ConversationSummary(
      conversationId: (json["conversationId"] ?? "").toString(),
      groupName: (json["groupName"] ?? "Conversation").toString(),
      lastMessagePreview: json["lastMessagePreview"]?.toString(),
      lastSenderName: json["lastSenderName"]?.toString(),
      unreadCount: _parseInt(json["unreadCount"]),
      isGroup: json["isGroup"] == true,
      updatedAt: (json["updatedAt"] ?? "").toString(),
      isPinned: json["isPinned"] == true,
      mutedUntil: json["mutedUntil"]?.toString(),
      requestStatus: json["requestStatus"]?.toString(),
      requestDirection: json["requestDirection"]?.toString(),
      avatarUrl: json["avatarUrl"]?.toString(),
      peerAvatarUrl: json["peerAvatarUrl"]?.toString(),
      groupAvatarUrl: json["groupAvatarUrl"]?.toString(),
      avatarAsset: avatarAssetRaw is Map<String, dynamic>
          ? MediaAsset.fromJson(avatarAssetRaw)
          : null,
      archivedAt: json["archivedAt"]?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      "conversationId": conversationId,
      "groupName": groupName,
      "lastMessagePreview": lastMessagePreview,
      "lastSenderName": lastSenderName,
      "unreadCount": unreadCount,
      "isGroup": isGroup,
      "updatedAt": updatedAt,
      "isPinned": isPinned,
      "mutedUntil": mutedUntil,
      "requestStatus": requestStatus,
      "requestDirection": requestDirection,
      "avatarUrl": avatarUrl,
      "peerAvatarUrl": peerAvatarUrl,
      "groupAvatarUrl": groupAvatarUrl,
    };
  }

  static int _parseInt(dynamic raw) {
    if (raw is int) {
      return raw;
    }
    return int.tryParse("$raw") ?? 0;
  }

  String get title {
    if (groupName.trim().isNotEmpty) {
      return groupName.trim();
    }
    return "Conversation";
  }

  DateTime? get updatedAtDate => DateTime.tryParse(updatedAt);

  bool get isMuted {
    final muted = mutedUntil;
    if (muted == null || muted.trim().isEmpty) {
      return false;
    }
    final mutedAt = DateTime.tryParse(muted);
    return mutedAt != null && mutedAt.isAfter(DateTime.now());
  }

  bool get pendingBadge {
    if ((requestStatus ?? "").toUpperCase() == "PENDING") {
      return true;
    }
    return unreadCount > 0;
  }

  String get statusBadgeLabel => pendingBadge ? "Pending" : "Resolved";

  String? getPeerId(String? currentUserId) {
    if (isGroup) return null;
    if (conversationId.startsWith("dm:")) {
      return conversationId.substring(3);
    }
    if (conversationId.startsWith("DM#")) {
      final parts = conversationId.substring(3).split("#");
      if (parts.length >= 2 && currentUserId != null) {
        return parts[0] == currentUserId ? parts[1] : parts[0];
      } else if (parts.length >= 2) {
        return parts[0];
      }
      return conversationId.substring(3);
    }
    return null;
  }

  String? get groupId {
    if (!isGroup) return null;
    if (conversationId.startsWith("group:")) {
      return conversationId.substring(6);
    }
    if (conversationId.startsWith("GRP#")) {
      return conversationId.substring(4);
    }
    return null;
  }
}
