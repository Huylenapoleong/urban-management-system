import "package:flutter/material.dart";
import "package:mobile_app_fluter/models/user_profile.dart";
import "../../models/conversation_summary.dart";
import "../../services/conversation_service.dart";
import "../shared/widgets/user_avatar.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "../../state/providers.dart";
import "../../state/auth_controller.dart";
import "../groups/group_shared_media_screen.dart";
import "../shared/widgets/app_toast.dart";
import "../../core/utils/translation_helper.dart";

class ConversationInfoScreen extends ConsumerStatefulWidget {
  final ConversationSummary conversation;
  final ConversationService conversationService;

  const ConversationInfoScreen({
    super.key,
    required this.conversation,
    required this.conversationService,
  });

  @override
  ConsumerState<ConversationInfoScreen> createState() => _ConversationInfoScreenState();
}

class _ConversationInfoScreenState extends ConsumerState<ConversationInfoScreen> {
  bool _loading = false;
  List<Map<String, dynamic>> _members = [];
  final Map<String, dynamic> _profileCache = {};
  List<dynamic> _friends = [];
  Map<String, String> _aliases = {};
  bool _isPeerBlocked = false;

  @override
  void initState() {
    super.initState();
    _loadAliases();
    _checkBlockStatus();
    if (widget.conversation.isGroup) {
      _loadData();
    }
  }

  Future<void> _checkBlockStatus() async {
    if (widget.conversation.isGroup) return;
    final peerId = widget.conversation.getPeerId(ref.read(authControllerProvider).user?.id);
    if (peerId == null) return;
    try {
      final userService = ref.read(userServiceProvider);
      final blockedList = await userService.listBlockedUsers();
      final isBlocked = blockedList.any((item) => item['userId']?.toString() == peerId);
      if (mounted) {
        setState(() {
          _isPeerBlocked = isBlocked;
        });
      }
    } catch (e) {
      debugPrint("Error checking block status in info screen: $e");
    }
  }

  Future<void> _loadAliases() async {
    try {
      final aliasList = await widget.conversationService
          .listConversationAliases(widget.conversation.conversationId);
      if (mounted) {
        setState(() {
          _aliases = {
            for (var a in aliasList)
              a['userId'].toString(): a['alias'].toString()
          };
        });
      }
    } catch (e) {
      debugPrint("Error loading aliases in info screen: $e");
    }
  }

  Future<void> _loadData() async {
    if (!widget.conversation.isGroup) {
      setState(() => _loading = false);
      return;
    }

    final userService = ref.read(userServiceProvider);
    final groupService = ref.read(groupServiceProvider);
    final conversationService = ref.read(conversationServiceProvider);
    setState(() => _loading = true);
    
    // 1. Load members (Main Priority)
    try {
      final groupId = widget.conversation.groupId ?? widget.conversation.conversationId;
      final members = await groupService.listMembers(groupId);
      if (mounted) {
        setState(() {
          _members = members;
          _loading = false;
        });
      }
      
      // Hydrate profiles in background
      for (final m in members) {
        final userId = m["userId"];
        if (userId != null && !_profileCache.containsKey(userId)) {
          _fetchProfile(userId);
        }
      }
    } catch (e) {
      debugPrint("Error loading members: $e");
      if (mounted) setState(() => _loading = false);
    }

    // 2. Load friends for fallback names (Optional)
    try {
      final friends = await userService.listFriends();
      if (mounted) {
        setState(() {
          _friends = friends;
        });
      }
    } catch (e) {
      debugPrint("Error loading friends: $e");
    }

    // 3. Harvest names/avatars from messages as fallback (Optional)
    try {
      final messages = await conversationService.listMessages(widget.conversation.conversationId, limit: 50);
      bool changed = false;
      for (final msg in messages.items) {
        final senderId = msg.senderId;
        if (senderId != null && !_profileCache.containsKey(senderId)) {
          final senderName = msg.senderName;
          final senderAvatar = msg.senderAvatarUrl;
          if (senderName != null || senderAvatar != null) {
            _profileCache[senderId] = UserProfile.fromJson({
              "id": senderId,
              "fullName": senderName ?? "Thành viên",
              "avatarUrl": senderAvatar,
            });
            changed = true;
          }
        }
      }
      if (changed && mounted) {
        setState(() {});
      }
    } catch (e) {
      debugPrint("Error harvesting messages for profiles: $e");
    }
  }

  Future<void> _fetchProfile(String userId) async {
    final userService = ref.read(userServiceProvider);
    try {
      final profile = await userService.getUserById(userId);
      if (mounted) {
        setState(() {
          _profileCache[userId] = profile;
        });
      }
    } catch (e) {
      debugPrint("Error fetching profile for $userId: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    final isGroup = widget.conversation.isGroup;
    final peerId = isGroup ? null : widget.conversation.getPeerId(ref.read(authControllerProvider).user?.id);
    final resolvedTitle = (!isGroup && peerId != null && _aliases.containsKey(peerId))
        ? _aliases[peerId]!
        : widget.conversation.title;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          isGroup ? "Thông tin nhóm" : "Thông tin hội thoại",
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
          ),
        ),
        centerTitle: true,
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        iconTheme: IconThemeData(color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF7C3AED)))
          : SingleChildScrollView(
              child: Column(
                children: [
                  const SizedBox(height: 24),
                  Center(
                    child: Column(
                      children: [
                        UserAvatar(
                          userId: isGroup ? null : widget.conversation.getPeerId(ref.read(authControllerProvider).user?.id),
                          groupId: isGroup ? widget.conversation.groupId : null,
                          initialAvatarUrl: isGroup ? widget.conversation.groupAvatarUrl : (widget.conversation.peerAvatarUrl ?? widget.conversation.avatarUrl),
                          initialDisplayName: resolvedTitle,
                          radius: 50,
                          showStatus: !isGroup,
                          isActive: !isGroup && widget.conversation.getPeerId(ref.read(authControllerProvider).user?.id) != null,
                          userService: ref.read(userServiceProvider),
                          groupService: ref.read(groupServiceProvider),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          resolvedTitle,
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                          ),
                          textAlign: TextAlign.center,
                        ),
                        if (isGroup) ...[
                          const SizedBox(height: 4),
                          Text(
                            "${_members.length} thành viên",
                            style: TextStyle(
                              color: isDark ? const Color(0xFF94A3B8) : Colors.grey[600],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                  if (isGroup) ...[
                    _buildGroupSection(),
                    const SizedBox(height: 24),
                  ],
                  _buildActionSection(resolvedTitle),
                  const SizedBox(height: 24),
                  _buildDangerZone(),
                  const SizedBox(height: 40),
                ],
              ),
            ),
    );
  }

  Widget _buildGroupSection() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
      ),
      child: Column(
        children: [
          _buildListTile(
            Icons.people_outline,
            "Xem thành viên",
            onTap: () => _showMembersSheet(),
          ),
          Divider(height: 1, indent: 56, color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
          _buildListTile(
            Icons.person_add_outlined,
            "Thêm thành viên",
            onTap: () => _showAddMemberSheet(),
          ),
        ],
      ),
    );
  }

  void _showMembersSheet() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) {
        return DraggableScrollableSheet(
          initialChildSize: 0.6,
          minChildSize: 0.4,
          maxChildSize: 0.9,
          expand: false,
          builder: (context, scrollController) {
            return StatefulBuilder(
              builder: (context, setSheetState) {
                return Container(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      Text(
                        "Thành viên nhóm",
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Expanded(
                        child: ListView.builder(
                          controller: scrollController,
                          itemCount: _members.length,
                          itemBuilder: (context, index) {
                            final m = _members[index];
                            final userId = m["userId"];
                            
                            if (userId != null && !_profileCache.containsKey(userId)) {
                              _fetchProfile(userId).then((_) {
                                if (context.mounted) setSheetState(() {});
                              });
                            }

                            final UserProfile? profile = _profileCache[userId];
                            
                            String? fallbackName;
                            String? fallbackAvatar;
                            UserProfile? friend;
                            for (final f in _friends) {
                              if (f.id == userId) {
                                friend = f;
                                break;
                              }
                            }
                            
                            if (friend != null) {
                              fallbackName = friend.fullName;
                              fallbackAvatar = friend.avatarUrl;
                            }
                            
                            final user = ref.read(authControllerProvider).user;
                            final isMe = userId == user?.id;
                            
                            final fullName = isMe ? "Bạn" : (profile?.fullName ?? fallbackName ?? m["fullName"] ?? "Thành viên");
                            final avatarUrl = isMe ? user?.avatarUrl : (profile?.avatarUrl ?? fallbackAvatar ?? m["avatarUrl"]);

                            return ListTile(
                              leading: UserAvatar(
                                userId: userId,
                                userService: ref.read(userServiceProvider),
                                initialAvatarUrl: avatarUrl,
                                initialDisplayName: fullName,
                                radius: 18,
                              ),
                              title: Text(
                                fullName,
                                style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                              ),
                              subtitle: Text(
                                m["roleInGroup"] ?? "MEMBER",
                                style: TextStyle(color: isDark ? Colors.white60 : Colors.black54),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                );
              }
            );
          },
        );
      },
    );
  }

  void _showAddMemberSheet() {
    AppToast.show(
      context,
      message: "Tính năng đang phát triển",
      type: AppToastType.info,
    );
  }

  Widget _buildActionSection(String resolvedTitle) {
    final isGroup = widget.conversation.isGroup;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
      ),
      child: Column(
        children: [
          _buildListTile(
            Icons.push_pin_outlined,
            "Ghim hội thoại",
            trailing: Switch(
              value: widget.conversation.isPinned,
              activeColor: const Color(0xFF7C3AED),
              onChanged: (v) => _togglePin(v),
            ),
          ),
          Divider(height: 1, indent: 56, color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
          _buildListTile(
            Icons.notifications_off_outlined,
            "Tắt thông báo",
            trailing: Switch(
              value: widget.conversation.isMuted,
              activeColor: const Color(0xFF7C3AED),
              onChanged: (v) => _toggleMute(v),
            ),
          ),
          if (!isGroup) ...[
            Divider(height: 1, indent: 56, color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
            _buildListTile(
              Icons.edit_note,
              "Đặt biệt danh",
              onTap: () => _showSetAliasDialog(),
            ),
          ],
          Divider(height: 1, indent: 56, color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
          _buildListTile(
            Icons.photo_outlined,
            "Ảnh & Video đã gửi",
            onTap: () {
              Navigator.of(context, rootNavigator: true).push(
                MaterialPageRoute(
                  builder: (_) => GroupSharedMediaScreen(
                    conversationId: widget.conversation.conversationId,
                    groupName: resolvedTitle,
                    conversationService: widget.conversationService,
                    initialTabIndex: 0,
                  ),
                ),
              );
            },
          ),
          Divider(height: 1, indent: 56, color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
          _buildListTile(
            Icons.link,
            "Link đã chia sẻ",
            onTap: () {
              Navigator.of(context, rootNavigator: true).push(
                MaterialPageRoute(
                  builder: (_) => GroupSharedMediaScreen(
                    conversationId: widget.conversation.conversationId,
                    groupName: resolvedTitle,
                    conversationService: widget.conversationService,
                    initialTabIndex: 1,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _togglePin(bool pinned) async {
    setState(() => _loading = true);
    try {
      await widget.conversationService.updateConversationPreferences(
        widget.conversation.conversationId,
        isPinned: pinned,
      );
      if (mounted) {
        setState(() => _loading = false);
        AppToast.show(
          context,
          message: pinned ? "Đã ghim hội thoại" : "Đã bỏ ghim hội thoại",
          type: AppToastType.success,
        );
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
      AppToast.show(
        context,
        message: "Lỗi: $e",
        type: AppToastType.error,
      );
    }
  }

  Future<void> _toggleMute(bool mute) async {
    setState(() => _loading = true);
    try {
      final mutedUntil = mute ? DateTime.now().add(const Duration(days: 36500)).toIso8601String() : null;
      await widget.conversationService.updateConversationPreferences(
        widget.conversation.conversationId,
        mutedUntil: mutedUntil,
      );
      if (mounted) {
        setState(() => _loading = false);
        AppToast.show(
          context,
          message: mute ? "Đã tắt thông báo" : "Đã bật thông báo",
          type: AppToastType.success,
        );
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
      AppToast.show(
        context,
        message: "Lỗi: $e",
        type: AppToastType.error,
      );
    }
  }

  Widget _buildDangerZone() {
    final isGroup = widget.conversation.isGroup;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
      ),
      child: Column(
        children: [
          if (!isGroup) ...[
            _buildListTile(
              _isPeerBlocked ? Icons.check_circle_outline : Icons.block,
              _isPeerBlocked ? "Bỏ chặn người dùng" : "Chặn người dùng",
              textColor: _isPeerBlocked ? const Color(0xFF7C3AED) : Colors.red,
              iconColor: _isPeerBlocked ? const Color(0xFF7C3AED) : Colors.red,
              onTap: () => _isPeerBlocked ? _unblockUser() : _blockUser(),
            ),
            Divider(height: 1, indent: 56, color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
          ],
          _buildListTile(
            Icons.delete_outline,
            "Xóa lịch sử trò chuyện",
            textColor: Colors.red,
            iconColor: Colors.red,
            onTap: () => _clearHistory(),
          ),
          Divider(height: 1, indent: 56, color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
          if (!isGroup)
            _buildListTile(
              Icons.person_remove_outlined,
              "Hủy kết bạn",
              textColor: Colors.red,
              iconColor: Colors.red,
              onTap: () => _removeFriend(),
            )
          else
            _buildListTile(
              Icons.logout,
              "Rời khỏi nhóm",
              textColor: Colors.red,
              iconColor: Colors.red,
              onTap: () => _leaveGroup(),
            ),
        ],
      ),
    );
  }

  Future<void> _blockUser() async {
    final peerId = widget.conversation.getPeerId(ref.read(authControllerProvider).user?.id);
    if (peerId == null) return;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        title: Text(
          "Chặn người dùng?",
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          "Bạn sẽ không nhận được tin nhắn và cuộc gọi từ người này nữa.",
          style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              "Hủy",
              style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Chặn"),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _loading = true);
      try {
        final userService = ref.read(userServiceProvider);
        await userService.blockUser(peerId);
        if (mounted) {
          setState(() {
            _isPeerBlocked = true;
            _loading = false;
          });
          AppToast.show(
            context,
            message: "Đã chặn người dùng thành công",
            type: AppToastType.success,
          );
        }
      } catch (e) {
        if (mounted) setState(() => _loading = false);
        AppToast.show(
          context,
          message: translateGroupError(e, fallback: "Không thể chặn người dùng"),
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _unblockUser() async {
    final peerId = widget.conversation.getPeerId(ref.read(authControllerProvider).user?.id);
    if (peerId == null) return;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        title: Text(
          "Bỏ chặn người dùng?",
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          "Người này sẽ có thể gửi tin nhắn và gọi điện cho bạn trở lại.",
          style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              "Hủy",
              style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Bỏ chặn"),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _loading = true);
      try {
        final userService = ref.read(userServiceProvider);
        await userService.unblockUser(peerId);
        if (mounted) {
          setState(() {
            _isPeerBlocked = false;
            _loading = false;
          });
          AppToast.show(
            context,
            message: "Đã bỏ chặn người dùng thành công",
            type: AppToastType.success,
          );
        }
      } catch (e) {
        if (mounted) setState(() => _loading = false);
        AppToast.show(
          context,
          message: translateGroupError(e, fallback: "Không thể bỏ chặn người dùng"),
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _clearHistory() async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        title: Text(
          "Xóa lịch sử trò chuyện?",
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          "Toàn bộ tin nhắn trong cuộc trò chuyện này sẽ bị xóa vĩnh viễn và không thể khôi phục.",
          style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              "Hủy",
              style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Xóa"),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _loading = true);
      try {
        await widget.conversationService.clearConversationHistory(widget.conversation.conversationId);
        if (mounted) {
          setState(() => _loading = false);
          AppToast.show(
            context,
            message: "Đã xóa lịch sử trò chuyện thành công",
            type: AppToastType.success,
          );
        }
      } catch (e) {
        if (mounted) setState(() => _loading = false);
        AppToast.show(
          context,
          message: "Lỗi: $e",
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _removeFriend() async {
    final peerId = widget.conversation.getPeerId(ref.read(authControllerProvider).user?.id);
    if (peerId == null) return;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        title: Text(
          "Hủy kết bạn?",
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          "Bạn có chắc chắn muốn hủy kết bạn với người này?",
          style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              "Hủy",
              style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Hủy kết bạn"),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _loading = true);
      try {
        final userService = ref.read(userServiceProvider);
        await userService.removeFriend(peerId);
        if (mounted) {
          setState(() => _loading = false);
          AppToast.show(
            context,
            message: "Đã hủy kết bạn thành công",
            type: AppToastType.success,
          );
        }
      } catch (e) {
        if (mounted) setState(() => _loading = false);
        AppToast.show(
          context,
          message: "Lỗi: $e",
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _leaveGroup() async {
    final groupService = ref.read(groupServiceProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        title: Text(
          "Rời khỏi nhóm?",
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          "Bạn sẽ không thể xem tin nhắn mới trong nhóm này.",
          style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              "Hủy",
              style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Rời nhóm", style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _loading = true);
      try {
        final groupId = widget.conversation.groupId ?? widget.conversation.conversationId;
        await groupService.leaveGroup(groupId);
        if (mounted) {
          Navigator.pop(context); // Back to info
          Navigator.pop(context); // Back to list
        }
      } catch (e) {
        if (mounted) setState(() => _loading = false);
        AppToast.show(
          context,
          message: "Lỗi: $e",
          type: AppToastType.error,
        );
      }
    }
  }

  Widget _buildListTile(IconData icon, String title, {Color? textColor, Color? iconColor, Widget? trailing, VoidCallback? onTap}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ListTile(
      leading: Icon(icon, color: iconColor ?? (isDark ? Colors.white70 : const Color(0xFF64748B))),
      title: Text(
        title,
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: textColor ?? (isDark ? Colors.white : const Color(0xFF1E1B4B)),
        ),
      ),
      trailing: trailing ?? Icon(Icons.chevron_right, size: 20, color: isDark ? const Color(0xFF475569) : const Color(0xFFCBD5E1)),
      onTap: onTap,
    );
  }

  void _showSetAliasDialog() {
    final peerId = widget.conversation.getPeerId(ref.read(authControllerProvider).user?.id);
    if (peerId == null) return;

    final currentAlias = _aliases[peerId] ?? '';
    final controller = TextEditingController(text: currentAlias);

    showDialog(
      context: context,
      builder: (dialogCtx) {
        final isDark = Theme.of(dialogCtx).brightness == Brightness.dark;
        return AlertDialog(
          backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
          title: Text(
            'Biệt danh cho ${widget.conversation.title}',
            style: TextStyle(
              color: isDark ? Colors.white : const Color(0xFF1E1B4B),
              fontWeight: FontWeight.bold,
            ),
          ),
          content: TextField(
            controller: controller,
            style: TextStyle(color: isDark ? Colors.white : Colors.black87),
            decoration: InputDecoration(
              hintText: 'Nhập biệt danh...',
              hintStyle: TextStyle(color: isDark ? Colors.white38 : Colors.black38),
              filled: true,
              fillColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: isDark ? const Color(0xFF334155) : Colors.grey.shade300),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: isDark ? const Color(0xFF334155) : Colors.grey.shade300),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 1.5),
              ),
            ),
            maxLength: 100,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx),
              child: Text(
                'Hủy',
                style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
              ),
            ),
            if (currentAlias.isNotEmpty)
              TextButton(
                onPressed: () {
                  Navigator.pop(dialogCtx);
                  setState(() {
                    _aliases = Map.from(_aliases)..remove(peerId);
                  });
                  AppToast.show(
                    context,
                    message: 'Đã xóa biệt danh',
                    type: AppToastType.success,
                  );
                  widget.conversationService.deleteConversationAlias(
                    conversationId: widget.conversation.conversationId,
                    userId: peerId,
                  ).catchError((e) {
                    debugPrint("Error deleting alias: $e");
                    _loadAliases();
                    return <String, dynamic>{};
                  });
                },
                child: const Text('Xóa biệt danh', style: TextStyle(color: Colors.red)),
              ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
              onPressed: () {
                final newAlias = controller.text.trim();
                Navigator.pop(dialogCtx);
                setState(() {
                  if (newAlias.isEmpty) {
                    _aliases = Map.from(_aliases)..remove(peerId);
                  } else {
                    _aliases = Map.from(_aliases)..[peerId] = newAlias;
                  }
                });
                AppToast.show(
                  context,
                  message: 'Đã cập nhật biệt danh',
                  type: AppToastType.success,
                );
                if (newAlias.isEmpty) {
                  widget.conversationService.deleteConversationAlias(
                    conversationId: widget.conversation.conversationId,
                    userId: peerId,
                  ).catchError((e) {
                    debugPrint("Error deleting alias: $e");
                    _loadAliases();
                    return <String, dynamic>{};
                  });
                } else {
                  widget.conversationService.setConversationAlias(
                    conversationId: widget.conversation.conversationId,
                    userId: peerId,
                    alias: newAlias,
                  ).catchError((e) {
                    debugPrint("Error setting alias: $e");
                    _loadAliases();
                    return <String, dynamic>{};
                  });
                }
              },
              child: const Text('Lưu'),
            ),
          ],
        );
      },
    );
  }
}
