import "package:flutter/material.dart";
import "../../services/auth_service.dart";
import "../../models/user_profile.dart";
import "../../core/theme/app_theme.dart";
import "../../services/upload_service.dart";
import "../../services/user_service.dart";
import "settings_screen.dart";
import "../shared/widgets/user_avatar.dart";

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
  bool _isEditing = false;
  final _fullNameController = TextEditingController();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _profile = widget.user;
    _fullNameController.text = _profile.fullName;
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    super.dispose();
  }

  Future<void> _handleLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Logout"),
        content: const Text("Are you sure you want to logout?"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Cancel")),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text("Logout"),
          ),
        ],
      ),
    );

    if (ok == true) {
      widget.onLogout?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: CustomScrollView(
        slivers: [
          _buildAppBar(),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  _buildProfileCard(),
                  const SizedBox(height: 24),
                  _buildActionList(),
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
      expandedHeight: 120,
      pinned: true,
      backgroundColor: const Color(0xFF7C3AED),
      flexibleSpace: FlexibleSpaceBar(
        title: const Text("My Profile", style: TextStyle(fontWeight: FontWeight.bold)),
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF7C3AED), Color(0xFF4C1D95)],
            ),
          ),
        ),
      ),
      actions: [
        if (widget.onLogout != null)
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: _handleLogout,
          ),
      ],
    );
  }

  Widget _buildProfileCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          Stack(
            children: [
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF7C3AED).withOpacity(0.2), width: 2),
                ),
                child: UserAvatar(
                  userId: _profile.id,
                  initialAvatarUrl: _profile.avatarUrl,
                  initialDisplayName: _profile.fullName,
                  radius: 50,
                  userService: widget.userService,
                ),
              ),
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(
                    color: Color(0xFF7C3AED),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.camera_alt, color: Colors.white, size: 18),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            _profile.fullName,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1E1B4B)),
          ),
          Text(
            _profile.role,
            style: TextStyle(color: Colors.grey.shade500, fontWeight: FontWeight.w500),
          ),
          if (_profile.unit != null)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF7C3AED).withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                _profile.unit!,
                style: const TextStyle(color: Color(0xFF7C3AED), fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildActionList() {
    return Column(
      children: [
        _buildActionItem(
          icon: Icons.person_outline,
          title: "Edit Profile",
          onTap: () {
            // Future: Implement specific edit profile page
          },
        ),
        _buildActionItem(
          icon: Icons.settings_outlined,
          title: "Settings",
          onTap: () {
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()));
          },
        ),
        _buildActionItem(
          icon: Icons.security_outlined,
          title: "Account Security",
          onTap: () {
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()));
          },
        ),
        _buildActionItem(
          icon: Icons.help_outline,
          title: "Help & Support",
          onTap: () {},
        ),
        const SizedBox(height: 12),
        _buildActionItem(
          icon: Icons.info_outline,
          title: "About App",
          onTap: () {},
        ),
      ],
    );
  }

  Widget _buildActionItem({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
    Color? color,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: (color ?? const Color(0xFF7C3AED)).withOpacity(0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: color ?? const Color(0xFF7C3AED), size: 20),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        trailing: const Icon(Icons.chevron_right, size: 20, color: Colors.grey),
      ),
    );
  }
}
