import 'package:isar/isar.dart';
import 'dart:convert';
import 'package:mobile_app_fluter/models/conversation_summary.dart';
import 'package:mobile_app_fluter/models/message_item.dart';

part 'isar_entities.g.dart';

@collection
class ConversationEntity {
  Id id = Isar.autoIncrement;

  @Index(unique: true, replace: true)
  late String conversationId;

  late String data; // JSON string of ConversationSummary
  
  @Index()
  late DateTime updatedAt;

  // Helper method
  ConversationSummary toModel() {
    return ConversationSummary.fromJson(jsonDecode(data));
  }

  static ConversationEntity fromModel(ConversationSummary model) {
    final entity = ConversationEntity()
      ..conversationId = model.conversationId
      ..data = jsonEncode(model.toJson());
      
    final date = model.updatedAtDate;
    entity.updatedAt = date ?? DateTime.now();
    return entity;
  }
}

@collection
class MessageEntity {
  Id id = Isar.autoIncrement;

  @Index(unique: true, replace: true)
  late String messageId;

  @Index()
  late String conversationId;

  late String data; // JSON string of MessageItem

  @Index()
  late DateTime sentAt;

  @Index()
  late bool isPending;

  // Helper method
  MessageItem toModel() {
    return MessageItem.fromJson(jsonDecode(data)).copyWith(isPending: isPending);
  }

  static MessageEntity fromModel(MessageItem model) {
    final entity = MessageEntity()
      ..messageId = model.id
      ..conversationId = model.conversationId
      ..data = jsonEncode(model.toJson())
      ..isPending = model.isPending;
      
    final date = model.sentAtDate;
    entity.sentAt = date ?? DateTime.now();
    return entity;
  }
}
