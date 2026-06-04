import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../state/session_controller.dart";
import "notification_settings_screen.dart";

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          "Cài đặt",
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: isDark ? Colors.white : Colors.black,
          ),
        ),
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        foregroundColor: isDark ? Colors.white : Colors.black,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildSection(context, "Tài khoản"),
          _buildSettingItem(
            context,
            icon: Icons.lock_outline,
            title: "Thay đổi mật khẩu",
            onTap: () {},
          ),
          _buildSettingItem(
            context,
            icon: Icons.privacy_tip_outlined,
            title: "Cài đặt quyền riêng tư",
            onTap: () {},
          ),
          const SizedBox(height: 24),
          _buildSection(context, "Tùy chọn"),
          _buildSettingItem(
            context,
            icon: Icons.notifications_none_outlined,
            title: "Cài đặt thông báo",
            onTap: () {
              Navigator.of(context, rootNavigator: true).push(
                MaterialPageRoute(
                  builder: (_) => const NotificationSettingsScreen(),
                ),
              );
            },
          ),
          _buildSettingItem(
            context,
            icon: Icons.language,
            title: "Ngôn ngữ",
            trailing: "Tiếng Việt",
            onTap: () {},
          ),
          _buildSettingItem(
            context,
            icon: Icons.dark_mode_outlined,
            title: "Dark Mode",
            trailingWidget: Switch(
              value: session.isDarkMode,
              onChanged: (v) => session.toggleDarkMode(v),
              activeColor: const Color(0xFF7C3AED),
            ),
            onTap: () => session.toggleDarkMode(!session.isDarkMode),
          ),
          const SizedBox(height: 24),
          _buildSection(context, "Hỗ trợ"),
          _buildSettingItem(
            context,
            icon: Icons.info_outline,
            title: "Điều khoản dịch vụ",
            onTap: () {},
          ),
          _buildSettingItem(
            context,
            icon: Icons.policy_outlined,
            title: "Chính sách bảo mật",
            onTap: () {},
          ),
          _buildSettingItem(
            context,
            icon: Icons.star_outline,
            title: "Đánh giá ứng dụng",
            onTap: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildSection(BuildContext context, String title) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: isDark ? Colors.grey[400] : Colors.grey.shade500,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildSettingItem(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? trailing,
    Widget? trailingWidget,
    required VoidCallback onTap,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: ListTile(
        onTap: onTap,
        leading: Icon(icon, color: const Color(0xFF7C3AED), size: 22),
        title: Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.w500,
            color: isDark ? Colors.white : const Color(0xFF1E293B),
          ),
        ),
        trailing: trailingWidget ??
            (trailing != null
                ? Text(
                    trailing,
                    style: TextStyle(
                      color: isDark ? Colors.grey[400] : Colors.grey.shade500,
                    ),
                  )
                : Icon(
                    Icons.chevron_right,
                    size: 20,
                    color: isDark ? Colors.grey[500] : Colors.grey,
                  )),
      ),
    );
  }
}
