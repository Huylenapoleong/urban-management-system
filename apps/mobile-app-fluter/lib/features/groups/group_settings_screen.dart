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
      builder: (dialogCtx) => AlertDialog(
        title: const Text('Đổi tên nhóm'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'Nhập tên nhóm mới...',
            border: OutlineInputBorder(),
          ),
          maxLength: 100,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
            onPressed: () => Navigator.pop(dialogCtx, true),
            child: const Text('Lưu'),
          ),
        ],
      ),
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
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Đóng'),
          ),
        ],
      ),
    );
  }

  Widget _buildTile(BuildContext context, {required IconData icon, required Color color, required String title, required String subtitle, required VoidCallback onTap}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFF1F5F9))),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(backgroundColor: color.withOpacity(0.12), child: Icon(icon, color: color)),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        trailing: const Icon(Icons.chevron_right, color: Color(0xFF94A3B8)),
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

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text("Cài đặt nhóm", style: TextStyle(color: Color(0xFF1E1B4B), fontWeight: FontWeight.bold)),
        centerTitle: true,
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: Color(0xFF1E1B4B)),
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
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1E1B4B),
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _isOwner ? "Trưởng nhóm" : "Thành viên",
                        style: TextStyle(
                          fontSize: 14,
                          color: _isOwner ? const Color(0xFF7C3AED) : const Color(0xFF64748B),
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

                const Divider(height: 32),
                
                _buildTile(
                  context,
                  icon: Icons.exit_to_app,
                  color: Colors.red,
                  title: 'Rời nhóm',
                  subtitle: 'Bạn sẽ không nhận được tin nhắn nữa',
                  onTap: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: const Text('Rời nhóm?'),
                        content: const Text('Bạn có chắc muốn rời nhóm này không?'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
                          FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: Colors.red),
                            onPressed: () => Navigator.pop(context, true),
                            child: const Text('Rời nhóm'),
                          ),
                        ],
                      ),
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
