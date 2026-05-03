import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/models/chat_models.dart';
import '../../providers/api_providers.dart';
import '../../core/socket_client.dart';

class ChatDetailState {
  final List<MessageItem> messages; // Kept in newest-first order
  final Map<String, List<String>> reactions; // messageId -> list of emojis
  final MessageItem? replyingTo;
  final bool isLoading;
  final String? error;
  final bool isSending;

  ChatDetailState({
    this.messages = const [],
    this.reactions = const {},
    this.replyingTo,
    this.isLoading = false,
    this.error,
    this.isSending = false,
  });

  ChatDetailState copyWith({
    List<MessageItem>? messages,
    Map<String, List<String>>? reactions,
    MessageItem? replyingTo,
    bool? isLoading,
    String? error,
    bool? isSending,
    bool clearReplyingTo = false,
  }) {
    return ChatDetailState(
      messages: messages ?? this.messages,
      reactions: reactions ?? this.reactions,
      replyingTo: clearReplyingTo ? null : (replyingTo ?? this.replyingTo),
      isLoading: isLoading ?? this.isLoading,
      error: error,
      isSending: isSending ?? this.isSending,
    );
  }
}

class ChatDetailController extends StateNotifier<ChatDetailState> {
  final Ref ref;
  final String conversationId;

  ChatDetailController(this.ref, this.conversationId) : super(ChatDetailState()) {
    fetchMessages();
    
    // Binding socket listeners could also happen here or globally
    SocketClient().on('MESSAGE_CREATED', _onMessageCreated);
  }

  @override
  void dispose() {
    SocketClient().off('MESSAGE_CREATED', _onMessageCreated);
    super.dispose();
  }

  void _onMessageCreated(dynamic payload) {
    if (payload == null) return;
    
    // We expect payload to possess a 'message' or be the message item
    final messageData = payload['message'] ?? payload;
    
    // Verify it belongs to this conversation (if backend sends conversationId check it. The old RN app checks if message belongs to thread)
    // Assume we parse it 
    try {
      final newMessage = MessageItem.fromJson(messageData);
      
      // If we are newest-first, we insert at the beginning (index 0)
      if (!state.messages.any((m) => m.id == newMessage.id)) {
        state = state.copyWith(messages: [newMessage, ...state.messages]);
      }
    } catch (e) {
      // Decode error
    }
  }

  Future<void> fetchMessages() async {
    if (state.isLoading) return;
    state = state.copyWith(isLoading: true, error: null);
    try {
      final api = ref.read(chatApiProvider);
      final data = await api.listMessages(conversationId);
      
      // Filter out reactions
      final List<MessageItem> actualMessages = [];
      final Map<String, List<String>> newReactions = {...state.reactions};
      
      for (final msg in data) {
        if (msg.reactionEmoji != null && msg.targetMessageId != null) {
          final target = msg.targetMessageId!;
          newReactions[target] ??= [];
          if (!newReactions[target]!.contains(msg.reactionEmoji!)) {
            newReactions[target]!.add(msg.reactionEmoji!);
          }
        } else {
          actualMessages.add(msg);
        }
      }
      
      state = state.copyWith(messages: actualMessages, reactions: newReactions, isLoading: false);
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  void setReplyingTo(MessageItem? msg) {
    state = state.copyWith(replyingTo: msg, clearReplyingTo: msg == null);
  }

  Future<bool> reactToMessage(String messageId, String emoji) async {
    final api = ref.read(chatApiProvider);
    try {
      // Optimistic
      final newReactions = Map<String, List<String>>.from(state.reactions);
      newReactions[messageId] ??= [];
      if (!newReactions[messageId]!.contains(emoji)) {
        newReactions[messageId]!.add(emoji);
        state = state.copyWith(reactions: newReactions);
      }

      await api.sendMessage(
        conversationId,
        content: '{"kind":"REACTION","emoji":"$emoji","targetMessageId":"$messageId"}',
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> sendMediaMessage({
    required String fileName,
    required String contentType,
    required Uint8List bytes,
    required String type, // "IMAGE", "VIDEO", "DOC", "AUDIO"
  }) async {
    state = state.copyWith(isSending: true);
    try {
      final api = ref.read(chatApiProvider);
      
      // 1. Upload
      final attachmentKey = await api.uploadMedia(
        conversationId: conversationId,
        fileName: fileName,
        contentType: contentType,
        bytes: bytes,
      );
      
      if (attachmentKey == null) throw Exception("Failed to upload media");

      // 2. Send Message
      final replyId = state.replyingTo?.id;
      final newMessage = await api.sendMessage(
        conversationId,
        content: '', // Media messages might not have text initially
        replyTo: replyId,
        attachmentKey: attachmentKey,
        type: type,
      );
      
      if (newMessage != null) {
        if (!state.messages.any((m) => m.id == newMessage.id)) {
          state = state.copyWith(
            messages: [newMessage, ...state.messages],
            isSending: false,
            clearReplyingTo: true,
          );
        } else {
          state = state.copyWith(isSending: false, clearReplyingTo: true);
        }
      } else {
         state = state.copyWith(isSending: false, clearReplyingTo: true);
      }
      await fetchMessages();
      return true;
    } catch (e) {
      state = state.copyWith(isSending: false, error: 'Cannot send media: $e');
      return false;
    }
  }

  Future<bool> sendVoiceMessage({
    required String fileName,
    required Uint8List bytes,
  }) async {
    return sendMediaMessage(
      fileName: fileName,
      contentType: 'audio/m4a',
      bytes: bytes,
      type: 'AUDIO',
    );
  }

  Future<bool> sendLocationMessage(double lat, double lng) async {
    state = state.copyWith(isSending: true);
    try {
      final api = ref.read(chatApiProvider);
      final text = 'Vị trí hiện tại: https://maps.google.com/?q=$lat,$lng';
      
      final newMessage = await api.sendMessage(
        conversationId,
        content: text,
      );
      
      if (newMessage != null) {
        state = state.copyWith(
          messages: [newMessage, ...state.messages],
          isSending: false,
        );
      }
      await fetchMessages();
      return true;
    } catch (e) {
      state = state.copyWith(isSending: false, error: 'Cannot send location: $e');
      return false;
    }
  }

  Future<bool> sendMessage(String text) async {
    if (text.trim().isEmpty) return false;
    
    state = state.copyWith(isSending: true);
    try {
      final api = ref.read(chatApiProvider);
      final replyId = state.replyingTo?.id;
      final newMessage = await api.sendMessage(
        conversationId,
        content: text.trim(),
        replyTo: replyId,
      );
      
      if (newMessage != null) {
        if (!state.messages.any((m) => m.id == newMessage.id)) {
          state = state.copyWith(
            messages: [newMessage, ...state.messages],
            isSending: false,
            clearReplyingTo: true,
          );
        } else {
          state = state.copyWith(isSending: false, clearReplyingTo: true);
        }
      } else {
         state = state.copyWith(isSending: false, clearReplyingTo: true);
      }
      await fetchMessages();
      return true;
    } catch (e) {
      state = state.copyWith(isSending: false, error: 'Cannot send message: $e');
      return false;
    }
  }

  Future<void> recallMessage(String messageId) async {
    final api = ref.read(chatApiProvider);
    
    // Optimistic UI update
    final msgIndex = state.messages.indexWhere((m) => m.id == messageId);
    if (msgIndex != -1) {
      final updatedList = List<MessageItem>.from(state.messages);
      final oldMsg = updatedList[msgIndex];
      // Note: Dart models might be immutable but we lack copyWith on MessageItem yet, so let's recreate it
      updatedList[msgIndex] = MessageItem(
        id: oldMsg.id,
        content: oldMsg.content,
        type: oldMsg.type,
        senderId: oldMsg.senderId,
        senderName: oldMsg.senderName,
        createdAt: oldMsg.createdAt,
        isRecalled: true,
      );
      state = state.copyWith(messages: updatedList);
    }
    
    // API Call
    final success = await api.recallMessage(conversationId, messageId);
    if (!success) {
      // Revert if failed (or just leave it if backend takes time)
    }
  }
}

// Pass conversationId to the family provider to create distinct channels!
final chatDetailProvider = StateNotifierProvider.family<ChatDetailController, ChatDetailState, String>((ref, conversationId) {
  return ChatDetailController(ref, conversationId);
});
