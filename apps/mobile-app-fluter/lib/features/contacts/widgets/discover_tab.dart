import "package:flutter/material.dart";
import "package:skeletonizer/skeletonizer.dart";
import "package:flutter_contacts/flutter_contacts.dart";
import "package:permission_handler/permission_handler.dart";
import "../../../services/user_service.dart";
import "../../../models/user_profile.dart";
import "../../shared/widgets/user_avatar.dart";
import "../../shared/widgets/app_toast.dart";

class DiscoverTab extends StatefulWidget {
  final UserService userService;
  const DiscoverTab({super.key, required this.userService});

  @override
  State<DiscoverTab> createState() => _DiscoverTabState();
}

class _DiscoverTabState extends State<DiscoverTab> with AutomaticKeepAliveClientMixin {
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _syncedUsers = [];
  bool _isLoading = true;
  bool _isSyncing = false;
  String _searchQuery = "";
  // Track pending request states by userId
  final Map<String, String> _pendingStates = {};

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final users = await widget.userService.discoverUsers(
        query: _searchQuery.isEmpty ? null : _searchQuery,
        mode: "friend",
      );
      if (mounted) {
        setState(() {
          // Filter out friends and users with pending outgoing from our side
          // Keep NONE, INCOMING_REQUEST (can accept), and OUTGOING_REQUEST (show sent state)
          _users = users.where((u) {
            final rel = u['relationState'] as String? ?? 'NONE';
            return rel != 'FRIEND';
          }).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            decoration: BoxDecoration(color: Theme.of(context).cardTheme.color ?? (Theme.of(context).brightness == Brightness.dark ? const Color(0xFF1E293B) : Colors.white), borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Theme.of(context).brightness == Brightness.dark ? Colors.transparent : Colors.black.withOpacity(0.05), blurRadius: 10)]),
            child: TextField(
              onChanged: (v) { _searchQuery = v; _loadUsers(); },
              decoration: const InputDecoration(hintText: "Tìm kiếm cư dân...", prefixIcon: Icon(Icons.search, color: Color(0xFF7C3AED)), border: InputBorder.none, contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12)),
            ),
          ),
        ),
        if (!_isSyncing) Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Material(
            color: Theme.of(context).cardTheme.color ?? (Theme.of(context).brightness == Brightness.dark ? const Color(0xFF1E293B) : Colors.white),
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: _syncContacts,
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    const Icon(Icons.contact_phone_outlined, color: Color(0xFF7C3AED)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text("Tìm bạn từ danh bạ máy", style: TextStyle(fontWeight: FontWeight.w600, color: Theme.of(context).brightness == Brightness.dark ? Colors.white : const Color(0xFF1E1B4B))),
                    ),
                    Icon(Icons.chevron_right, color: Colors.grey[400]),
                  ],
                ),
              ),
            ),
          ),
        ) else const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator(strokeWidth: 2))),
        const SizedBox(height: 16),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadUsers,
            color: const Color(0xFF7C3AED),
            child: Skeletonizer(
              enabled: _isLoading,
              child: _users.isEmpty && !_isLoading
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _isLoading ? 5 : (_syncedUsers.length + _users.length),
                      itemBuilder: (context, index) {
                        if (_isLoading) return _buildSkeletonItem();
                        if (index < _syncedUsers.length) {
                          final userData = _syncedUsers[index];
                          final user = UserProfile.fromJson(userData);
                          final rel = userData['relationState'] as String? ?? 'NONE';
                          return _buildUserItem(user, userData: userData, relationState: rel, isSuggested: true);
                        }
                        final userData = _users[index - _syncedUsers.length];
                        final user = UserProfile.fromJson(userData);
                        final rel = userData['relationState'] as String? ?? 'NONE';
                        return _buildUserItem(user, userData: userData, relationState: rel);
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildUserItem(UserProfile user, {required Map<String, dynamic> userData, required String relationState, bool isSuggested = false}) {
    // Check local pending state override (after user taps a button)
    final effectiveState = _pendingStates[user.id] ?? relationState;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Theme.of(context).cardTheme.color ?? (isDark ? const Color(0xFF1E293B) : Colors.white), borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: isDark ? Colors.transparent : Colors.black.withOpacity(0.02), blurRadius: 5)]),
      child: Row(
        children: [
          UserAvatar(
            userId: user.id,
            initialAvatarUrl: user.avatarUrl,
            initialDisplayName: user.fullName,
            radius: 28,
            userService: widget.userService,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(child: Text(user.fullName, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: isDark ? Colors.white : const Color(0xFF1E1B4B)), overflow: TextOverflow.ellipsis)),
                    if (isSuggested) Container(
                      margin: const EdgeInsets.only(left: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFF7C3AED).withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                      child: const Text("Từ danh bạ", style: TextStyle(color: Color(0xFF7C3AED), fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                Text(user.role, style: TextStyle(color: Colors.grey[500], fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _buildActionButton(user.id, effectiveState),
        ],
      ),
    );
  }

  Widget _buildActionButton(String userId, String relationState) {
    switch (relationState) {
      case 'INCOMING_REQUEST':
        // They sent a request to us — show Accept button
        return ElevatedButton.icon(
          onPressed: () => _acceptRequest(userId),
          icon: const Icon(Icons.check, size: 16),
          label: const Text("Chấp nhận"),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            textStyle: const TextStyle(fontSize: 13),
          ),
        );
      case 'OUTGOING_REQUEST':
        // We already sent — show disabled state
        return OutlinedButton(
          onPressed: () => _cancelRequest(userId),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.grey,
            side: const BorderSide(color: Colors.grey),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            textStyle: const TextStyle(fontSize: 13),
          ),
          child: const Text("Đã gửi"),
        );
      case 'FRIEND':
        return const SizedBox.shrink();
      default: // NONE
        return ElevatedButton(
          onPressed: () => _sendRequest(userId),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF7C3AED),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            textStyle: const TextStyle(fontSize: 13),
          ),
          child: const Text("Kết bạn"),
        );
    }
  }

  Future<void> _sendRequest(String userId) async {
    // Optimistic update
    setState(() => _pendingStates[userId] = 'OUTGOING_REQUEST');
    try {
      await widget.userService.sendFriendRequest(userId);
      if (mounted) {
        AppToast.show(
          context,
          message: "Đã gửi yêu cầu kết bạn",
          type: AppToastType.success,
        );
      }
    } catch (e) {
      // Revert optimistic update
      if (mounted) {
        setState(() => _pendingStates.remove(userId));
        final errMsg = e.toString().contains('already sent you') 
            ? 'Người này đã gửi yêu cầu cho bạn. Hãy chấp nhận trong tab Yêu cầu.'
            : 'Lỗi: $e';
        AppToast.show(
          context,
          message: errMsg,
          type: AppToastType.error,
        );
        // If conflict due to incoming request, update state accordingly
        if (e.toString().contains('already sent you')) {
          setState(() => _pendingStates[userId] = 'INCOMING_REQUEST');
        }
      }
    }
  }

  Future<void> _cancelRequest(String userId) async {
    setState(() => _pendingStates[userId] = 'NONE');
    try {
      await widget.userService.cancelFriendRequest(userId);
      if (mounted) {
        AppToast.show(
          context,
          message: "Đã hủy yêu cầu kết bạn",
          type: AppToastType.success,
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _pendingStates[userId] = 'OUTGOING_REQUEST');
        AppToast.show(
          context,
          message: "Lỗi: $e",
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _acceptRequest(String userId) async {
    setState(() => _pendingStates[userId] = 'FRIEND');
    try {
      await widget.userService.acceptFriendRequest(userId);
      if (mounted) {
        AppToast.show(
          context,
          message: "Đã kết bạn thành công!",
          type: AppToastType.success,
        );
        // Remove from list
        setState(() {
          _users.removeWhere((u) {
            final uid = u['userId'] as String? ?? u['id'] as String? ?? '';
            return uid == userId;
          });
          _pendingStates.remove(userId);
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _pendingStates[userId] = 'INCOMING_REQUEST');
        AppToast.show(
          context,
          message: "Lỗi: $e",
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _syncContacts() async {
    setState(() => _isSyncing = true);
    try {
      if (await Permission.contacts.request().isGranted) {
        final contacts = await FlutterContacts.getAll(
          properties: {ContactProperty.name, ContactProperty.phone},
        );
        final phones = contacts
            .expand((c) => c.phones)
            .map((p) => p.number.replaceAll(RegExp(r"\D"), ""))
            .where((p) => p.isNotEmpty)
            .toList();

        if (phones.isNotEmpty) {
          final matched = await widget.userService.syncContacts(phones);
          if (mounted) {
            final messenger = ScaffoldMessenger.of(context);
            setState(() {
              _syncedUsers = matched.where((u) {
                final rel = u['relationState'] as String? ?? 'NONE';
                return rel != 'FRIEND';
              }).toList();
              _isSyncing = false;
            });
            if (matched.isEmpty) {
              AppToast.show(
                context,
                message: "Không tìm thấy bạn bè nào từ danh bạ",
                type: AppToastType.info,
              );
            }
          }
        } else {
          if (mounted) {
            setState(() => _isSyncing = false);
            AppToast.show(
              context,
              message: "Danh bạ trống",
              type: AppToastType.warning,
            );
          }
        }
      } else {
        if (mounted) {
          setState(() => _isSyncing = false);
          AppToast.show(
            context,
            message: "Cần quyền truy cập danh bạ để sử dụng tính năng này",
            type: AppToastType.warning,
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSyncing = false);
        AppToast.show(
          context,
          message: "Lỗi đồng bộ: $e",
          type: AppToastType.error,
        );
      }
    }
  }

  Widget _buildSkeletonItem() {
    return Card(elevation: 0, margin: const EdgeInsets.only(bottom: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), child: const ListTile(leading: CircleAvatar(radius: 28), title: Bone.text(width: 100), subtitle: Bone.text(width: 150)));
  }

  Widget _buildEmptyState() {
    return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.person_search_outlined, size: 80, color: Colors.grey[200]), const SizedBox(height: 16), Text("Không tìm thấy cư dân nào", style: TextStyle(color: Colors.grey[400], fontSize: 16))]));
  }
}
