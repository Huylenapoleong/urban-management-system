class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.content,
    required this.type,
    required this.sentAt,
    this.isOptimistic = false,
  });

  final String id;
  final String senderId;
  final String senderName;
  final String content;
  final String type;
  final DateTime sentAt;
  final bool isOptimistic;

  factory ChatMessage.fromMap(Map<String, dynamic> map) {
    return ChatMessage(
      id: (map['id'] ?? map['messageId'] ?? '').toString(),
      senderId: (map['senderId'] ?? '').toString(),
      senderName: (map['senderName'] ?? 'User').toString(),
      content: (map['content'] ?? '').toString(),
      type: (map['type'] ?? 'TEXT').toString(),
      sentAt: DateTime.tryParse((map['sentAt'] ?? map['createdAt'] ?? '').toString()) ?? DateTime.now(),
      isOptimistic: map['isOptimistic'] == true,
    );
  }

  ChatMessage copyWith({
    String? id,
    String? senderId,
    String? senderName,
    String? content,
    String? type,
    DateTime? sentAt,
    bool? isOptimistic,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      senderId: senderId ?? this.senderId,
      senderName: senderName ?? this.senderName,
      content: content ?? this.content,
      type: type ?? this.type,
      sentAt: sentAt ?? this.sentAt,
      isOptimistic: isOptimistic ?? this.isOptimistic,
    );
  }
}
