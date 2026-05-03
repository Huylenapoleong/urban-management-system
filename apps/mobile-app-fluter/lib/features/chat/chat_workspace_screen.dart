import "dart:async";
import "package:flutter/material.dart";
import "package:intl/intl.dart";
import "package:infinite_scroll_pagination/infinite_scroll_pagination.dart";
import "package:flutter_slidable/flutter_slidable.dart";

import "../../models/conversation_summary.dart";
import "../../models/message_item.dart";
import "../../services/conversation_service.dart";
import "../../services/upload_service.dart";
import "../../services/socket_service.dart";
import "../../services/user_service.dart";
import "../../services/group_service.dart";
import "../../services/webrtc_service.dart";
import "chat_detail_screen.dart";
import "../contacts/contacts_screen.dart";
import "../shared/widgets/user_avatar.dart";

class ChatWorkspaceScreen extends StatefulWidget {
  final ConversationService conversationService;
  final UploadService uploadService;
  final SocketService socketService;
  final UserService userService;
  final GroupService groupService;
  final WebRTCService webRTCService;
  final dynamic currentUser;

  const ChatWorkspaceScreen({
    super.key,
    required this.conversationService,
    required this.uploadService,
    required this.socketService,
    required this.userService,
    required this.groupService,
    required this.webRTCService,
    required this.currentUser,
  });

  @override
  State<ChatWorkspaceScreen> createState() => _ChatWorkspaceScreenState();
}

class _ChatWorkspaceScreenState extends State<ChatWorkspaceScreen> with AutomaticKeepAliveClientMixin {
  final PagingController<String?, ConversationSummary> _pagingController = PagingController(firstPageKey: null);
  final TextEditingController _searchController = TextEditingController();
  
  StreamSubscription? _convSub;
  StreamSubscription? _msgSub;
  StreamSubscription? _presenceSub;
  StreamSubscription? _snapshotSub;
  StreamSubscription? _readySub;
  Map<String, dynamic> _userPresence = {};
  bool _updatingSettings = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _pagingController.addPageRequestListener((pageKey) {
      _fetchPage(pageKey);
    });

    _convSub = widget.socketService.onConversationUpdated.listen((conv) {
      if (mounted && !_updatingSettings) {
        final items = _pagingController.itemList;
        if (items != null) {
          final idx = items.indexWhere((item) => item.conversationId == conv.conversationId);
          if (idx != -1) {
            final oldConv = items[idx];
            final newList = List<ConversationSummary>.from(items);
            
            final isNewMessage = conv.lastMessagePreview != oldConv.lastMessagePreview;
            
            if (isNewMessage || conv.isPinned != oldConv.isPinned) {
              newList.removeAt(idx);
              // Insert at 0, but if there are pinned ones, we might need more complex logic.
              // For simplicity, we just put it at 0 if it's a new message.
              newList.insert(0, conv);
              // Sort by pinned then by date if needed, but let's keep it simple for now.
              _sortConversations(newList);
            } else {
              newList[idx] = conv;
            }
            _pagingController.itemList = newList;
          } else {
            _pagingController.refresh();
          }
        }
      }
    });

    _msgSub = widget.socketService.onMessageCreated.listen((msg) {
      if (mounted && !_updatingSettings) {
        final items = _pagingController.itemList;
        if (items != null) {
          final idx = items.indexWhere((item) => item.conversationId == msg.conversationId);
          if (idx != -1) {
            final newList = List<ConversationSummary>.from(items);
            final oldConv = items[idx];
            final updated = oldConv.copyWith(
              lastMessagePreview: msg.contentText,
              updatedAt: msg.sentAt,
              unreadCount: msg.senderId != widget.currentUser.id 
                  ? oldConv.unreadCount + 1 
                  : oldConv.unreadCount,
            );
            newList.removeAt(idx);
            newList.insert(0, updated);
            _sortConversations(newList);
            _pagingController.itemList = newList;
          } else {
            _pagingController.refresh();
          }
        }
      }
    });

    widget.socketService.onMessageUpdated.listen((msg) {
      if (mounted) {
        final items = _pagingController.itemList;
        if (items != null) {
          final idx = items.indexWhere((item) => item.conversationId == msg.conversationId);
          if (idx != -1) {
            final newList = List<ConversationSummary>.from(items);
            if (newList[idx].lastMessagePreview != msg.contentText) {
               newList[idx] = newList[idx].copyWith(
                 lastMessagePreview: msg.contentText,
               );
               _pagingController.itemList = newList;
            }
          }
        }
      }
    });

    _presenceSub = widget.socketService.onPresenceUpdated.listen((data) {
      final presence = data["presence"] ?? data;
      final userId = presence["userId"]?.toString();
      if (mounted && userId != null) {
        setState(() {
          _userPresence = Map<String, dynamic>.from(_userPresence);
          _userPresence[userId] = presence;
        });
      }
    });

    _snapshotSub = widget.socketService.onPresenceSnapshot.listen((data) {
      final participants = data["participants"];
      if (mounted && participants is List) {
        setState(() {
          _userPresence = Map<String, dynamic>.from(_userPresence);
          for (var p in participants) {
            if (p is Map) {
              final userId = p["userId"]?.toString();
              if (userId != null) {
                _userPresence[userId] = p;
              }
            }
          }
        });
      }
    });

    _readySub = widget.socketService.onChatReady.listen((_) {
      if (mounted) {
        final items = _pagingController.itemList;
        if (items != null) {
          for (final conv in items) {
            widget.socketService.joinConversation(conv.conversationId);
          }
        }
      }
    });
  }

  void _sortConversations(List<ConversationSummary> list) {
    list.sort((a, b) {
      if (a.isPinned != b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return b.updatedAt.compareTo(a.updatedAt);
    });
  }

  Future<void> _fetchPage(String? pageKey) async {
    try {
      final isSearching = _searchController.text.trim().isNotEmpty;
      final result = await widget.conversationService.listConversations(
        q: isSearching ? _searchController.text.trim() : null,
        includeArchived: isSearching ? true : null,
        cursor: pageKey,
        limit: 20,
      );
      if (result.hasNextPage) {
        _pagingController.appendPage(result.items, result.cursor);
      } else {
        _pagingController.appendLastPage(result.items);
      }
      
      final items = _pagingController.itemList;
      if (items != null) {
        _sortConversations(items);
        // Join socket rooms for presence updates
        for (final conv in result.items) {
          widget.socketService.joinConversation(conv.conversationId);
        }

        // Proactively fetch initial presence for peers
        final peerIds = result.items
            .where((c) => !c.isGroup)
            .map((c) => c.getPeerId(widget.currentUser.id))
            .whereType<String>()
            .toSet()
            .toList();

        for (final id in peerIds) {
          widget.userService.getUserPresence(id).then((presence) {
            if (mounted) {
              setState(() {
                _userPresence = Map<String, dynamic>.from(_userPresence);
                _userPresence[id] = presence;
              });
            }
          }).catchError((_) {});
        }
      }
    } catch (error) {
      _pagingController.error = error;
    }
  }

  Future<void> _togglePin(ConversationSummary conv) async {
    setState(() => _updatingSettings = true);
    try {
      await widget.conversationService.updateConversationPreferences(
        conv.conversationId,
        isPinned: !conv.isPinned,
      );
      _pagingController.refresh();
    } finally {
      setState(() => _updatingSettings = false);
    }
  }

  Future<void> _toggleMute(ConversationSummary conv) async {
    setState(() => _updatingSettings = true);
    try {
      final isMuted = conv.isMuted;
      await widget.conversationService.updateConversationPreferences(
        conv.conversationId,
        mutedUntil: isMuted ? null : DateTime.now().add(const Duration(days: 365)).toIso8601String(),
      );
      _pagingController.refresh();
    } finally {
      setState(() => _updatingSettings = false);
    }
  }

  Future<void> _toggleArchive(ConversationSummary conv) async {
    setState(() => _updatingSettings = true);
    try {
      await widget.conversationService.updateConversationPreferences(
        conv.conversationId,
        archived: conv.archivedAt == null,
      );
      _pagingController.refresh();
    } finally {
      setState(() => _updatingSettings = false);
    }
  }

  void _markAsReadLocally(String conversationId) {
    final items = _pagingController.itemList;
    if (items != null) {
      final idx = items.indexWhere((c) => c.conversationId == conversationId);
      if (idx != -1) {
        final newList = List<ConversationSummary>.from(items);
        newList[idx] = newList[idx].copyWith(unreadCount: 0);
        setState(() {
          _pagingController.itemList = newList;
        });
      }
    }
  }

  Future<void> _refreshConversationLocally(String conversationId) async {
    try {
      final msgs = await widget.conversationService.listMessages(conversationId, limit: 1);
      if (msgs.items.isNotEmpty) {
        final lastMsg = msgs.items.first;
        final items = _pagingController.itemList;
        if (items != null) {
          final idx = items.indexWhere((c) => c.conversationId == conversationId);
          if (idx != -1) {
            final newList = List<ConversationSummary>.from(items);
            newList[idx] = newList[idx].copyWith(lastMessagePreview: lastMsg.contentText);
            setState(() {
              _pagingController.itemList = newList;
            });
          }
        }
      }
    } catch (_) {}
  }

  void _showOptionsMenu(ConversationSummary conv) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 8, bottom: 8),
              height: 4,
              width: 40,
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)),
            ),
            ListTile(
              leading: Icon(conv.isPinned ? Icons.push_pin_rounded : Icons.push_pin_outlined, color: const Color(0xFF7C3AED)),
              title: Text(conv.isPinned ? 'Bỏ ghim' : 'Ghim hội thoại'),
              onTap: () {
                Navigator.pop(context);
                _togglePin(conv);
              },
            ),
            ListTile(
              leading: Icon(conv.isMuted ? Icons.notifications_off : Icons.notifications_none, color: const Color(0xFFFACC15)),
              title: Text(conv.isMuted ? 'Bật thông báo' : 'Tắt thông báo'),
              onTap: () {
                Navigator.pop(context);
                _toggleMute(conv);
              },
            ),
            ListTile(
              leading: Icon(conv.archivedAt != null ? Icons.unarchive_outlined : Icons.archive_outlined, color: Colors.blueGrey),
              title: Text(conv.archivedAt != null ? 'Hiện hội thoại' : 'Ẩn hội thoại'),
              onTap: () {
                Navigator.pop(context);
                _toggleArchive(conv);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _deleteConversation(ConversationSummary conv) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Xóa cuộc hội thoại?"),
        content: const Text("Hành động này không thể hoàn tác."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Hủy")),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text("Xóa", style: TextStyle(color: Colors.red))),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _updatingSettings = true);
      try {
        await widget.conversationService.deleteConversation(conv.conversationId);
        _pagingController.refresh();
      } finally {
        setState(() => _updatingSettings = false);
      }
    }
  }

  @override
  void dispose() {
    _convSub?.cancel();
    _msgSub?.cancel();
    _presenceSub?.cancel();
    _snapshotSub?.cancel();
    _readySub?.cancel();
    _searchController.dispose();
    _pagingController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      backgroundColor: Colors.white,
      body: RefreshIndicator(
        onRefresh: () async {
          _pagingController.refresh();
        },
        color: const Color(0xFF7C3AED),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar(
            floating: true,
            pinned: false,
            backgroundColor: Colors.white,
            elevation: 0,
            title: const Text(
              "Tin nhắn",
              style: TextStyle(color: Color(0xFF1E1B4B), fontWeight: FontWeight.bold, fontSize: 24),
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.edit_note_outlined, color: Color(0xFF7C3AED), size: 28),
                onPressed: () {
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ContactsScreen()));
                },
              ),
              const SizedBox(width: 8),
            ],
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: TextField(
                  controller: _searchController,
                  onSubmitted: (_) => _pagingController.refresh(),
                  decoration: const InputDecoration(
                    hintText: "Tìm kiếm hội thoại...",
                    prefixIcon: Icon(Icons.search, color: Color(0xFF64748B)),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                ),
              ),
            ),
          ),
          PagedSliverList<String?, ConversationSummary>.separated(
            pagingController: _pagingController,
            separatorBuilder: (_, __) => const Divider(height: 1, indent: 84, color: Color(0xFFF1F5F9)),
            builderDelegate: PagedChildBuilderDelegate<ConversationSummary>(
              itemBuilder: (context, conversation, index) => Slidable(
                key: ValueKey(conversation.conversationId),
                endActionPane: ActionPane(
                  motion: const ScrollMotion(),
                  extentRatio: 0.25,
                  children: [
                    SlidableAction(
                      onPressed: (_) => _deleteConversation(conversation),
                      backgroundColor: Colors.redAccent,
                      foregroundColor: Colors.white,
                      icon: Icons.delete_outline,
                      label: 'Xóa',
                    ),
                  ],
                ),
                child: _ConversationCard(
                  conversation: conversation,
                  currentUser: widget.currentUser,
                  userService: widget.userService,
                  groupService: widget.groupService,
                  userPresence: _userPresence,
                  onLongPress: () => _showOptionsMenu(conversation),
                  onTap: () async {
                    if (conversation.unreadCount > 0) {
                      _markAsReadLocally(conversation.conversationId);
                      widget.conversationService.markConversationAsRead(conversation.conversationId);
                      widget.socketService.markAsRead(conversation.conversationId);
                    }
                    await Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => ChatDetailScreen(
                        conversation: conversation,
                        conversationService: widget.conversationService,
                        uploadService: widget.uploadService,
                        socketService: widget.socketService,
                        userService: widget.userService,
                        groupService: widget.groupService,
                        webRTCService: widget.webRTCService,
                        currentUser: widget.currentUser,
                      ),
                    ));
                    _refreshConversationLocally(conversation.conversationId);
                  },
                ),
              ),
              firstPageProgressIndicatorBuilder: (_) => const Center(child: CircularProgressIndicator(color: Color(0xFF7C3AED))),
              noItemsFoundIndicatorBuilder: (_) => Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(height: 100),
                    Icon(Icons.chat_bubble_outline, size: 80, color: Colors.grey[200]),
                    const SizedBox(height: 16),
                    Text("Chưa có cuộc hội thoại nào", style: TextStyle(color: Colors.grey[400], fontSize: 16)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
}

class _ConversationCard extends StatelessWidget {
  final ConversationSummary conversation;
  final dynamic currentUser;
  final dynamic userService;
  final dynamic groupService;
  final Map<String, dynamic> userPresence;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  const _ConversationCard({
    required this.conversation,
    required this.currentUser,
    required this.userService,
    required this.groupService,
    required this.userPresence,
    required this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final hasUnread = conversation.unreadCount > 0;
    final timeStr = _formatDate(conversation.updatedAt);

    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            _buildAvatar(conversation),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            if (conversation.isPinned)
                              const Padding(
                                padding: EdgeInsets.only(right: 4),
                                child: Icon(Icons.push_pin_rounded, size: 14, color: Color(0xFF7C3AED)),
                              ),
                            Expanded(
                              child: Text(
                                conversation.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: hasUnread ? FontWeight.bold : FontWeight.w600,
                                  color: const Color(0xFF1E1B4B),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        timeStr,
                        style: TextStyle(
                          fontSize: 12,
                          color: hasUnread ? const Color(0xFF7C3AED) : Colors.grey[500],
                          fontWeight: hasUnread ? FontWeight.bold : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                  _buildPresenceStatus(),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          conversation.lastMessagePreview ?? "Chưa có tin nhắn",
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 14,
                            color: hasUnread ? const Color(0xFF1E1B4B) : Colors.grey[600],
                            fontWeight: hasUnread ? FontWeight.w500 : FontWeight.normal,
                          ),
                        ),
                      ),
                      if (conversation.isMuted)
                        const Padding(
                          padding: EdgeInsets.only(left: 4),
                          child: Icon(Icons.notifications_off_outlined, size: 14, color: Colors.grey),
                        ),
                      if (hasUnread)
                        Container(
                          margin: const EdgeInsets.only(left: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF7C3AED),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            conversation.unreadCount > 99 ? "99+" : "${conversation.unreadCount}",
                            style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPresenceStatus() {
    if (conversation.isGroup) return const SizedBox.shrink();
    final peerId = conversation.getPeerId(currentUser?.id);
    if (peerId == null) return const SizedBox.shrink();
    
    final presence = userPresence[peerId];
    final isActive = (presence is Map && presence["isActive"] == true) || (presence == true);
    
    if (isActive) return const SizedBox.shrink();

    String? statusText;
    if (presence is Map && presence["lastSeenAt"] != null) {
      final lastSeen = DateTime.tryParse(presence["lastSeenAt"].toString());
      if (lastSeen != null) {
        statusText = "Hoạt động ${_formatLastSeen(lastSeen)} trước";
      }
    }

    // Fallback if no lastSeenAt but we know they are offline
    statusText ??= "Ngoại tuyến";

    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text(
        statusText,
        style: TextStyle(
          fontSize: 11,
          color: Colors.grey.shade500,
          fontStyle: FontStyle.italic,
        ),
      ),
    );
  }

  String _formatLastSeen(DateTime date) {
    final diff = DateTime.now().difference(date);
    if (diff.inDays > 0) return "${diff.inDays} ngày";
    if (diff.inHours > 0) return "${diff.inHours} giờ";
    if (diff.inMinutes > 0) return "${diff.inMinutes} phút";
    return "vài giây";
  }

  Widget _buildAvatar(ConversationSummary conversation) {
    final peerId = conversation.getPeerId(currentUser?.id);
    final presence = userPresence[peerId];
    return UserAvatar(
      userId: peerId,
      groupId: conversation.groupId,
      initialAvatarUrl: conversation.isGroup ? conversation.groupAvatarUrl : conversation.peerAvatarUrl,
      initialDisplayName: conversation.title,
      radius: 28,
      showStatus: !conversation.isGroup,
      isActive: peerId != null &&
          (presence is Map
              ? (presence["isActive"] == true)
              : (presence == true)),
      userService: userService,
      groupService: groupService,
    );
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr).toLocal();
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inDays == 0) {
        return "${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}";
      } else if (diff.inDays < 7) {
        return DateFormat("E").format(date);
      } else {
        return DateFormat("dd/MM").format(date);
      }
    } catch (_) {
      return "";
    }
  }
}
