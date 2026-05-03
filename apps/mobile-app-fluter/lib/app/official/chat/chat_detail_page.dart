import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../state/chat_detail_controller.dart';
import '../../../state/auth_controller.dart';
import '../../../core/models/chat_models.dart';

class OfficialChatDetailPage extends ConsumerStatefulWidget {
  final String conversationId;
  final String title;

  const OfficialChatDetailPage({
    super.key,
    required this.conversationId,
    required this.title,
  });

  @override
  ConsumerState<OfficialChatDetailPage> createState() => _OfficialChatDetailPageState();
}

class _OfficialChatDetailPageState extends ConsumerState<OfficialChatDetailPage> {
  final TextEditingController _textController = TextEditingController();

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    ref.read(chatDetailProvider(widget.conversationId).notifier).sendMessage(text);
    _textController.clear();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(chatDetailProvider(widget.conversationId));
    final currentUser = ref.watch(authControllerProvider).user;
    final currentUserId = currentUser?.id ?? '';
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline),
            onPressed: () {
              // Show group info or peer info
            },
          )
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: state.isLoading && state.messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : state.error != null && state.messages.isEmpty
                    ? Center(child: Text('Lỗi tải tin nhắn: ${state.error}', textAlign: TextAlign.center))
                    : state.messages.isEmpty
                        ? const Center(child: Text('Chưa có tin nhắn nào'))
                        : ListView.builder(
                            reverse: true, // Optimizes for Chat (Bottom-Up rendering)
                            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                            itemCount: state.messages.length,
                    itemBuilder: (context, index) {
                      final msg = state.messages[index];
                      final isMe = msg.senderId == currentUserId;
                      return _buildMessageBubble(msg, isMe, isDark);
                    },
                  ),
          ),
          
          // Chat Composer Area
          SafeArea(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    offset: const Offset(0, -1),
                    blurRadius: 4,
                  )
                ],
              ),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline, color: Color(0xFF2E5C94)),
                    onPressed: () {
                      // Attach Media
                    },
                  ),
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF2C2C2C) : Colors.grey[100],
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: TextField(
                        controller: _textController,
                        maxLines: 4,
                        minLines: 1,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _sendMessage(),
                        decoration: const InputDecoration(
                          hintText: 'Nhập tin nhắn...',
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: state.isSending ? null : _sendMessage,
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: const BoxDecoration(
                        color: Color(0xFF1F3E68),
                        shape: BoxShape.circle,
                      ),
                      child: state.isSending
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                            )
                          : const Icon(Icons.send, color: Colors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(MessageItem msg, bool isMe, bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMe) ...[
            CircleAvatar(
              radius: 14,
              backgroundColor: isDark ? const Color(0xFF2E5C94) : const Color(0xFF1F3E68),
              child: Text(
                msg.senderName?.isNotEmpty == true ? msg.senderName!.substring(0, 1).toUpperCase() : '?',
                style: const TextStyle(color: Colors.white, fontSize: 12),
              ),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: isMe 
                  ? const Color(0xFF1F3E68) 
                  : (isDark ? const Color(0xFF2C2C2C) : Colors.grey[200]),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isMe ? 16 : 4),
                  bottomRight: Radius.circular(isMe ? 4 : 16),
                ),
              ),
              child: Column(
                crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                children: [
                  if (!isMe && msg.senderName != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        msg.senderName!,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? Colors.grey[400] : Colors.grey[700],
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  Text(
                    msg.isRecalled ? 'Tin nhắn đã thu hồi' : msg.content,
                    style: TextStyle(
                      color: isMe 
                        ? Colors.white 
                        : (isDark ? Colors.white : Colors.black87),
                      fontStyle: msg.isRecalled ? FontStyle.italic : FontStyle.normal,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    DateFormat('HH:mm').format(msg.createdAt),
                    style: TextStyle(
                      fontSize: 10,
                      color: isMe 
                        ? Colors.white70 
                        : (isDark ? Colors.grey[500] : Colors.grey[600]),
                    ),
                  )
                ],
              ),
            ),
          ),
          if (isMe) const SizedBox(width: 24), // Spacer to balance the avatar on the left
        ],
      ),
    );
  }
}
