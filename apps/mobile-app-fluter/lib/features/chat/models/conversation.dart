class Conversation {
  const Conversation({
    required this.id,
    required this.name,
    required this.lastMessagePreview,
    required this.unreadCount,
    required this.isGroup,
  });

  final String id;
  final String name;
  final String lastMessagePreview;
  final int unreadCount;
  final bool isGroup;

  factory Conversation.fromMap(Map<String, dynamic> map) {
    final id = (map['conversationId'] ?? map['id'] ?? '').toString();
    final rawType = (map['type'] ?? map['conversationType'] ?? '').toString().toUpperCase();
    final inferredGroup = id.startsWith('GRP#') || id.startsWith('group:');
    return Conversation(
      id: id,
      name: (map['groupName'] ?? map['lastSenderName'] ?? id).toString(),
      lastMessagePreview: (map['lastMessagePreview'] ?? '').toString(),
      unreadCount: (map['unreadCount'] is int)
          ? map['unreadCount'] as int
          : int.tryParse((map['unreadCount'] ?? '0').toString()) ?? 0,
      isGroup: rawType == 'GROUP' || inferredGroup,
    );
  }
}
