import "package:flutter/material.dart";
import "package:skeletonizer/skeletonizer.dart";
import "../../core/theme/app_theme.dart";

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _notifications = [];

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  Future<void> _loadNotifications() async {
    setState(() => _isLoading = true);
    // Giả lập load dữ liệu
    await Future.delayed(const Duration(seconds: 1));
    setState(() {
      _notifications = [
        {
          "id": "1",
          "title": "New Friend Request",
          "body": "Nguyễn Văn A sent you a friend request.",
          "time": "5m ago",
          "type": "friend",
          "unread": true,
        },
        {
          "id": "2",
          "title": "System Update",
          "body": "The system will be under maintenance tonight at 12 PM.",
          "time": "2h ago",
          "type": "system",
          "unread": false,
        },
        {
          "id": "3",
          "title": "New Message",
          "body": "Trần Thị B sent you a message.",
          "time": "1d ago",
          "type": "chat",
          "unread": false,
        },
      ];
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text("Notifications", style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.done_all, color: Color(0xFF7C3AED)),
            onPressed: () {
              // Mark all as read
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadNotifications,
        child: Skeletonizer(
          enabled: _isLoading,
          child: _notifications.isEmpty && !_isLoading
              ? _buildEmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: _isLoading ? 8 : _notifications.length,
                  itemBuilder: (context, index) {
                    if (_isLoading) return _buildSkeletonItem();
                    final item = _notifications[index];
                    return _buildNotificationItem(item);
                  },
                ),
        ),
      ),
    );
  }

  Widget _buildNotificationItem(Map<String, dynamic> item) {
    final isUnread = item["unread"] as bool;
    
    IconData iconData;
    Color iconColor;
    
    switch (item["type"]) {
      case "friend":
        iconData = Icons.person_add_outlined;
        iconColor = Colors.blue;
        break;
      case "chat":
        iconData = Icons.chat_bubble_outline;
        iconColor = Colors.green;
        break;
      default:
        iconData = Icons.notifications_none;
        iconColor = Colors.orange;
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: isUnread ? const Color(0xFF7C3AED).withOpacity(0.05) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isUnread ? const Color(0xFF7C3AED).withOpacity(0.1) : Colors.transparent,
        ),
      ),
      child: ListTile(
        onTap: () {},
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(iconData, color: iconColor, size: 20),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                item["title"],
                style: TextStyle(
                  fontWeight: isUnread ? FontWeight.bold : FontWeight.w600,
                  fontSize: 15,
                ),
              ),
            ),
            Text(
              item["time"],
              style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
            ),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            item["body"],
            style: TextStyle(
              color: isUnread ? Colors.black87 : Colors.grey.shade600,
              fontSize: 13,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }

  Widget _buildSkeletonItem() {
    return ListTile(
      leading: const CircleAvatar(),
      title: const Bone.text(width: 150),
      subtitle: const Bone.text(width: 250),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.notifications_none_outlined, size: 64, color: Colors.grey.shade300),
          const SizedBox(height: 16),
          Text("No notifications yet", style: TextStyle(color: Colors.grey.shade500, fontSize: 16)),
        ],
      ),
    );
  }
}
