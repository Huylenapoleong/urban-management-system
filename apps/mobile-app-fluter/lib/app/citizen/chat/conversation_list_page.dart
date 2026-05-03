import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_client.dart';
import '../../../features/chat/models/conversation.dart';
import '../../../state/auth_controller.dart';
import '../../shared/chat/chat_providers.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Citizen palette
// ─────────────────────────────────────────────────────────────────────────────
const _kBlue       = Color(0xFF1E88E5);
const _kBlueSoft   = Color(0xFFE8F4FD);
const _kSurface    = Color(0xFFF8FAFC);
const _kBorder     = Color(0xFFE2ECF9);
const _kTextDark   = Color(0xFF0F172A);
const _kTextMuted  = Color(0xFF64748B);

class CitizenConversationListPage extends ConsumerStatefulWidget {
  const CitizenConversationListPage({super.key});

  @override
  ConsumerState<CitizenConversationListPage> createState() => _State();
}

class _State extends ConsumerState<CitizenConversationListPage> {
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth         = ref.watch(authControllerProvider);
    final conversations = ref.watch(conversationsProvider);
    final filter       = ref.watch(conversationFilterProvider);
    final isDark       = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0D1117) : _kSurface,
      body: CustomScrollView(
        slivers: [
          // ── Glassmorphism Header ──────────────────────────────────────────
          SliverAppBar(
            expandedHeight: 130,
            pinned: true,
            elevation: 0,
            backgroundColor: Colors.transparent,
            flexibleSpace: ClipRRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: isDark
                          ? [const Color(0xCC1A2340), const Color(0xCC0D1117)]
                          : [const Color(0xEEFFFFFF), const Color(0xCCE8F4FD)],
                    ),
                    border: Border(
                      bottom: BorderSide(color: _kBorder.withValues(alpha: 0.6)),
                    ),
                  ),
                  child: SafeArea(
                    bottom: false,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 24,
                            backgroundColor: _kBlue,
                            child: Text(
                              auth.user?.fullName.isNotEmpty == true
                                  ? auth.user!.fullName.substring(0, 1).toUpperCase()
                                  : 'C',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 18,
                              ),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text(
                                  'Tin nhắn',
                                  style: TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                    color: _kTextDark,
                                  ),
                                ),
                                Text(
                                  auth.user?.fullName ?? '',
                                  style: const TextStyle(fontSize: 13, color: _kTextMuted),
                                ),
                              ],
                            ),
                          ),
                          // Unread badge
                          conversations.whenOrNull(
                            data: (items) {
                              final total = items.fold<int>(0, (s, i) => s + i.unreadCount);
                              if (total == 0) return const SizedBox.shrink();
                              return Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: _kBlue,
                                  borderRadius: BorderRadius.circular(99),
                                ),
                                child: Text(
                                  '$total chưa đọc',
                                  style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                                ),
                              );
                            },
                          ) ?? const SizedBox.shrink(),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.logout_rounded, color: _kTextMuted, size: 22),
                            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),

          // ── Search + Filter ───────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Column(
                children: [
                  // Search field
                  Container(
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E2536) : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: _kBlue.withValues(alpha: 0.08),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: TextField(
                      controller: _searchCtrl,
                      onChanged: (v) => ref.read(conversationQueryProvider.notifier).state = v,
                      decoration: InputDecoration(
                        hintText: 'Tìm cuộc trò chuyện...',
                        hintStyle: const TextStyle(color: _kTextMuted, fontSize: 14),
                        prefixIcon: const Icon(Icons.search_rounded, color: _kTextMuted, size: 20),
                        suffixIcon: _searchCtrl.text.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.close, size: 18, color: _kTextMuted),
                                onPressed: () {
                                  _searchCtrl.clear();
                                  ref.read(conversationQueryProvider.notifier).state = '';
                                },
                              )
                            : null,
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  // Filter chips
                  Row(
                    children: [
                      _FilterTab(label: 'Tất cả', selected: filter == 'all', onTap: () => ref.read(conversationFilterProvider.notifier).state = 'all'),
                      const SizedBox(width: 8),
                      _FilterTab(label: 'Cá nhân', selected: filter == 'dm', onTap: () => ref.read(conversationFilterProvider.notifier).state = 'dm'),
                      const SizedBox(width: 8),
                      _FilterTab(label: 'Nhóm', selected: filter == 'group', onTap: () => ref.read(conversationFilterProvider.notifier).state = 'group'),
                    ],
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),

          // ── Conversation List ──────────────────────────────────────────────
          conversations.when(
            loading: () => const SliverFillRemaining(
              child: Center(child: CircularProgressIndicator(color: _kBlue)),
            ),
            error: (err, _) => SliverFillRemaining(
              child: _EmptyState(
                icon: Icons.wifi_off_rounded,
                title: 'Không tải được danh sách',
                subtitle: ApiClient.extractError(err),
                action: 'Thử lại',
                onAction: () => ref.invalidate(conversationsProvider),
              ),
            ),
            data: (items) {
              final visible = items.where((i) {
                if (filter == 'group') return i.isGroup;
                if (filter == 'dm') return !i.isGroup;
                return true;
              }).toList();

              if (visible.isEmpty) {
                return const SliverFillRemaining(
                  child: _EmptyState(
                    icon: Icons.chat_bubble_outline_rounded,
                    title: 'Chưa có cuộc trò chuyện',
                    subtitle: 'Liên hệ ban quản lý để bắt đầu trao đổi',
                  ),
                );
              }

              return SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                sliver: SliverList.separated(
                  itemCount: visible.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) => _ConversationCard(
                    item: visible[index],
                    onTap: () => context.push(
                      '/citizen/chats/${Uri.encodeComponent(visible[index].id)}'
                      '?name=${Uri.encodeComponent(visible[index].name)}',
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation Card
// ─────────────────────────────────────────────────────────────────────────────
class _ConversationCard extends StatelessWidget {
  const _ConversationCard({required this.item, required this.onTap});

  final Conversation item;
  final VoidCallback onTap;

  Color _avatarColor(String id) {
    const palette = [
      Color(0xFF1E88E5), Color(0xFF43A047), Color(0xFF8E24AA),
      Color(0xFFE53935), Color(0xFF00ACC1), Color(0xFFF4511E),
    ];
    return palette[id.hashCode.abs() % palette.length];
  }

  @override
  Widget build(BuildContext context) {
    final color = _avatarColor(item.id);
    final hasUnread = item.unreadCount > 0;

    return RepaintBoundary(
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: hasUnread ? _kBlue.withValues(alpha: 0.3) : _kBorder),
              boxShadow: [
                BoxShadow(
                  color: hasUnread
                      ? _kBlue.withValues(alpha: 0.10)
                      : Colors.black.withValues(alpha: 0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                // Avatar
                Stack(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: color.withValues(alpha: 0.15),
                      child: Text(
                        item.name.isNotEmpty ? item.name.substring(0, 1).toUpperCase() : '?',
                        style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 18),
                      ),
                    ),
                    if (item.isGroup)
                      Positioned(
                        bottom: 0, right: 0,
                        child: Container(
                          padding: const EdgeInsets.all(2),
                          decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                          child: const CircleAvatar(
                            radius: 8,
                            backgroundColor: _kBlue,
                            child: Icon(Icons.group, size: 10, color: Colors.white),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(width: 14),
                // Content
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              item.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontWeight: hasUnread ? FontWeight.w800 : FontWeight.w600,
                                fontSize: 15,
                                color: _kTextDark,
                              ),
                            ),
                          ),
                          // Type badge
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: item.isGroup ? _kBlueSoft : const Color(0xFFF0FDF4),
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                              item.isGroup ? 'Nhóm' : 'Cá nhân',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: item.isGroup ? _kBlue : const Color(0xFF16A34A),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        item.lastMessagePreview.isEmpty
                            ? 'Bắt đầu cuộc trò chuyện nhé!'
                            : item.lastMessagePreview,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          color: hasUnread ? _kTextDark : _kTextMuted,
                          fontWeight: hasUnread ? FontWeight.w600 : FontWeight.normal,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                // Unread badge
                if (hasUnread)
                  Container(
                    constraints: const BoxConstraints(minWidth: 26),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _kBlue,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      item.unreadCount > 99 ? '99+' : item.unreadCount.toString(),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
                    ),
                  )
                else
                  const Icon(Icons.chevron_right_rounded, color: _kTextMuted, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Tab
// ─────────────────────────────────────────────────────────────────────────────
class _FilterTab extends StatelessWidget {
  const _FilterTab({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? _kBlue : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? _kBlue : _kBorder),
          boxShadow: selected
              ? [BoxShadow(color: _kBlue.withValues(alpha: 0.25), blurRadius: 8, offset: const Offset(0, 3))]
              : [],
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : _kTextMuted,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────────────────────
class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(36),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: _kBlueSoft,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Icon(icon, size: 40, color: _kBlue),
            ),
            const SizedBox(height: 20),
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _kTextDark), textAlign: TextAlign.center),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(subtitle!, style: const TextStyle(fontSize: 13, color: _kTextMuted), textAlign: TextAlign.center),
            ],
            if (action != null && onAction != null) ...[
              const SizedBox(height: 20),
              FilledButton(
                onPressed: onAction,
                style: FilledButton.styleFrom(
                  backgroundColor: _kBlue,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                ),
                child: Text(action!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
