import "dart:async";
import "package:flutter/material.dart";
import "package:skeletonizer/skeletonizer.dart";
import "../../../services/user_service.dart";
import "../../../models/user_profile.dart";
import "../../../services/app_services.dart";
import "package:provider/provider.dart";
import "../../shared/widgets/user_avatar.dart";
import "../../chat/chat_detail_screen.dart";
import "../../profile/profile_screen.dart";
import "../../../models/conversation_summary.dart";
import "../../../state/session_controller.dart";

class FriendListTab extends StatefulWidget {
  final UserService userService;
  final bool isOfficial;
  const FriendListTab({super.key, required this.userService, this.isOfficial = false});

  @override
  State<FriendListTab> createState() => _FriendListTabState();
}

class _FriendListTabState extends State<FriendListTab> with AutomaticKeepAliveClientMixin {
  List<UserProfile> _friends = [];
  bool _isLoading = true;
  String _searchQuery = "";
  UserProfile? _currentUser;

  StreamSubscription? _presenceSub;
  StreamSubscription? _snapshotSub;
  StreamSubscription? _readySub;
  Map<String, dynamic> _userPresence = {};

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadFriends();

    final socketService = context.read<AppServices>().socketService;

    _presenceSub = socketService.onPresenceUpdated.listen((data) {
      final presence = data["presence"] ?? data;
      final userId = presence["userId"]?.toString();
      if (mounted && userId != null) {
        setState(() {
          _userPresence = Map<String, dynamic>.from(_userPresence);
          _userPresence[userId] = presence;
        });
      }
    });

    _snapshotSub = socketService.onPresenceSnapshot.listen((data) {
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

    _readySub = socketService.onChatReady.listen((_) {
      if (mounted) {
        for (final f in _friends) {
          socketService.joinConversation("dm:${f.id}");
        }
      }
    });
  }

  @override
  void dispose() {
    _presenceSub?.cancel();
    _snapshotSub?.cancel();
    _readySub?.cancel();
    super.dispose();
  }

  Future<void> _loadFriends() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      List<UserProfile> friends;
      final session = context.read<SessionController>();
      if (widget.isOfficial) {
        final locationCode = session.user?.locationCode;
        final currentUserId = session.user?.id;
        final raw = await widget.userService.listUsers(
          locationCode: (session.user?.role == 'ADMIN' || session.user?.role == 'PROVINCE_OFFICER') ? null : locationCode,
          limit: 100,
        );
        friends = raw.where((u) => u.id != currentUserId).toList();
      } else {
        final raw = await widget.userService.listFriends();
        friends = raw
            .map((f) => UserProfile.fromJson(f))
            .toList();
      }

      if (mounted) {
        final socketService = context.read<AppServices>().socketService;
        setState(() {
          _friends = friends;
          _isLoading = false;
          _currentUser = session.user;
        });

        // Join conversation room for each friend to receive updates
        for (final f in friends) {
          socketService.joinConversation("dm:${f.id}");

          // Proactively fetch initial presence
          if (!_userPresence.containsKey(f.id)) {
            widget.userService.getUserPresence(f.id).then((presence) {
              if (mounted) {
                setState(() {
                  _userPresence = Map<String, dynamic>.from(_userPresence);
                  _userPresence[f.id] = presence;
                });
              }
            }).catchError((_) {});
          }
        }
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<UserProfile> get _filteredFriends {
    if (_searchQuery.isEmpty) return _friends;
    return _friends.where((f) {
      return f.fullName.toLowerCase().contains(_searchQuery.toLowerCase());
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            decoration: BoxDecoration(
              color: Theme.of(context).cardTheme.color ?? (Theme.of(context).brightness == Brightness.dark ? const Color(0xFF1E293B) : Colors.white),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [BoxShadow(color: Theme.of(context).brightness == Brightness.dark ? Colors.transparent : Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: widget.isOfficial ? "Tìm kiếm cư dân..." : "Tìm kiếm bạn bè...",
                prefixIcon: const Icon(Icons.search, color: Color(0xFF7C3AED)),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadFriends,
            color: const Color(0xFF7C3AED),
            child: Skeletonizer(
              enabled: _isLoading,
              child: _friends.isEmpty && !_isLoading
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _isLoading ? 5 : _filteredFriends.length,
                      itemBuilder: (context, index) {
                        if (_isLoading) return _buildSkeletonItem();
                        final friend = _filteredFriends[index];
                        return _buildFriendItem(friend);
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFriendItem(UserProfile friend) {
    final presence = _userPresence[friend.id];
    final isActive = (presence is Map && presence["isActive"] == true) || (presence == true);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color ?? (Theme.of(context).brightness == Brightness.dark ? const Color(0xFF1E293B) : Colors.white),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Theme.of(context).brightness == Brightness.dark ? Colors.transparent : Colors.black.withValues(alpha: 0.02), blurRadius: 5, offset: const Offset(0, 2))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: UserAvatar(
          userId: friend.id,
          initialAvatarUrl: friend.avatarUrl,
          initialDisplayName: friend.fullName,
          radius: 28,
          showStatus: true,
          isActive: isActive,
          userService: widget.userService,
        ),
        title: Text(friend.fullName, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Theme.of(context).brightness == Brightness.dark ? Colors.white : const Color(0xFF1E1B4B))),
        subtitle: Text(friend.email ?? (friend.role == "CITIZEN" ? "Cư dân" : "Cán bộ"), style: TextStyle(color: Colors.grey[500], fontSize: 13)),
        trailing: IconButton(
          icon: const Icon(Icons.more_horiz, color: Color(0xFF64748B)),
          onPressed: () => _showFriendOptions(friend),
        ),
        onTap: () {
          final services = context.read<AppServices>();
          Navigator.of(context, rootNavigator: true).push(
            MaterialPageRoute(
              builder: (_) => ChatDetailScreen(
                conversation: ConversationSummary(
                  conversationId: "dm:${friend.id}",
                  groupName: friend.fullName,
                  unreadCount: 0,
                  isGroup: false,
                  updatedAt: DateTime.now().toIso8601String(),
                  peerAvatarUrl: friend.avatarUrl,
                ),
                conversationService: services.conversationService,
                uploadService: services.uploadService,
                socketService: services.socketService,
                userService: services.userService,
                groupService: services.groupService,
                webRTCService: services.webRTCService,
                currentUser: _currentUser,
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSkeletonItem() {
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: const ListTile(
        leading: CircleAvatar(radius: 28),
        title: Bone.text(width: 100),
        subtitle: Bone.text(width: 150),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(widget.isOfficial ? Icons.person_search_outlined : Icons.people_outline, size: 80, color: Colors.grey[200]),
          const SizedBox(height: 16),
          Text(
            widget.isOfficial ? "Không tìm thấy người dùng nào trong khu vực" : "Chưa có bạn bè nào",
            style: TextStyle(color: Colors.grey[400], fontSize: 16),
          ),
        ],
      ),
    );
  }

  void _showFriendOptions(UserProfile friend) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: BoxDecoration(color: Theme.of(context).brightness == Brightness.dark ? const Color(0xFF1E293B) : Colors.white, borderRadius: const BorderRadius.vertical(top: Radius.circular(24))),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: Theme.of(context).brightness == Brightness.dark ? Colors.grey.shade700 : Colors.grey[300], borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.chat_bubble_outline, color: Color(0xFF7C3AED)),
                title: const Text("Nhắn tin"),
                onTap: () {
                  Navigator.pop(context);
                  final services = context.read<AppServices>();
                  Navigator.of(context, rootNavigator: true).push(
                    MaterialPageRoute(
                      builder: (_) => ChatDetailScreen(
                        conversation: ConversationSummary(
                          conversationId: "dm:${friend.id}",
                          groupName: friend.fullName,
                          unreadCount: 0,
                          isGroup: false,
                          updatedAt: DateTime.now().toIso8601String(),
                          peerAvatarUrl: friend.avatarUrl,
                        ),
                        conversationService: services.conversationService,
                        uploadService: services.uploadService,
                        socketService: services.socketService,
                        userService: services.userService,
                        groupService: services.groupService,
                        webRTCService: services.webRTCService,
                        currentUser: _currentUser,
                      ),
                    ),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.person_outline, color: Color(0xFF7C3AED)),
                title: const Text("Xem trang cá nhân"),
                onTap: () {
                  Navigator.pop(context);
                  final services = context.read<AppServices>();
                  Navigator.of(context, rootNavigator: true).push(
                    MaterialPageRoute(
                      builder: (_) => ProfileScreen(
                        user: friend,
                        userService: services.userService,
                        uploadService: services.uploadService,
                        onRefreshProfile: () => _loadFriends(),
                      ),
                    ),
                  );
                },
              ),
              if (!widget.isOfficial) ...[
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.person_remove_outlined, color: Colors.redAccent),
                  title: const Text("Hủy kết bạn", style: TextStyle(color: Colors.redAccent)),
                  onTap: () {
                    Navigator.pop(context);
                    _confirmRemoveFriend(friend);
                  },
                ),
              ],
              ListTile(
                leading: const Icon(Icons.block, color: Colors.redAccent),
                title: const Text("Chặn người dùng", style: TextStyle(color: Colors.redAccent)),
                onTap: () {
                  Navigator.pop(context);
                  // Block logic
                },
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmRemoveFriend(UserProfile friend) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Hủy kết bạn?"),
        content: Text("Bạn có chắc chắn muốn hủy kết bạn với ${friend.fullName}?"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Hủy")),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text("Hủy kết bạn", style: TextStyle(color: Colors.redAccent))),
        ],
      ),
    );

    if (ok == true) {
      try {
        await widget.userService.removeFriend(friend.id);
        _loadFriends();
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi: $e")));
      }
    }
  }
}
