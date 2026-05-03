import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/chat/models/chat_message.dart';
import '../../../features/chat/models/conversation.dart';
import '../../../state/providers.dart';

final conversationQueryProvider = StateProvider<String>((ref) => '');
final conversationFilterProvider = StateProvider<String>((ref) => 'all');
final chatRefreshTickProvider = StateProvider<int>((ref) => 0);

final conversationsProvider = FutureProvider.autoDispose<List<Conversation>>((ref) async {
  final repo = ref.watch(chatRepositoryProvider);
  final query = ref.watch(conversationQueryProvider);
  return repo.getConversations(query: query);
});

final chatMessagesProvider =
    FutureProvider.autoDispose.family<List<ChatMessage>, String>((ref, conversationId) async {
  ref.watch(chatRefreshTickProvider);
  final repo = ref.watch(chatRepositoryProvider);
  return repo.getMessages(conversationId, limit: 40);
});
