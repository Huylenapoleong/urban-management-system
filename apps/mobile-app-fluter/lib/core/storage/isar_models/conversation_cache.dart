import "package:isar/isar.dart";

part "conversation_cache.g.dart";

@collection
class ConversationCache {
  Id id = Isar.autoIncrement;

  @Index(unique: true, replace: true)
  late String conversationId;

  late String groupName;
  late bool isGroup;
  late bool isPinned;

  String? lastMessagePreview;
  String? lastSenderName;
  String? mutedUntil;
  String? requestStatus;

  late int unreadCount;
  late String updatedAt;
}
