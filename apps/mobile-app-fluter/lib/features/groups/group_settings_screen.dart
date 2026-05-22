import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../services/group_service.dart';
import '../../services/app_services.dart';
import '../../state/session_controller.dart';
import '../shared/widgets/user_avatar.dart';
import '../shared/widgets/app_toast.dart';
import 'group_members_screen.dart';
import 'group_invite_links_screen.dart';
import 'group_audit_logs_screen.dart';

class GroupSettingsScreen extends StatefulWidget {
  final String groupId;
  final String groupName;

  const GroupSettingsScreen({super.key, required this.groupId, required this.groupName});

  @override
  State<GroupSettingsScreen> createState() => _GroupSettingsScreenState();
}

class _GroupSettingsScreenState extends State<GroupSettingsScreen> {
  bool _isLoading = true;
  bool _isOwner = false;
  String _currentGroupName = '';
  String? _groupAvatarUrl;

  @override
  void initState() {
    super.initState();
    _currentGroupName = widget.groupName;
    _loadGroupDetails();
  }

  Future<void> _loadGroupDetails() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final services = context.read<AppServices>();
      final session = context.read<SessionController>();
      final groupService = services.groupService;
      final currentUserId = session.user?.id;

      // Load local avatar override
      final prefs = await SharedPreferences.getInstance();
      _groupAvatarUrl = prefs.getString("group_avatar_override_${widget.groupId}");

      // Fetch members to check role
      final members = await groupService.listMembers(widget.groupId);
      final me = members.firstWhere(
        (m) => m['userId']?.toString() == currentUserId,
        orElse: () => {},
      );

      if (mounted) {
        setState(() {
          _isOwner = me['roleInGroup']?.toString() == 'OWNER';
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error loading group details: $e");
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _changeGroupName() async {
    final controller = TextEditingController(text: _currentGroupName);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) {
        final isDark = Theme.of(dialogCtx).brightness == Brightness.dark;
        return AlertDialog(
          backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
          title: Text(
            'Đổi tên nhóm',
            style: TextStyle(
              color: isDark ? Colors.white : const Color(0xFF1E1B4B),
              fontWeight: FontWeight.bold,
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: controller,
                style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                decoration: InputDecoration(
                  hintText: 'Nhập tên nhóm mới...',
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
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx, false),
              child: Text(
                'Hủy',
                style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
              ),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
              onPressed: () => Navigator.pop(dialogCtx, true),
              child: const Text('Lưu'),
            ),
          ],
        );
      },
    );

    if (confirmed == true) {
      final newName = controller.text.trim();
      if (newName.isEmpty || newName == _currentGroupName) return;

      setState(() => _isLoading = true);
      try {
        final services = context.read<AppServices>();
        await services.groupService.updateGroup(widget.groupId, {"groupName": newName});
        if (mounted) {
          setState(() {
            _currentGroupName = newName;
            _isLoading = false;
          });
          AppToast.show(
            context,
            message: 'Đã cập nhật tên nhóm thành công',
            type: AppToastType.success,
          );
        }
      } catch (e) {
        if (mounted) {
          setState(() => _isLoading = false);
          AppToast.show(
            context,
            message: 'Không thể đổi tên nhóm. Lỗi: $e',
            type: AppToastType.error,
          );
        }
      }
    }
  }

  Future<void> _pickAndUploadGroupAvatar() async {
    try {
      final picker = ImagePicker();
      final XFile? image = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 80,
      );
      if (image == null) return;

      setState(() => _isLoading = true);

      final services = context.read<AppServices>();
      final uploaded = await services.uploadService.uploadMedia(
        filePath: image.path,
        target: "AVATAR",
        entityId: null,
      );
      final avatarUrl = uploaded.url;
      if (avatarUrl == null || avatarUrl.isEmpty) {
        throw Exception("Không nhận được URL ảnh từ server.");
      }

      // Save locally
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString("group_avatar_override_${widget.groupId}", avatarUrl);

      if (mounted) {
        setState(() {
          _groupAvatarUrl = avatarUrl;
          _isLoading = false;
        });
        AppToast.show(
          context,
          message: 'Cập nhật ảnh đại diện nhóm thành công',
          type: AppToastType.success,
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        AppToast.show(
          context,
          message: 'Lỗi tải ảnh đại diện: $e',
          type: AppToastType.error,
        );
      }
    }
  }

  void _showMediaDialog(String title, String message) {
    showDialog(
      context: context,
      builder: (dialogCtx) {
        final isDark = Theme.of(dialogCtx).brightness == Brightness.dark;
        return AlertDialog(
          backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
          title: Text(
            title,
            style: TextStyle(
              color: isDark ? Colors.white : const Color(0xFF1E1B4B),
              fontWeight: FontWeight.bold,
            ),
          ),
          content: Text(
            message,
            style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx),
              child: Text(
                'Đóng',
                style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildTile(BuildContext context, {required IconData icon, required Color color, required String title, required String subtitle, required VoidCallback onTap}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          backgroundColor: isDark ? color.withOpacity(0.2) : color.withOpacity(0.12),
          child: Icon(icon, color: isDark ? Color.lerp(color, Colors.white, 0.2) ?? color : color),
        ),
        title: Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.w600,
            color: isDark ? Colors.white : Colors.black87,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: TextStyle(
            fontSize: 12,
            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
          ),
        ),
        trailing: Icon(Icons.chevron_right, color: isDark ? const Color(0xFF475569) : const Color(0xFF94A3B8)),
        onTap: onTap,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final services = context.read<AppServices>();
    final session = context.read<SessionController>();
    final groupService = services.groupService;
    final currentUserId = session.user?.id;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          "Cài đặt nhóm",
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
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF7C3AED)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Top Avatar Header Card
                Center(
                  child: Column(
                    children: [
                      const SizedBox(height: 16),
                      Stack(
                        children: [
                          UserAvatar(
                            groupId: widget.groupId,
                            initialAvatarUrl: _groupAvatarUrl,
                            initialDisplayName: _currentGroupName,
                            radius: 50,
                            groupService: groupService,
                          ),
                          if (_isOwner)
                            Positioned(
                              right: 0,
                              bottom: 0,
                              child: GestureDetector(
                                onTap: _pickAndUploadGroupAvatar,
                                child: Container(
                                  padding: const EdgeInsets.all(6),
                                  decoration: const BoxDecoration(
                                    color: Color(0xFF7C3AED),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.camera_alt,
                                    color: Colors.white,
                                    size: 18,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _currentGroupName,
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _isOwner ? "Trưởng nhóm" : "Thành viên",
                        style: TextStyle(
                          fontSize: 14,
                          color: _isOwner
                              ? const Color(0xFF7C3AED)
                              : (isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),

                // Actions Section
                _buildTile(
                  context,
                  icon: Icons.people,
                  color: const Color(0xFF7C3AED),
                  title: 'Thành viên',
                  subtitle: 'Xem, xóa, cấm, chuyển quyền',
                  onTap: () => Navigator.push(context, MaterialPageRoute(
                    builder: (_) => GroupMembersScreen(
                      groupService: groupService,
                      userService: services.userService,
                      groupId: widget.groupId,
                      groupName: _currentGroupName,
                      currentUserId: currentUserId,
                    ),
                  )),
                ),

                if (_isOwner)
                  _buildTile(
                    context,
                    icon: Icons.edit_outlined,
                    color: Colors.teal,
                    title: 'Đổi tên nhóm',
                    subtitle: 'Thay đổi tên hiển thị của nhóm',
                    onTap: _changeGroupName,
                  ),

                _buildTile(
                  context,
                  icon: Icons.link,
                  color: Colors.blue,
                  title: 'Liên kết mời',
                  subtitle: 'Tạo, sao chép, thu hồi link mời',
                  onTap: () => Navigator.push(context, MaterialPageRoute(
                    builder: (_) => GroupInviteLinksScreen(groupService: groupService, groupId: widget.groupId, groupName: _currentGroupName),
                  )),
                ),
                
                _buildTile(
                  context,
                  icon: Icons.history,
                  color: Colors.orange,
                  title: 'Nhật ký hoạt động',
                  subtitle: 'Xem lịch sử thao tác của nhóm',
                  onTap: () => Navigator.push(context, MaterialPageRoute(
                    builder: (_) => GroupAuditLogsScreen(groupService: groupService, groupId: widget.groupId, groupName: _currentGroupName),
                  )),
                ),

                _buildTile(
                  context,
                  icon: Icons.photo_library_outlined,
                  color: Colors.pink,
                  title: 'Ảnh, video đã gửi',
                  subtitle: 'Xem lại các phương tiện đã chia sẻ',
                  onTap: () {
                    _showMediaDialog("Ảnh & Video", "Chưa chia sẻ ảnh hoặc video nào trong nhóm này.");
                  },
                ),

                _buildTile(
                  context,
                  icon: Icons.link_outlined,
                  color: Colors.indigo,
                  title: 'Link đã chia sẻ',
                  subtitle: 'Xem lại các liên kết đã chia sẻ',
                  onTap: () {
                    _showMediaDialog("Liên kết chia sẻ", "Chưa chia sẻ liên kết nào trong nhóm này.");
                  },
                ),

                Divider(height: 32, color: isDark ? const Color(0xFF334155) : null),
                
                _buildTile(
                  context,
                  icon: Icons.exit_to_app,
                  color: Colors.red,
                  title: 'Rời nhóm',
                  subtitle: 'Bạn sẽ không nhận được tin nhắn nữa',
                  onTap: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (dialogCtx) {
                        final isDark = Theme.of(dialogCtx).brightness == Brightness.dark;
                        return AlertDialog(
                          backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                          title: Text(
                            'Rời nhóm?',
                            style: TextStyle(
                              color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          content: Text(
                            'Bạn có chắc muốn rời nhóm này không?',
                            style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(dialogCtx, false),
                              child: Text(
                                'Hủy',
                                style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
                              ),
                            ),
                            FilledButton(
                              style: FilledButton.styleFrom(backgroundColor: Colors.red),
                              onPressed: () => Navigator.pop(dialogCtx, true),
                              child: const Text('Rời nhóm'),
                            ),
                          ],
                        );
                      },
                    );
                    if (confirmed == true) {
                      try {
                        await groupService.leaveGroup(widget.groupId);
                        if (context.mounted) {
                          Navigator.popUntil(context, (route) => route.isFirst);
                          AppToast.show(
                            context,
                            message: 'Đã rời nhóm thành công',
                            type: AppToastType.success,
                          );
                        }
                      } catch (e) {
                        if (context.mounted) {
                          AppToast.show(
                            context,
                            message: 'Không thể rời nhóm. Lỗi: $e',
                            type: AppToastType.error,
                          );
                        }
                      }
                    }
                  },
                ),
              ],
            ),
    );
  }
}
