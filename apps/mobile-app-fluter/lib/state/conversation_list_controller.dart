import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/models/chat_models.dart';
import '../../providers/api_providers.dart';

class ConversationListState {
  final List<ConversationSummary> conversations;
  final bool isLoading;
  final String? error;

  ConversationListState({
    this.conversations = const [],
    this.isLoading = false,
    this.error,
  });

  ConversationListState copyWith({
    List<ConversationSummary>? conversations,
    bool? isLoading,
    String? error,
  }) {
    return ConversationListState(
      conversations: conversations ?? this.conversations,
      isLoading: isLoading ?? this.isLoading,
      error: error, // overwrite with null explicitly if not provided? Or we can just use error: error ?? this.error
    );
  }
}

class ConversationListController extends StateNotifier<ConversationListState> {
  final Ref ref;

  ConversationListController(this.ref) : super(ConversationListState()) {
    fetchConversations();
  }

  Future<void> fetchConversations() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final api = ref.read(chatApiProvider);
      final data = await api.listConversations();
      state = state.copyWith(conversations: data, isLoading: false);
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  void updateConversationFromSocket(Map<String, dynamic> payload) {
    // Handling real-time incoming message adjusting the conversation list snippet
    // Normally we re-call API, or we optimistic update the list snippet
    fetchConversations();
  }
}

final conversationListProvider = StateNotifierProvider<ConversationListController, ConversationListState>((ref) {
  return ConversationListController(ref);
});
