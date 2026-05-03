import "package:flutter/material.dart";

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text("Settings", style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildSection("Account"),
          _buildSettingItem(
            icon: Icons.lock_outline,
            title: "Change Password",
            onTap: () {},
          ),
          _buildSettingItem(
            icon: Icons.privacy_tip_outlined,
            title: "Privacy Settings",
            onTap: () {},
          ),
          const SizedBox(height: 24),
          _buildSection("Preferences"),
          _buildSettingItem(
            icon: Icons.language,
            title: "Language",
            trailing: "English",
            onTap: () {},
          ),
          _buildSettingItem(
            icon: Icons.dark_mode_outlined,
            title: "Dark Mode",
            trailingWidget: Switch(value: false, onChanged: (v) {}),
            onTap: () {},
          ),
          const SizedBox(height: 24),
          _buildSection("Support"),
          _buildSettingItem(
            icon: Icons.info_outline,
            title: "Terms of Service",
            onTap: () {},
          ),
          _buildSettingItem(
            icon: Icons.policy_outlined,
            title: "Privacy Policy",
            onTap: () {},
          ),
          _buildSettingItem(
            icon: Icons.star_outline,
            title: "Rate the App",
            onTap: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildSection(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: Colors.grey.shade500,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildSettingItem({
    required IconData icon,
    required String title,
    String? trailing,
    Widget? trailingWidget,
    required VoidCallback onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: ListTile(
        onTap: onTap,
        leading: Icon(icon, color: const Color(0xFF7C3AED), size: 22),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w500)),
        trailing: trailingWidget ?? (trailing != null 
          ? Text(trailing, style: TextStyle(color: Colors.grey.shade500))
          : const Icon(Icons.chevron_right, size: 20, color: Colors.grey)),
      ),
    );
  }
}
