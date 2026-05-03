import 'dart:convert';
import 'package:isar/isar.dart';
import 'package:path_provider/path_provider.dart';
import 'package:mobile_app_fluter/models/isar_entities.dart';

class LocalCacheService {
  static final LocalCacheService instance = LocalCacheService._internal();
  LocalCacheService._internal();

  Isar? _isar;

  Future<Isar> get isar async {
    if (_isar != null && _isar!.isOpen) return _isar!;
    _isar = await _initDb();
    return _isar!;
  }

  Future<Isar> _initDb() async {
    final dir = await getApplicationDocumentsDirectory();
    return await Isar.open(
      [ConversationEntitySchema, MessageEntitySchema],
      directory: dir.path,
    );
  }

  Future<void> saveConversations(List<dynamic> conversations) async {
    final isarDb = await isar;
    
    final entities = conversations.map((c) {
      final entity = ConversationEntity()
        ..conversationId = c['conversationId'] ?? c['id'] ?? ''
        ..data = jsonEncode(c);
      
      final date = DateTime.tryParse(c['updatedAt']?.toString() ?? '');
      entity.updatedAt = date ?? DateTime.now();
      return entity;
    }).toList();

    await isarDb.writeTxn(() async {
      await isarDb.conversationEntitys.putAll(entities);
    });
  }

  Future<List<Map<String, dynamic>>> getConversations() async {
    final isarDb = await isar;
    final entities = await isarDb.conversationEntitys.where().sortByUpdatedAtDesc().findAll();
    return entities.map((e) => jsonDecode(e.data) as Map<String, dynamic>).toList();
  }

  Future<void> saveMessages(String conversationId, List<dynamic> messages) async {
    final isarDb = await isar;
    
    final entities = messages.map((m) {
      final entity = MessageEntity()
        ..messageId = m['id'] ?? m['messageId'] ?? ''
        ..conversationId = conversationId
        ..data = jsonEncode(m);
        
      final date = DateTime.tryParse((m['sentAt'] ?? m['createdAt'])?.toString() ?? '');
      entity.sentAt = date ?? DateTime.now();
      return entity;
    }).toList();

    await isarDb.writeTxn(() async {
      await isarDb.messageEntitys.putAll(entities);
    });
  }

  Future<List<Map<String, dynamic>>> getMessages(String conversationId) async {
    final isarDb = await isar;
    final entities = await isarDb.messageEntitys
        .filter()
        .conversationIdEqualTo(conversationId)
        .sortBySentAtDesc()
        .findAll();
    return entities.map((e) => jsonDecode(e.data) as Map<String, dynamic>).toList();
  }

  Future<void> savePendingMessage(Map<String, dynamic> message) async {
    final isarDb = await isar;
    final entity = MessageEntity()
      ..messageId = message['id'] ?? message['messageId'] ?? ''
      ..conversationId = message['conversationId'] ?? ''
      ..data = jsonEncode(message)
      ..isPending = true;

    final date = DateTime.tryParse((message['sentAt'] ?? message['createdAt'])?.toString() ?? '');
    entity.sentAt = date ?? DateTime.now();

    await isarDb.writeTxn(() async {
      await isarDb.messageEntitys.put(entity);
    });
  }

  Future<List<Map<String, dynamic>>> getPendingMessages() async {
    final isarDb = await isar;
    final entities = await isarDb.messageEntitys
        .filter()
        .isPendingEqualTo(true)
        .sortBySentAt()
        .findAll();
    return entities.map((e) => jsonDecode(e.data) as Map<String, dynamic>).toList();
  }

  Future<void> deleteMessage(String messageId) async {
    final isarDb = await isar;
    await isarDb.writeTxn(() async {
      await isarDb.messageEntitys.deleteByMessageId(messageId);
    });
  }
}
