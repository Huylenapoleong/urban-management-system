import "dart:async";
import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../services/app_services.dart";
import "../../models/user_profile.dart";
import "../../state/session_controller.dart";
import "../shared/widgets/user_avatar.dart";
import "../shared/widgets/app_toast.dart";

class CreateGroupScreen extends StatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  State<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends State<CreateGroupScreen> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  final _searchController = TextEditingController();
  String _groupType = "OFFICIAL";
  List<UserProfile> _users = [];
  final Set<String> _selectedUserIds = {};
  final Map<String, UserProfile> _selectedUsers = {};
  bool _isLoadingUsers = true;
  bool _isCreating = false;
  bool _isOfficial = false;
  Timer? _debounce;

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

  final List<Map<String, dynamic>> _types = [
    {"id": "OFFICIAL", "label": "Chính thức", "icon": Icons.verified_user, "desc": "Nhóm thông tin chính thống từ cơ quan"},
    {"id": "TOPIC", "label": "Chủ đề", "icon": Icons.topic, "desc": "Nhóm thảo luận về các vấn đề xã hội"},
    {"id": "AREA", "label": "Khu vực", "icon": Icons.location_on, "desc": "Dành cho cư dân trong cùng địa bàn"},
    {"id": "PRIVATE", "label": "Riêng tư", "icon": Icons.lock, "desc": "Chỉ những người được mời mới có thể tham gia"},
  ];

  static const _officialRoles = {"ADMIN", "PROVINCE_OFFICER", "WARD_OFFICER", "OFFICER"};

  @override
  void initState() {
    super.initState();
    final role = context.read<SessionController>().user?.role.toUpperCase() ?? "";
    _isOfficial = _officialRoles.contains(role);
    _loadUsers();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _loadUsers({String query = ""}) async {
    setState(() => _isLoadingUsers = true);
    final currentUserId = context.read<SessionController>().user?.id;
    final userService = context.read<AppServices>().userService;
    try {
      List<UserProfile> result;
      if (_isOfficial) {
        // Official: search all users in the system
        result = await userService.listUsers(
          query: query.trim().isEmpty ? null : query.trim(),
          limit: 30,
        );
      } else {
        // Citizen: load friends only
        final raw = await userService.listFriends();
        result = raw.map((f) => UserProfile.fromJson(f)).toList();
        // Apply local filter for citizen
        if (query.trim().isNotEmpty) {
          result = result.where((u) =>
            u.fullName.toLowerCase().contains(query.toLowerCase())
          ).toList();
        }
      }

      // Filter out the current user themselves
      if (currentUserId != null) {
        result = result.where((u) => u.id != currentUserId).toList();
      }

      if (mounted) {
        setState(() {
          _users = result;
          _isLoadingUsers = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoadingUsers = false);
    }
  }

  void _onSearchChanged(String value) {
    if (_isOfficial) {
      // Debounce API call for officials
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 400), () {
        _loadUsers(query: value);
      });
    } else {
      // Local filter for citizens
      _loadUsers(query: value);
    }
  }

  Future<void> _handleCreate() async {
    if (_nameController.text.trim().isEmpty) {
      AppToast.show(
        context,
        message: "Vui lòng nhập tên nhóm",
        type: AppToastType.warning,
      );
      return;
    }

    setState(() => _isCreating = true);
    final groupService = context.read<AppServices>().groupService;

    try {
      await groupService.createGroup(
        groupName: _nameController.text.trim(),
        groupType: _groupType,
        description: _descController.text.trim(),
        userIds: _selectedUserIds.toList(),
      );
      if (mounted) {
        Navigator.pop(context, true);
        AppToast.show(
          context,
          message: "Tạo nhóm thành công",
          type: AppToastType.success,
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isCreating = false);
        AppToast.show(
          context,
          message: "Lỗi: $e",
          type: AppToastType.error,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = _isDark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          "Tạo nhóm mới",
          style: TextStyle(color: isDark ? Colors.white : const Color(0xFF1E1B4B), fontWeight: FontWeight.bold),
        ),
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        centerTitle: true,
        iconTheme: IconThemeData(color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
        actions: [
          if (_isCreating)
            const Padding(
              padding: EdgeInsets.all(16.0),
              child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            TextButton(
              onPressed: _handleCreate,
              child: const Text(
                "TẠO",
                style: TextStyle(color: Color(0xFF7C3AED), fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ),
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildGroupInfoSection(),
            _buildTypeSection(),
            _buildMemberSelectionSection(),
          ],
        ),
      ),
    );
  }

  Widget _buildGroupInfoSection() {
    final isDark = _isDark;
    return Container(
      color: isDark ? const Color(0xFF1E293B) : Colors.white,
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFFC084FC), Color(0xFF7C3AED)]),
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: const Color(0xFF7C3AED).withValues(alpha: 0.3), blurRadius: 10, offset: const Offset(0, 4))],
                ),
                child: const Icon(Icons.camera_alt, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  children: [
                    TextField(
                      controller: _nameController,
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: isDark ? Colors.white : Colors.black),
                      decoration: InputDecoration(
                        hintText: "Tên nhóm (bắt buộc)",
                        hintStyle: TextStyle(color: isDark ? Colors.grey[400] : Colors.grey, fontSize: 18),
                        border: UnderlineInputBorder(borderSide: BorderSide(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0))),
                        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0))),
                        focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF7C3AED), width: 2)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _descController,
            maxLines: 3,
            style: TextStyle(color: isDark ? Colors.white : Colors.black),
            decoration: InputDecoration(
              hintText: "Mô tả về nhóm...",
              hintStyle: TextStyle(color: isDark ? Colors.grey[400] : Colors.grey),
              filled: true,
              fillColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.all(16),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTypeSection() {
    final isDark = _isDark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
          child: Text("LOẠI NHÓM", style: TextStyle(color: isDark ? Colors.grey[400] : const Color(0xFF64748B), fontWeight: FontWeight.bold, fontSize: 13, letterSpacing: 1.2)),
        ),
        SizedBox(
          height: 140,
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            scrollDirection: Axis.horizontal,
            itemCount: _types.length,
            itemBuilder: (context, index) {
              final type = _types[index];
              final isSelected = _groupType == type["id"];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                child: InkWell(
                  onTap: () => setState(() => _groupType = type["id"]),
                  borderRadius: BorderRadius.circular(16),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 150,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: isSelected ? const Color(0xFF7C3AED) : (isDark ? const Color(0xFF1E293B) : Colors.white),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        if (isSelected)
                          BoxShadow(color: const Color(0xFF7C3AED).withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 4))
                        else
                          BoxShadow(color: isDark ? Colors.transparent : Colors.black.withValues(alpha: 0.02), blurRadius: 4, offset: const Offset(0, 2)),
                      ],
                      border: Border.all(color: isSelected ? Colors.transparent : (isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0))),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(type["icon"], color: isSelected ? Colors.white : const Color(0xFF7C3AED), size: 28),
                        const SizedBox(height: 8),
                        Text(
                          type["label"],
                          style: TextStyle(color: isSelected ? Colors.white : (isDark ? Colors.white : const Color(0xFF1E1B4B)), fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        const SizedBox(height: 4),
                        Expanded(
                          child: Text(
                            type["desc"],
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: isSelected ? Colors.white70 : (isDark ? Colors.grey[400] : Colors.grey), fontSize: 10),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildMemberSelectionSection() {
    final isDark = _isDark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                "THÊM THÀNH VIÊN (${_selectedUserIds.length})",
                style: TextStyle(color: isDark ? Colors.grey[400] : const Color(0xFF64748B), fontWeight: FontWeight.bold, fontSize: 13, letterSpacing: 1.2),
              ),
              if (_selectedUserIds.isNotEmpty)
                TextButton(
                  onPressed: () => setState(() {
                    _selectedUserIds.clear();
                    _selectedUsers.clear();
                  }),
                  child: const Text("Xóa tất cả", style: TextStyle(color: Colors.redAccent, fontSize: 13)),
                ),
            ],
          ),
        ),

        // Selected chips
        if (_selectedUsers.isNotEmpty)
          SizedBox(
            height: 60,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _selectedUsers.length,
              itemBuilder: (context, i) {
                final user = _selectedUsers.values.elementAt(i);
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Chip(
                    avatar: CircleAvatar(
                      backgroundImage: user.avatarUrl != null ? NetworkImage(user.avatarUrl!) : null,
                      backgroundColor: const Color(0xFF7C3AED),
                      child: user.avatarUrl == null
                          ? Text(user.fullName.isNotEmpty ? user.fullName[0] : "?", style: const TextStyle(color: Colors.white, fontSize: 12))
                          : null,
                    ),
                    label: Text(user.fullName.split(" ").last, style: const TextStyle(fontSize: 12)),
                    deleteIcon: const Icon(Icons.close, size: 14),
                    onDeleted: () => setState(() {
                      _selectedUserIds.remove(user.id);
                      _selectedUsers.remove(user.id);
                    }),
                    backgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                    side: BorderSide(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
                  ),
                );
              },
            ),
          ),

        const SizedBox(height: 8),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 20),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
          ),
          child: TextField(
            controller: _searchController,
            onChanged: _onSearchChanged,
            style: TextStyle(color: isDark ? Colors.white : Colors.black),
            decoration: InputDecoration(
              hintText: _isOfficial ? "Tìm kiếm người dùng..." : "Tìm kiếm bạn bè...",
              hintStyle: TextStyle(color: isDark ? Colors.grey[400] : Colors.grey),
              prefixIcon: const Icon(Icons.search, color: Color(0xFF7C3AED), size: 20),
              suffixIcon: _isLoadingUsers
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : null,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
        ),
        const SizedBox(height: 12),

        if (_isOfficial && _searchController.text.isEmpty && _users.isEmpty && !_isLoadingUsers)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                children: [
                  Icon(Icons.search, size: 48, color: isDark ? Colors.grey[600] : Colors.grey[400]),
                  const SizedBox(height: 12),
                  Text(
                    "Nhập tên để tìm kiếm người dùng",
                    style: TextStyle(color: isDark ? Colors.grey[500] : Colors.grey),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          )
        else if (_isLoadingUsers && _users.isEmpty)
          const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
        else if (!_isOfficial && _users.isEmpty && !_isLoadingUsers)
          Center(child: Padding(padding: const EdgeInsets.all(40), child: Text("Bạn chưa có bạn bè nào để thêm", style: TextStyle(color: isDark ? Colors.grey[500] : Colors.grey))))
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: _users.length,
            itemBuilder: (context, index) {
              final user = _users[index];
              final isSelected = _selectedUserIds.contains(user.id);
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: isSelected ? const Color(0x1A7C3AED) : (isDark ? const Color(0xFF1E293B) : Colors.white),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: isSelected ? const Color(0xFF7C3AED) : (isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0))),
                ),
                child: ListTile(
                  leading: UserAvatar(
                    userId: user.id,
                    initialAvatarUrl: user.avatarUrl,
                    initialDisplayName: user.fullName,
                    radius: 20,
                  ),
                  title: Text(user.fullName, style: TextStyle(fontWeight: FontWeight.w600, color: isDark ? Colors.white : Colors.black87)),
                  subtitle: user.role.isNotEmpty
                      ? Text(_roleLabel(user.role), style: TextStyle(fontSize: 11, color: isDark ? Colors.grey[400] : Colors.grey[600]))
                      : null,
                  trailing: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Icon(
                      isSelected ? Icons.check_circle : Icons.add_circle_outline,
                      key: ValueKey(isSelected),
                      color: isSelected ? const Color(0xFF7C3AED) : (isDark ? Colors.grey[600] : const Color(0xFFCBD5E1)),
                    ),
                  ),
                  onTap: () {
                    setState(() {
                      if (isSelected) {
                        _selectedUserIds.remove(user.id);
                        _selectedUsers.remove(user.id);
                      } else {
                        _selectedUserIds.add(user.id);
                        _selectedUsers[user.id] = user;
                      }
                    });
                  },
                ),
              );
            },
          ),
        const SizedBox(height: 40),
      ],
    );
  }

  String _roleLabel(String role) {
    switch (role.toUpperCase()) {
      case "ADMIN": return "Quản trị viên";
      case "PROVINCE_OFFICER": return "Cán bộ tỉnh";
      case "WARD_OFFICER": return "Cán bộ phường";
      case "OFFICER": return "Cán bộ";
      case "CITIZEN": return "Công dân";
      default: return role;
    }
  }
}
