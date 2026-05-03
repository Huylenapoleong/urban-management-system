import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../services/app_services.dart";
import "../../models/user_profile.dart";
import "../../state/session_controller.dart";
import "../shared/widgets/user_avatar.dart";

class CreateGroupScreen extends StatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  State<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends State<CreateGroupScreen> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  String _groupType = "OFFICIAL";
  List<UserProfile> _friends = [];
  final Set<String> _selectedUserIds = {};
  bool _isLoadingFriends = true;
  bool _isCreating = false;
  String _searchQuery = "";

  final List<Map<String, dynamic>> _types = [
    {"id": "OFFICIAL", "label": "Chính thức", "icon": Icons.verified_user, "desc": "Nhóm thông tin chính thống từ cơ quan"},
    {"id": "TOPIC", "label": "Chủ đề", "icon": Icons.topic, "desc": "Nhóm thảo luận về các vấn đề xã hội"},
    {"id": "AREA", "label": "Khu vực", "icon": Icons.location_on, "desc": "Dành cho cư dân trong cùng địa bàn"},
    {"id": "PRIVATE", "label": "Riêng tư", "icon": Icons.lock, "desc": "Chỉ những người được mời mới có thể tham gia"},
  ];

  @override
  void initState() {
    super.initState();
    _loadFriends();
  }

  Future<void> _loadFriends() async {
    final userService = context.read<AppServices>().userService;
    try {
      final raw = await userService.listFriends();
      final friends = raw.map((f) => UserProfile.fromJson(f)).toList();
      if (mounted) {
        setState(() {
          _friends = friends;
          _isLoadingFriends = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoadingFriends = false);
    }
  }

  List<UserProfile> get _filteredFriends {
    if (_searchQuery.isEmpty) return _friends;
    return _friends.where((f) {
      return f.fullName.toLowerCase().contains(_searchQuery.toLowerCase());
    }).toList();
  }

  Future<void> _handleCreate() async {
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Vui lòng nhập tên nhóm")),
      );
      return;
    }

    setState(() => _isCreating = true);
    final groupService = context.read<AppServices>().groupService;
    final session = context.read<SessionController>();
    
    try {
      await groupService.createGroup(
        groupName: _nameController.text.trim(),
        groupType: _groupType,
        locationCode: session.user?.locationCode ?? "VN-HCM-BQ1-P01",
        description: _descController.text.trim(),
        userIds: _selectedUserIds.toList(),
      );
      if (mounted) {
        Navigator.pop(context, true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Tạo nhóm thành công"),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isCreating = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Lỗi: $e"),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text(
          "Tạo nhóm mới",
          style: TextStyle(color: Color(0xFF1E1B4B), fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Color(0xFF1E1B4B)),
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
    return Container(
      color: Colors.white,
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
                  boxShadow: [BoxShadow(color: const Color(0xFF7C3AED).withOpacity(0.3), blurRadius: 10, offset: const Offset(0, 4))],
                ),
                child: const Icon(Icons.camera_alt, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  children: [
                    TextField(
                      controller: _nameController,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                      decoration: const InputDecoration(
                        hintText: "Tên nhóm (bắt buộc)",
                        hintStyle: TextStyle(color: Colors.grey, fontSize: 18),
                        border: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFE2E8F0))),
                        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF7C3AED), width: 2)),
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
            decoration: InputDecoration(
              hintText: "Mô tả về nhóm...",
              hintStyle: const TextStyle(color: Colors.grey),
              filled: true,
              fillColor: const Color(0xFFF1F5F9),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.all(16),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTypeSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 24, 20, 12),
          child: Text("LOẠI NHÓM", style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.bold, fontSize: 13, letterSpacing: 1.2)),
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
                      color: isSelected ? const Color(0xFF7C3AED) : Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        if (isSelected)
                          BoxShadow(color: const Color(0xFF7C3AED).withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 4))
                        else
                          BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 4, offset: const Offset(0, 2)),
                      ],
                      border: Border.all(color: isSelected ? Colors.transparent : const Color(0xFFE2E8F0)),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(type["icon"], color: isSelected ? Colors.white : const Color(0xFF7C3AED), size: 28),
                        const SizedBox(height: 8),
                        Text(
                          type["label"],
                          style: TextStyle(color: isSelected ? Colors.white : const Color(0xFF1E1B4B), fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        const SizedBox(height: 4),
                        Expanded(
                          child: Text(
                            type["desc"],
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: isSelected ? Colors.white70 : Colors.grey, fontSize: 10),
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
                style: const TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.bold, fontSize: 13, letterSpacing: 1.2),
              ),
              if (_selectedUserIds.isNotEmpty)
                TextButton(
                  onPressed: () => setState(() => _selectedUserIds.clear()),
                  child: const Text("Xóa tất cả", style: TextStyle(color: Colors.redAccent, fontSize: 13)),
                ),
            ],
          ),
        ),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: TextField(
            onChanged: (v) => setState(() => _searchQuery = v),
            decoration: const InputDecoration(
              hintText: "Tìm kiếm bạn bè...",
              prefixIcon: Icon(Icons.search, color: Color(0xFF7C3AED), size: 20),
              border: InputBorder.none,
              contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (_isLoadingFriends)
          const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
        else if (_friends.isEmpty)
          const Center(child: Padding(padding: EdgeInsets.all(40), child: Text("Bạn chưa có bạn bè nào để thêm", style: TextStyle(color: Colors.grey))))
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: _filteredFriends.length,
            itemBuilder: (context, index) {
              final friend = _filteredFriends[index];
              final isSelected = _selectedUserIds.contains(friend.id);
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: isSelected ? const Color(0xFF7C3AED).withOpacity(0.05) : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: isSelected ? const Color(0xFF7C3AED) : const Color(0xFFE2E8F0)),
                ),
                child: ListTile(
                  leading: UserAvatar(
                    userId: friend.id,
                    initialAvatarUrl: friend.avatarUrl,
                    initialDisplayName: friend.fullName,
                    radius: 20,
                  ),
                  title: Text(friend.fullName, style: const TextStyle(fontWeight: FontWeight.w600)),
                  trailing: Icon(
                    isSelected ? Icons.check_circle : Icons.add_circle_outline,
                    color: isSelected ? const Color(0xFF7C3AED) : const Color(0xFFCBD5E1),
                  ),
                  onTap: () {
                    setState(() {
                      if (isSelected) {
                        _selectedUserIds.remove(friend.id);
                      } else {
                        _selectedUserIds.add(friend.id);
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
}
