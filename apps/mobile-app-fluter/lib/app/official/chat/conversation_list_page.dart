import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../state/conversation_list_controller.dart';
import '../../../core/models/chat_models.dart';

class OfficialConversationListPage extends ConsumerWidget {
  const OfficialConversationListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(conversationListProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tin nhắn Official'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.read(conversationListProvider.notifier).fetchConversations();
            },
          ),
        ],
      ),
      body: state.isLoading && state.conversations.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : state.error != null && state.conversations.isEmpty
              ? Center(child: Text('Lỗi tải tin nhắn: ${state.error}'))
              : RefreshIndicator(
                  onRefresh: () => ref.read(conversationListProvider.notifier).fetchConversations(),
                  child: ListView.builder(
                    itemCount: state.conversations.length,
                    itemBuilder: (context, index) {
                      final item = state.conversations[index];
                      return _buildChatItem(context, item, isDark);
                    },
                  ),
                ),
    );
  }

  Widget _buildChatItem(BuildContext context, ConversationSummary item, bool isDark) {
    return ListTile(
      leading: CircleAvatar(
        radius: 26,
        backgroundColor: isDark ? const Color(0xFF2E5C94) : const Color(0xFF1F3E68),
        backgroundImage: _getAvatarImage(item),
        child: _hasNoAvatar(item)
            ? Text(
                item.title.isNotEmpty ? item.title.substring(0, 1).toUpperCase() : '?',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              )
            : null,
      ),
      title: Text(
        item.title,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        item.subtitle ?? '...',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: isDark ? Colors.grey[400] : Colors.grey[600],
        ),
      ),
      trailing: item.updatedAt != null
          ? Text(
              _formatTime(item.updatedAt!),
              style: TextStyle(
                fontSize: 12,
                color: isDark ? Colors.grey[500] : Colors.grey[500],
              ),
            )
          : null,
      onTap: () {
        context.push('/official/chats/${Uri.encodeComponent(item.id)}?name=${Uri.encodeComponent(item.title)}');
      },
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    );
  }

  bool _hasNoAvatar(ConversationSummary item) {
    return (item.peerAvatarUrl == null || item.peerAvatarUrl!.isEmpty) &&
        (item.groupAvatarUrl == null || item.groupAvatarUrl!.isEmpty);
  }

  ImageProvider? _getAvatarImage(ConversationSummary item) {
    final url = item.peerAvatarUrl ?? item.groupAvatarUrl;
    if (url != null && url.isNotEmpty) {
      if (url.startsWith('http')) {
        return NetworkImage(url);
      }
    }
    return null;
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final difference = now.difference(time);
    
    if (difference.inDays == 0 && now.day == time.day) {
      return DateFormat('HH:mm').format(time); // Same day
    } else if (difference.inDays < 7) {
      return DateFormat('EEE').format(time); // Within a week
    } else {
      return DateFormat('dd/MM').format(time); // Older
    }
  }
}
