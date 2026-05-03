import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_client.dart';
import '../../../features/chat/models/conversation.dart';
import '../../../state/auth_controller.dart';
import 'chat_providers.dart';

class SharedConversationListPage extends ConsumerWidget {
  const SharedConversationListPage({
    super.key,
    required this.roleSegment,
  });

  final String roleSegment;

  bool get _isOfficial => roleSegment == 'official';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final conversations = ref.watch(conversationsProvider);
    final filter = ref.watch(conversationFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_isOfficial ? 'Tin nhan cong vu' : 'Tin nhan ca nhan'),
            Text(
              auth.user?.fullName ?? 'UMS',
              style: Theme.of(context).textTheme.labelMedium,
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: _isOfficial ? const Color(0x141F3E68) : const Color(0x14016B5E),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  _isOfficial ? 'Official' : 'Citizen',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Tim cuoc tro chuyen',
                prefixIcon: Icon(Icons.search_rounded),
              ),
              onChanged: (value) {
                ref.read(conversationQueryProvider.notifier).state = value;
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _FilterChip(
                    label: 'Tat ca',
                    selected: filter == 'all',
                    onTap: () => ref.read(conversationFilterProvider.notifier).state = 'all',
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Ca nhan',
                    selected: filter == 'dm',
                    onTap: () => ref.read(conversationFilterProvider.notifier).state = 'dm',
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Nhom',
                    selected: filter == 'group',
                    onTap: () => ref.read(conversationFilterProvider.notifier).state = 'group',
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: conversations.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => _ErrorBlock(
                message: ApiClient.extractError(error),
                onRetry: () => ref.invalidate(conversationsProvider),
              ),
              data: (items) {
                final visible = items.where((item) {
                  if (filter == 'group') return item.isGroup;
                  if (filter == 'dm') return !item.isGroup;
                  return true;
                }).toList();

                if (visible.isEmpty) {
                  return const Center(child: Text('Chua co cuoc tro chuyen phu hop'));
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(conversationsProvider),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    itemBuilder: (context, index) {
                      final item = visible[index];
                      return _ConversationTile(item: item, roleSegment: roleSegment);
                    },
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemCount: visible.length,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.item, required this.roleSegment});

  final Conversation item;
  final String roleSegment;

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          context.push('/$roleSegment/chats/${Uri.encodeComponent(item.id)}?name=${Uri.encodeComponent(item.name)}');
        },
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFE2E8F2)),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: const Color(0xFF1F3E68),
                child: Text(
                  item.name.isNotEmpty ? item.name.characters.first.toUpperCase() : 'C',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    const SizedBox(height: 4),
                    Text(
                      item.lastMessagePreview.isEmpty ? 'Chua co tin nhan moi' : item.lastMessagePreview,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Color(0xFF64748B)),
                    ),
                    const SizedBox(height: 6),
                    Text(item.isGroup ? 'Nhom' : 'Ca nhan', style: const TextStyle(color: Color(0xFF475569), fontSize: 12, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              if (item.unreadCount > 0)
                Container(
                  constraints: const BoxConstraints(minWidth: 24),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0xFF1F3E68), borderRadius: BorderRadius.circular(99)),
                  child: Text(item.unreadCount.toString(), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(99),
      child: Ink(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(99),
          color: selected ? const Color(0xFF1F3E68) : Colors.white,
          border: Border.all(color: const Color(0xFFD5DFEB)),
        ),
        child: Text(label, style: TextStyle(color: selected ? Colors.white : const Color(0xFF334155), fontWeight: FontWeight.w700, fontSize: 12)),
      ),
    );
  }
}

class _ErrorBlock extends StatelessWidget {
  const _ErrorBlock({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.tonal(onPressed: onRetry, child: const Text('Thu lai')),
          ],
        ),
      ),
    );
  }
}
