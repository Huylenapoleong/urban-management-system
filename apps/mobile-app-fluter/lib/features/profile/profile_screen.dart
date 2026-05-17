import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../services/auth_service.dart";
import "../../models/user_profile.dart";
import "../../core/theme/app_theme.dart";
import "../../services/upload_service.dart";
import "../../services/user_service.dart";
import "../../state/session_controller.dart";
import "../../services/app_services.dart";
import "settings_screen.dart";
import "edit_profile_screen.dart";
import "security_screen.dart";
import "help_support_screen.dart";
import "about_app_screen.dart";
import "../shared/widgets/user_avatar.dart";
import "widgets/avatar_bottom_sheet.dart";
import "../shared/widgets/app_logo_button.dart";

class ProfileScreen extends StatefulWidget {
  final UserProfile user;
  final VoidCallback? onRefreshProfile;
  final VoidCallback? onLogout;
  final UserService? userService;
  final UploadService? uploadService;

  const ProfileScreen({
    super.key,
    required this.user,
    this.onRefreshProfile,
    this.onLogout,
    this.userService,
    this.uploadService,
  });

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late UserProfile _profile;

  @override
  void initState() {
    super.initState();
    _profile = widget.user;
  }

  Future<void> _handleLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Đăng xuất"),
        content: const Text("Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này?"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Hủy")),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text("Đăng xuất"),
          ),
        ],
      ),
    );

    if (ok == true) {
      widget.onLogout?.call();
    }
  }

  void _showAvatarBottomSheet() {
    if (widget.userService == null || widget.uploadService == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Dịch vụ không khả dụng. Vui lòng thử lại sau.")),
      );
      return;
    }
    
    final session = context.read<SessionController>();
    final currentUser = session.user ?? _profile;

    AvatarBottomSheet.show(
      context,
      user: currentUser,
      userService: widget.userService!,
      uploadService: widget.uploadService!,
      onAvatarChanged: () {
        widget.onRefreshProfile?.call();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final isMe = session.user?.id == _profile.id;
    final displayUser = isMe ? (session.user ?? _profile) : _profile;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC), // Slate 50
      body: CustomScrollView(
        slivers: [
          _buildAppBar(),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  _buildProfileCard(displayUser, isMe),
                  const SizedBox(height: 24),
                  _buildActionList(displayUser, isMe),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
    return SliverAppBar(
      pinned: true,
      backgroundColor: Colors.white,
      elevation: 0,
      leading: const AppLogoButton(),
      title: const Text(
        "Tài khoản",
        style: TextStyle(
          color: Color(0xFF1E1B4B),
          fontWeight: FontWeight.bold,
          fontSize: 20,
        ),
      ),
      centerTitle: false,
    );
  }

  Widget _buildProfileCard(UserProfile user, bool isMe) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          GestureDetector(
            onTap: isMe ? _showAvatarBottomSheet : null,
            child: Stack(
              children: [
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3), width: 3),
                  ),
                  child: UserAvatar(
                    userId: user.id,
                    initialAvatarUrl: user.avatarUrl,
                    initialDisplayName: user.fullName,
                    radius: 50,
                    userService: widget.userService,
                  ),
                ),
                if (isMe)
                  Positioned(
                    bottom: 4,
                    right: 4,
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.1),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: const Icon(Icons.camera_alt, color: Colors.white, size: 16),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text(
            user.fullName,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            user.role == 'CITIZEN' ? "Cư dân" : (user.role == 'ADMIN' ? "Quản trị viên" : user.role),
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 15, fontWeight: FontWeight.w500),
          ),
          if (user.unit != null)
            Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                user.unit!,
                style: const TextStyle(color: Color(0xFF047857), fontSize: 13, fontWeight: FontWeight.bold),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildActionList(UserProfile user, bool isMe) {
    return Column(
      children: [
        if (isMe) ...[
          _buildSectionTitle("Cá nhân"),
          _buildActionItem(
            icon: Icons.person_outline,
            title: "Chỉnh sửa thông tin",
            subtitle: "Thay đổi Tên, SĐT, Email",
            iconColor: Colors.blue.shade600,
            bgColor: Colors.blue.shade50,
            onTap: () {
              if (widget.userService == null) return;
              Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => EditProfileScreen(
                  user: user,
                  userService: widget.userService!,
                  onProfileUpdated: () => widget.onRefreshProfile?.call(),
                ),
              ));
            },
          ),
          _buildActionItem(
            icon: Icons.security_outlined,
            title: "Bảo mật tài khoản",
            subtitle: "Đổi mật khẩu, thiết bị",
            iconColor: Colors.orange.shade600,
            bgColor: Colors.orange.shade50,
            onTap: () {
              final appServices = context.read<AppServices>();
              Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => SecurityScreen(authService: appServices.authService),
              ));
            },
          ),
          const SizedBox(height: 24),
        ],
        _buildSectionTitle("Hệ thống"),
        if (isMe)
          _buildActionItem(
            icon: Icons.settings_outlined,
            title: "Cài đặt ứng dụng",
            iconColor: Colors.grey.shade700,
            bgColor: Colors.grey.shade200,
            onTap: () {
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()));
            },
          ),
        _buildActionItem(
          icon: Icons.help_outline,
          title: "Hỗ trợ & Trợ giúp",
          iconColor: Colors.teal.shade600,
          bgColor: Colors.teal.shade50,
          onTap: () {
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const HelpSupportScreen()));
          },
        ),
        _buildActionItem(
          icon: Icons.info_outline,
          title: "Thông tin ứng dụng",
          iconColor: Colors.indigo.shade600,
          bgColor: Colors.indigo.shade50,
          onTap: () {
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AboutAppScreen()));
          },
        ),
        const SizedBox(height: 32),
        if (isMe && widget.onLogout != null)
          _buildActionItem(
            icon: Icons.logout,
            title: "Đăng xuất",
            iconColor: Colors.red.shade600,
            bgColor: Colors.red.shade50,
            showChevron: false,
            titleColor: Colors.red.shade600,
            onTap: _handleLogout,
          ),
      ],
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 8, bottom: 12, top: 4),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          title.toUpperCase(),
          style: const TextStyle(
            color: Color(0xFF94A3B8), // Slate 400
            fontSize: 12,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }

  Widget _buildActionItem({
    required IconData icon,
    required String title,
    String? subtitle,
    required VoidCallback onTap,
    required Color iconColor,
    required Color bgColor,
    bool showChevron = true,
    Color? titleColor,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.02),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: bgColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: iconColor, size: 22),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: titleColor ?? const Color(0xFF1E293B),
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          subtitle,
                          style: const TextStyle(
                            fontSize: 13,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (showChevron)
                  const Icon(Icons.chevron_right, color: Color(0xFFCBD5E1), size: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
