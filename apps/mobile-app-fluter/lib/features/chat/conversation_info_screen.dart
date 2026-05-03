import "package:flutter/material.dart";
import "package:mobile_app_fluter/models/user_profile.dart";
import "../../models/conversation_summary.dart";
import "../../services/conversation_service.dart";
import "../shared/widgets/user_avatar.dart";
import "../../services/app_services.dart";
import "package:provider/provider.dart";
import "../../state/session_controller.dart";

class ConversationInfoScreen extends StatefulWidget {
  final ConversationSummary conversation;
  final ConversationService conversationService;

  const ConversationInfoScreen({
    super.key,
    required this.conversation,
    required this.conversationService,
  });

  @override
  State<ConversationInfoScreen> createState() => _ConversationInfoScreenState();
}

class _ConversationInfoScreenState extends State<ConversationInfoScreen> {
  bool _loading = false;
  List<Map<String, dynamic>> _members = [];
  final Map<String, dynamic> _profileCache = {};
  List<dynamic> _friends = [];

  @override
  void initState() {
    super.initState();
    if (widget.conversation.isGroup) {
      _loadData();
    }
  }

  Future<void> _loadData() async {
    if (!widget.conversation.isGroup) {
      setState(() => _loading = false);
      return;
    }

    final services = context.read<AppServices>();
    setState(() => _loading = true);
    
    // 1. Load members (Main Priority)
    try {
      final groupId = widget.conversation.groupId ?? widget.conversation.conversationId;
      final members = await services.groupService.listMembers(groupId);
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
      final friends = await services.userService.listFriends();
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
      final messages = await services.conversationService.listMessages(widget.conversation.conversationId, limit: 50);
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
    final services = context.read<AppServices>();
    try {
      final profile = await services.userService.getUserById(userId);
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
    final title = widget.conversation.title;
    final isGroup = widget.conversation.isGroup;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(isGroup ? "Thông tin nhóm" : "Thông tin hội thoại", style: const TextStyle(color: Color(0xFF1E1B4B))),
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: Color(0xFF1E1B4B)),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            const SizedBox(height: 24),
            Center(
              child: Column(
                children: [
                  UserAvatar(
                    userId: isGroup ? null : widget.conversation.getPeerId(context.read<SessionController>().user?.id),
                    groupId: isGroup ? widget.conversation.groupId : null,
                    initialAvatarUrl: isGroup ? widget.conversation.groupAvatarUrl : (widget.conversation.peerAvatarUrl ?? widget.conversation.avatarUrl),
                    initialDisplayName: title,
                    radius: 50,
                    showStatus: !isGroup,
                    isActive: !isGroup && widget.conversation.getPeerId(context.read<SessionController>().user?.id) != null, // Note: We don't have realtime presence here easily without a stream, but we can at least show the status indicator if we had the state.
                    userService: context.read<AppServices>().userService,
                    groupService: context.read<AppServices>().groupService,
                  ),
                  const SizedBox(height: 16),
                  Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1E1B4B))),
                  if (isGroup) ...[
                    const SizedBox(height: 4),
                    Text("${_members.length} thành viên", style: TextStyle(color: Colors.grey[600])),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 32),
            if (isGroup) ...[
              _buildGroupSection(),
              const SizedBox(height: 24),
            ],
            _buildActionSection(),
            const SizedBox(height: 24),
            _buildDangerZone(),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildGroupSection() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
      child: Column(
        children: [
          _buildListTile(
            Icons.people_outline,
            "Xem thành viên",
            onTap: () => _showMembersSheet(),
          ),
          const Divider(height: 1, indent: 56),
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
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
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
                // We'll use a trick: whenever the parent state changes, 
                // we might need to sync. But here we can just pass 
                // the setSheetState to our fetch method if we wanted to.
                // However, simpler is to just rebuild when the sheet is open.
                
                return Container(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      const Text("Thành viên nhóm", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 16),
                      Expanded(
                        child: ListView.builder(
                          controller: scrollController,
                          itemCount: _members.length,
                          itemBuilder: (context, index) {
                            final m = _members[index];
                            final userId = m["userId"];
                            
                            // If profile not in cache, fetch it and refresh sheet
                            if (userId != null && !_profileCache.containsKey(userId)) {
                              _fetchProfile(userId).then((_) {
                                if (context.mounted) setSheetState(() {});
                              });
                            }

                            final UserProfile? profile = _profileCache[userId];
                            
                            // Fallback logic
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
                            
                            final session = context.read<SessionController>();
                            final isMe = userId == session.user?.id;
                            
                            final fullName = isMe ? "Bạn" : (profile?.fullName ?? fallbackName ?? m["fullName"] ?? "Thành viên");
                            final avatarUrl = isMe ? session.user?.avatarUrl : (profile?.avatarUrl ?? fallbackAvatar ?? m["avatarUrl"]);

                            return ListTile(
                              leading: UserAvatar(
                                userId: userId,
                                userService: context.read<AppServices>().userService,
                                initialAvatarUrl: avatarUrl,
                                initialDisplayName: fullName,
                                radius: 18,
                              ),
                              title: Text(fullName),
                              subtitle: Text(m["roleInGroup"] ?? "MEMBER"),
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
    // For now, just a placeholder or navigate back to create group? 
    // Ideally a friend picker.
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Tính năng đang phát triển")));
  }

  Widget _buildActionSection() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
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
          const Divider(height: 1, indent: 56),
          _buildListTile(
            Icons.notifications_off_outlined,
            "Tắt thông báo",
            trailing: Switch(
              value: widget.conversation.isMuted,
              activeColor: const Color(0xFF7C3AED),
              onChanged: (v) => _toggleMute(v),
            ),
          ),
          const Divider(height: 1, indent: 56),
          _buildListTile(Icons.photo_outlined, "Ảnh & Video đã gửi", onTap: () {}),
          const Divider(height: 1, indent: 56),
          _buildListTile(Icons.link, "Link đã chia sẻ", onTap: () {}),
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(pinned ? "Đã ghim" : "Đã bỏ ghim")));
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi: $e")));
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(mute ? "Đã tắt thông báo" : "Đã bật thông báo")));
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi: $e")));
    }
  }

  Widget _buildDangerZone() {
    final isGroup = widget.conversation.isGroup;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
      child: Column(
        children: [
          if (!isGroup) ...[
            _buildListTile(Icons.block, "Chặn người dùng", textColor: Colors.red, iconColor: Colors.red, onTap: () {}),
            const Divider(height: 1, indent: 56),
          ],
          _buildListTile(Icons.delete_outline, "Xóa lịch sử trò chuyện", textColor: Colors.red, iconColor: Colors.red, onTap: () {}),
          const Divider(height: 1, indent: 56),
          if (!isGroup)
            _buildListTile(Icons.person_remove_outlined, "Hủy kết bạn", textColor: Colors.red, iconColor: Colors.red, onTap: () {})
          else
            _buildListTile(Icons.logout, "Rời khỏi nhóm", textColor: Colors.red, iconColor: Colors.red, onTap: () => _leaveGroup()),
        ],
      ),
    );
  }

  Future<void> _leaveGroup() async {
    final services = context.read<AppServices>();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Rời khỏi nhóm?"),
        content: const Text("Bạn sẽ không thể xem tin nhắn mới trong nhóm này."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Hủy")),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text("Rời nhóm", style: TextStyle(color: Colors.red))),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _loading = true);
      try {
        final groupId = widget.conversation.groupId ?? widget.conversation.conversationId;
        await services.groupService.leaveGroup(groupId);
        if (mounted) {
          Navigator.pop(context); // Back to info
          Navigator.pop(context); // Back to list
        }
      } catch (e) {
        if (mounted) setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi: $e")));
      }
    }
  }

  Widget _buildListTile(IconData icon, String title, {Color? textColor, Color? iconColor, Widget? trailing, VoidCallback? onTap}) {
    return ListTile(
      leading: Icon(icon, color: iconColor ?? const Color(0xFF64748B)),
      title: Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: textColor ?? const Color(0xFF1E1B4B))),
      trailing: trailing ?? const Icon(Icons.chevron_right, size: 20, color: Color(0xFFCBD5E1)),
      onTap: onTap,
    );
  }
}
