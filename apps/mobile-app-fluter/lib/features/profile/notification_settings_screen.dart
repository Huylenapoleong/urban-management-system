import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../state/session_controller.dart";

class NotificationSettingsScreen extends StatelessWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          "Cài đặt thông báo",
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
          _buildSectionHeader(context, "Cài đặt chung"),
          _buildToggleItem(
            context,
            icon: Icons.notifications_active_outlined,
            title: "Bật thông báo đẩy",
            subtitle: "Cho phép ứng dụng hiển thị thông báo đẩy",
            value: session.pushNotificationEnabled,
            onChanged: (v) => session.setPushNotificationEnabled(v),
          ),
          const SizedBox(height: 24),
          _buildSectionHeader(context, "Trò chuyện cá nhân (1-1)"),
          _buildDropdownItem(
            context,
            icon: Icons.privacy_tip_outlined,
            title: "Chế độ bảo mật",
            value: session.oneToOnePrivacyMode,
            options: const {
              "SHOW_ALL": "Hiển thị đầy đủ",
              "HIDE_CONTENT": "Ẩn nội dung tin nhắn",
              "ANONYMOUS": "Ẩn danh hoàn toàn",
            },
            onChanged: (v) {
              if (v != null) session.setOneToOnePrivacyMode(v);
            },
          ),
          _buildToggleItem(
            context,
            icon: Icons.volume_mute_outlined,
            title: "Giảm tiếng ồn khi chat nhanh",
            subtitle: "Tự động tắt tiếng chuông khi đối phương gửi tin nhắn liên tục (> 5 tin nhắn / 10 giây)",
            value: session.oneToOneSilentDebounce,
            onChanged: (v) => session.setOneToOneSilentDebounce(v),
          ),
          const SizedBox(height: 24),
          _buildSectionHeader(context, "Trò chuyện nhóm (Group Chat)"),
          _buildDropdownItem(
            context,
            icon: Icons.filter_list_alt,
            title: "Bộ lọc thông báo nhóm",
            value: session.groupNotificationFilter,
            options: const {
              "ALL_MESSAGES": "Tất cả tin nhắn",
              "MENTIONS_ONLY": "Chỉ khi được nhắc tên (@mention)",
              "PINNED_ONLY": "Chỉ tin nhắn được ghim",
            },
            onChanged: (v) {
              if (v != null) session.setGroupNotificationFilter(v);
            },
          ),
          _buildToggleItem(
            context,
            icon: Icons.music_note_outlined,
            title: "Âm thanh nhóm",
            subtitle: "Phát âm thanh khi có tin nhắn nhóm mới",
            value: session.groupSoundEnabled,
            onChanged: (v) => session.setGroupSoundEnabled(v),
          ),
          _buildToggleItem(
            context,
            icon: Icons.priority_high_outlined,
            title: "Ưu tiên nhắc tên (@mention)",
            subtitle: "Luôn phát chuông và sáng màn hình khi được nhắc tên, kể cả khi nhóm đang tắt tiếng",
            value: session.priorityMentionsOverride,
            onChanged: (v) => session.setPriorityMentionsOverride(v),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(BuildContext context, String title) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 12),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: isDark ? Colors.grey[400] : Colors.grey.shade600,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildToggleItem(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          if (!isDark)
            BoxShadow(
              color: Colors.black.withOpacity(0.02),
              blurRadius: 10,
              offset: const Offset(0, 4),
            )
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Icon(icon, color: const Color(0xFF7C3AED), size: 24),
        title: Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: isDark ? Colors.white : const Color(0xFF1E293B),
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4.0),
          child: Text(
            subtitle,
            style: TextStyle(
              fontSize: 12,
              color: isDark ? Colors.grey[400] : Colors.grey.shade600,
            ),
          ),
        ),
        trailing: Switch(
          value: value,
          onChanged: onChanged,
          activeColor: const Color(0xFF7C3AED),
        ),
      ),
    );
  }

  Widget _buildDropdownItem(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String value,
    required Map<String, String> options,
    required ValueChanged<String?> onChanged,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          if (!isDark)
            BoxShadow(
              color: Colors.black.withOpacity(0.02),
              blurRadius: 10,
              offset: const Offset(0, 4),
            )
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFF7C3AED), size: 24),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF1E293B),
                    ),
                  ),
                  const SizedBox(height: 4),
                  DropdownButton<String>(
                    value: options.containsKey(value) ? value : options.keys.first,
                    isExpanded: true,
                    underline: const SizedBox(),
                    dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                    style: TextStyle(
                      fontSize: 14,
                      color: isDark ? Colors.grey[300] : Colors.grey.shade800,
                    ),
                    items: options.entries.map((e) {
                      return DropdownMenuItem<String>(
                        value: e.key,
                        child: Text(e.value),
                      );
                    }).toList(),
                    onChanged: onChanged,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
