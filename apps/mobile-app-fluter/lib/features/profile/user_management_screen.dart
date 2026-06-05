import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../../models/user_profile.dart';
import '../../services/app_services.dart';
import '../../state/session_controller.dart';
import '../shared/widgets/app_toast.dart';

class UserManagementScreen extends StatefulWidget {
  const UserManagementScreen({super.key});

  @override
  State<UserManagementScreen> createState() => _UserManagementScreenState();
}

class _UserManagementScreenState extends State<UserManagementScreen> {
  final _searchController = TextEditingController();
  final _emailController = TextEditingController();
  final _fullNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _locationController = TextEditingController();

  List<UserProfile> _users = [];
  bool _loading = true;
  String? _error;
  String _selectedRoleFilter = 'ALL';
  String _selectedStatusFilter = 'ALL';

  @override
  void initState() {
    super.initState();
    _fetchUsers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _emailController.dispose();
    _fullNameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _fetchUsers() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final session = context.read<SessionController>();
      final userService = context.read<AppServices>().userService;
      
      final currentLoc = session.user?.locationCode ?? "";

      final fetched = await userService.listUsers(
        role: _selectedRoleFilter == 'ALL' ? null : _selectedRoleFilter,
        status: _selectedStatusFilter == 'ALL' ? null : _selectedStatusFilter,
        query: _searchController.text.trim().isEmpty ? null : _searchController.text.trim(),
        locationCode: (session.user?.role == 'ADMIN' || session.user?.role == 'PROVINCE_OFFICER') ? null : currentLoc,
      );

      if (mounted) {
        setState(() {
          _users = fetched.where((u) => u.id != session.user?.id).toList();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _toggleUserLock(UserProfile target) async {
    final isLocked = target.status == 'LOCKED';
    final nextStatus = isLocked ? 'ACTIVE' : 'LOCKED';
    
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text(isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản', 
          style: GoogleFonts.poppins(color: Colors.white, fontWeight: FontWeight.bold)),
        content: Text('Bạn có chắc chắn muốn ${isLocked ? "mở khóa" : "khóa"} tài khoản của ${target.fullName} không?',
          style: const TextStyle(color: Colors.white70)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy', style: TextStyle(color: Colors.grey)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: isLocked ? const Color(0xFF22C55E) : Colors.red),
            child: Text(isLocked ? 'Mở khóa' : 'Khóa'),
          ),
        ],
      ),
    );

    if (ok != true) return;

    try {
      final userService = context.read<AppServices>().userService;
      await userService.updateUserStatus(userId: target.id, status: nextStatus);
      AppToast.show(context, message: 'Cập nhật trạng thái thành công', type: AppToastType.success);
      _fetchUsers();
    } catch (e) {
      AppToast.show(context, message: 'Lỗi: $e', type: AppToastType.error);
    }
  }

  void _showCreateOfficerSheet() {
    final session = context.read<SessionController>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Clear and preset location
    _emailController.clear();
    _fullNameController.clear();
    _phoneController.clear();
    _passwordController.clear();
    _locationController.text = session.user?.locationCode ?? "VN-79-00001";

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => StatefulBuilder(
          builder: (context, setModalState) => SingleChildScrollView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(width: 40, height: 4, decoration: const BoxDecoration(color: Colors.grey, borderRadius: BorderRadius.all(Radius.circular(2))))),
                const SizedBox(height: 20),
                Text(
                  "Tạo Cán bộ Phường mới",
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                  ),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _fullNameController,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  decoration: InputDecoration(
                    labelText: "Họ và tên",
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  decoration: InputDecoration(
                    labelText: "Email",
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  decoration: InputDecoration(
                    labelText: "Số điện thoại",
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  decoration: InputDecoration(
                    labelText: "Mật khẩu",
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _locationController,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  decoration: InputDecoration(
                    labelText: "Mã địa bàn quản lý (locationCode)",
                    helperText: "Ví dụ: VN-79-00001 (TP.HCM, Phường Bến Nghé)",
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: () async {
                      if (_fullNameController.text.trim().isEmpty || 
                          _emailController.text.trim().isEmpty || 
                          _phoneController.text.trim().isEmpty ||
                          _passwordController.text.trim().isEmpty) {
                        AppToast.show(context, message: 'Vui lòng điền đủ thông tin', type: AppToastType.warning);
                        return;
                      }

                      try {
                        final userService = context.read<AppServices>().userService;
                        await userService.createUser({
                          'role': 'WARD_OFFICER',
                          'email': _emailController.text.trim(),
                          'fullName': _fullNameController.text.trim(),
                          'phoneNumber': _phoneController.text.trim(),
                          'password': _passwordController.text.trim(),
                          'locationCode': _locationController.text.trim(),
                        });
                        if (!mounted) return;
                        Navigator.pop(context);
                        AppToast.show(context, message: 'Đã tạo cán bộ thành công', type: AppToastType.success);
                        _fetchUsers();
                      } catch (e) {
                        AppToast.show(context, message: 'Lỗi: $e', type: AppToastType.error);
                      }
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF22C55E),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text("Tạo tài khoản", style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final session = context.watch<SessionController>();
    final isProvinceOfficer = session.user?.role == 'PROVINCE_OFFICER' || session.user?.role == 'ADMIN';

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0B0F19) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0B0F19) : const Color(0xFF1E3A8A),
        title: Text(
          'Quản lý Người dùng',
          style: GoogleFonts.poppins(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
        ),
        elevation: 0,
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: isDark ? const Color(0xFF22C55E) : Colors.white),
            onPressed: _fetchUsers,
          )
        ],
      ),
      body: Column(
        children: [
          _buildFilters(isDark),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF22C55E)))
                : _error != null
                    ? _buildError()
                    : _users.isEmpty
                        ? _buildEmpty()
                        : _buildUserList(isDark),
          ),
        ],
      ),
      floatingActionButton: isProvinceOfficer
          ? FloatingActionButton.extended(
              onPressed: _showCreateOfficerSheet,
              backgroundColor: const Color(0xFF22C55E),
              icon: const Icon(Icons.person_add, color: Colors.white),
              label: const Text('Thêm Cán bộ', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            )
          : null,
    );
  }

  Widget _buildFilters(bool isDark) {
    return Container(
      color: isDark ? const Color(0xFF0B0F19) : Colors.white,
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(
            controller: _searchController,
            onSubmitted: (_) => _fetchUsers(),
            style: TextStyle(color: isDark ? Colors.white : Colors.black87),
            decoration: InputDecoration(
              hintText: 'Tìm theo Tên hoặc Số điện thoại...',
              prefixIcon: const Icon(Icons.search, color: Colors.grey),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
              fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              filled: true,
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
            ),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildFilterDropdown(
                  label: 'Vai trò',
                  value: _selectedRoleFilter,
                  items: const ['ALL', 'WARD_OFFICER', 'CITIZEN'],
                  labels: const {'ALL': 'Tất cả vai trò', 'WARD_OFFICER': 'Cán bộ phường', 'CITIZEN': 'Cư dân'},
                  isDark: isDark,
                  onChanged: (val) {
                    setState(() => _selectedRoleFilter = val!);
                    _fetchUsers();
                  },
                ),
                const SizedBox(width: 8),
                _buildFilterDropdown(
                  label: 'Trạng thái',
                  value: _selectedStatusFilter,
                  items: const ['ALL', 'ACTIVE', 'LOCKED'],
                  labels: const {'ALL': 'Tất cả trạng thái', 'ACTIVE': 'Đang hoạt động', 'LOCKED': 'Bị khóa'},
                  isDark: isDark,
                  onChanged: (val) {
                    setState(() => _selectedStatusFilter = val!);
                    _fetchUsers();
                  },
                ),
              ],
            ),
          )
        ],
      ),
    );
  }

  Widget _buildFilterDropdown({
    required String label,
    required String value,
    required List<String> items,
    required Map<String, String> labels,
    required bool isDark,
    required void Function(String?) onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isDark ? Colors.white.withOpacity(0.05) : Colors.grey.shade300),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          style: TextStyle(color: isDark ? Colors.white : Colors.black87, fontSize: 13, fontWeight: FontWeight.w600),
          dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
          items: items.map((i) => DropdownMenuItem(value: i, child: Text(labels[i] ?? i))).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }

  Widget _buildUserList(bool isDark) {
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      itemCount: _users.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final u = _users[i];
        final isLocked = u.status == 'LOCKED';
        
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: isDark ? Colors.white.withOpacity(0.06) : const Color(0xFFE2E8F0)),
            boxShadow: isDark ? null : [
              BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 10, offset: const Offset(0, 4))
            ],
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: isLocked ? Colors.red.withOpacity(0.1) : const Color(0xFF22C55E).withOpacity(0.1),
                backgroundImage: u.avatarUrl != null ? NetworkImage(u.avatarUrl!) : null,
                child: u.avatarUrl == null
                    ? Icon(
                        u.role == 'WARD_OFFICER' ? Icons.security : Icons.person,
                        color: isLocked ? Colors.red : const Color(0xFF22C55E),
                      )
                    : null,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      u.fullName,
                      style: GoogleFonts.poppins(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${u.role == "WARD_OFFICER" ? "Cán bộ phường" : "Cư dân"} · ${u.phone ?? "Chưa cập nhật SĐT"}',
                      style: TextStyle(fontSize: 12, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                    ),
                    if (u.locationCode.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          'Địa bàn: ${u.locationCode}',
                          style: TextStyle(fontSize: 11, color: isDark ? Colors.grey : Colors.grey.shade600),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: Icon(isLocked ? Icons.lock_outline : Icons.lock_open, color: isLocked ? Colors.red : const Color(0xFF22C55E)),
                tooltip: isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản',
                onPressed: () => _toggleUserLock(u),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.people_outline, size: 64, color: Colors.grey),
          const SizedBox(height: 16),
          const Text('Không tìm thấy người dùng nào thuộc phạm vi quản lý.', style: TextStyle(color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.redAccent),
            const SizedBox(height: 16),
            Text(_error ?? 'Lỗi tải người dùng', textAlign: TextAlign.center, style: const TextStyle(color: Colors.redAccent)),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _fetchUsers, child: const Text('Thử lại')),
          ],
        ),
      ),
    );
  }
}
