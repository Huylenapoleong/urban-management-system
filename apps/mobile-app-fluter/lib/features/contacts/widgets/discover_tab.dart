import "package:flutter/material.dart";
import "package:skeletonizer/skeletonizer.dart";
import "package:flutter_contacts/flutter_contacts.dart";
import "package:permission_handler/permission_handler.dart";
import "../../../services/user_service.dart";
import "../../../models/user_profile.dart";
import "../../shared/widgets/user_avatar.dart";

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
          _users = users;
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
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10)]),
            child: TextField(
              onChanged: (v) { _searchQuery = v; _loadUsers(); },
              decoration: const InputDecoration(hintText: "Tìm kiếm cư dân...", prefixIcon: Icon(Icons.search, color: Color(0xFF7C3AED)), border: InputBorder.none, contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12)),
            ),
          ),
        ),
        if (!_isSyncing) Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Material(
            color: Colors.white,
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
                    const Expanded(
                      child: Text("Tìm bạn từ danh bạ máy", style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF1E1B4B))),
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
                          return _buildUserItem(user, isSuggested: true);
                        }
                        final userData = _users[index - _syncedUsers.length];
                        final user = UserProfile.fromJson(userData);
                        return _buildUserItem(user);
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildUserItem(UserProfile user, {bool isSuggested = false}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 5)]),
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
                    Text(user.fullName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF1E1B4B))),
                    if (isSuggested) Container(
                      margin: const EdgeInsets.only(left: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFF7C3AED).withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                      child: const Text("Từ danh bạ", style: TextStyle(color: Color(0xFF7C3AED), fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                Text(user.role ?? "Cư dân", style: TextStyle(color: Colors.grey[500], fontSize: 13)),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: () => _sendRequest(user.id),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF7C3AED), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)), elevation: 0),
            child: const Text("Kết bạn"),
          ),
        ],
      ),
    );
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
            setState(() {
              _syncedUsers = matched;
              _isSyncing = false;
            });
            if (matched.isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Không tìm thấy bạn bè nào từ danh bạ")));
            }
          }
        } else {
          if (mounted) setState(() => _isSyncing = false);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Danh bạ trống")));
        }
      } else {
        if (mounted) setState(() => _isSyncing = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Cần quyền truy cập danh bạ để sử dụng tính năng này")));
      }
    } catch (e) {
      if (mounted) setState(() => _isSyncing = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi đồng bộ: $e")));
    }
  }

  Future<void> _sendRequest(String userId) async {
    try {
      await widget.userService.sendFriendRequest(userId);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Đã gửi yêu cầu kết bạn")));
      _loadUsers();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi: $e")));
    }
  }

  Widget _buildSkeletonItem() {
    return Card(elevation: 0, margin: const EdgeInsets.only(bottom: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), child: const ListTile(leading: CircleAvatar(radius: 28), title: Bone.text(width: 100), subtitle: Bone.text(width: 150)));
  }

  Widget _buildEmptyState() {
    return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.person_search_outlined, size: 80, color: Colors.grey[200]), const SizedBox(height: 16), Text("Không tìm thấy cư dân nào", style: TextStyle(color: Colors.grey[400], fontSize: 16))]));
  }
}
