import "package:flutter/material.dart";
import "package:skeletonizer/skeletonizer.dart";
import "package:shared_preferences/shared_preferences.dart";
import "package:provider/provider.dart";
import "dart:convert";
import "../../state/session_controller.dart";
import "../../services/app_services.dart";
import "../../models/report_item.dart";
import "../../models/user_profile.dart";

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _notifications = [];

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  String _formatTimeAgo(String isoString) {
    try {
      final dateTime = DateTime.parse(isoString).toLocal();
      final now = DateTime.now();
      final difference = now.difference(dateTime);
      
      if (difference.inMinutes < 1) {
        return "Vừa xong";
      } else if (difference.inMinutes < 60) {
        return "${difference.inMinutes} phút trước";
      } else if (difference.inHours < 24) {
        return "${difference.inHours} giờ trước";
      } else if (difference.inDays < 7) {
        return "${difference.inDays} ngày trước";
      } else {
        return "${dateTime.day.toString().padLeft(2, '0')}/${dateTime.month.toString().padLeft(2, '0')}/${dateTime.year}";
      }
    } catch (_) {
      return "Mới đây";
    }
  }

  Future<void> _loadNotifications() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    
    try {
      final session = context.read<SessionController>();
      final services = context.read<AppServices>();
      final userId = session.user?.id ?? 'guest';
      final role = session.user?.role ?? 'CITIZEN';
      
      final readKey = 'notifications_read_${userId}_$role';
      final deletedKey = 'notifications_deleted_${userId}_$role';
      
      final prefs = await SharedPreferences.getInstance();
      final List<String> readIds = prefs.getStringList(readKey) ?? [];
      final List<String> deletedIds = prefs.getStringList(deletedKey) ?? [];
      
      final List<Map<String, dynamic>> loadedNotifications = [];
      
      // 1. Fetch real reports
      List<ReportItem> reports = [];
      try {
        if (role == 'CITIZEN') {
          reports = await services.reportService.listReports(mine: true);
        } else {
          reports = await services.reportService.listReports(limit: 50);
        }
      } catch (e) {
        debugPrint("Error loading reports in notifications: $e");
      }
      
      // 2. Fetch real friend requests (incoming only)
      List<Map<String, dynamic>> friendRequests = [];
      try {
        if (role == 'CITIZEN') {
          friendRequests = await services.userService.listFriendRequests(direction: "incoming");
        }
      } catch (e) {
        debugPrint("Error loading friend requests in notifications: $e");
      }
      
      // Transform reports into notifications
      for (final report in reports) {
        final reportId = report.id;
        final reportStatus = report.status.toUpperCase();
        
        // Notification 1: Report submitted
        final String subId = 'report_submitted_$reportId';
        if (!deletedIds.contains(subId)) {
          loadedNotifications.add({
            "id": subId,
            "title": role == 'CITIZEN' ? "Gửi phản ánh thành công" : "Phản ánh sự cố mới cần tiếp nhận",
            "body": role == 'CITIZEN' 
                ? "Phản ánh về '${report.title}' của bạn đã được gửi thành công lên hệ thống."
                : "Cư dân vừa gửi phản ánh mới về '${report.title}' trong địa bàn quản lý của bạn.",
            "time": _formatTimeAgo(report.createdAt),
            "timestamp": report.createdAt,
            "type": "report",
            "unread": !readIds.contains(subId),
          });
        }
        
        // Notification 2: Report received / in progress
        if (reportStatus == 'IN_PROGRESS' || reportStatus == 'RESOLVED') {
          final String progId = 'report_in_progress_$reportId';
          if (!deletedIds.contains(progId)) {
            loadedNotifications.add({
              "id": progId,
              "title": role == 'CITIZEN' ? "Sự cố đã được tiếp nhận" : "Yêu cầu xử lý sự cố",
              "body": role == 'CITIZEN'
                  ? "Phản ánh về '${report.title}' của bạn đã được Cán bộ tiếp nhận xử lý."
                  : "Bạn đang xử lý phản ánh về '${report.title}' trong khu vực phụ trách.",
              "time": _formatTimeAgo(report.updatedAt),
              "timestamp": report.updatedAt,
              "type": "report",
              "unread": !readIds.contains(progId),
            });
          }
        }
        
        // Notification 3: Report resolved
        if (reportStatus == 'RESOLVED') {
          final String resId = 'report_resolved_$reportId';
          if (!deletedIds.contains(resId)) {
            loadedNotifications.add({
              "id": resId,
              "title": role == 'CITIZEN' ? "Sự cố đã được xử lý" : "Hoàn tất xử lý phản ánh",
              "body": role == 'CITIZEN'
                  ? "Phản ánh về '${report.title}' của bạn đã được giải quyết hoàn tất. Trạng thái: Đã xử lý."
                  : "Báo cáo sự cố '${report.title}' đã được cập nhật trạng thái Giải quyết thành công.",
              "time": _formatTimeAgo(report.updatedAt),
              "timestamp": report.updatedAt,
              "type": "report",
              "unread": !readIds.contains(resId),
            });
          }
        }
      }
      
      // Transform friend requests into notifications
      for (final req in friendRequests) {
        try {
          final sender = UserProfile.fromJson(req);
          final String reqId = 'friend_req_${sender.id}';
          if (!deletedIds.contains(reqId)) {
            loadedNotifications.add({
              "id": reqId,
              "title": "Yêu cầu kết bạn mới",
              "body": "${sender.fullName} đã gửi cho bạn một yêu cầu kết bạn mới.",
              "time": "Chờ phản hồi",
              "timestamp": req["createdAt"]?.toString() ?? "",
              "type": "friend",
              "unread": !readIds.contains(reqId),
            });
          }
        } catch (_) {}
      }
      
      // Sort notifications by timestamp descending (newest first)
      loadedNotifications.sort((a, b) {
        final String tA = a["timestamp"] ?? "";
        final String tB = b["timestamp"] ?? "";
        return tB.compareTo(tA);
      });
      
      if (mounted) {
        setState(() {
          _notifications = loadedNotifications;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _markAllAsRead() async {
    try {
      final session = context.read<SessionController>();
      final userId = session.user?.id ?? 'guest';
      final role = session.user?.role ?? 'CITIZEN';
      final readKey = 'notifications_read_${userId}_$role';
      
      final prefs = await SharedPreferences.getInstance();
      final List<String> readIds = prefs.getStringList(readKey) ?? [];
      
      setState(() {
        for (var i = 0; i < _notifications.length; i++) {
          final id = _notifications[i]['id'] as String;
          if (!readIds.contains(id)) {
            readIds.add(id);
          }
          _notifications[i] = Map<String, dynamic>.from(_notifications[i])..['unread'] = false;
        }
      });
      
      await prefs.setStringList(readKey, readIds);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Đã đánh dấu tất cả thông báo là đã đọc")),
        );
      }
    } catch (_) {}
  }

  Future<void> _markAsRead(int index) async {
    if (_notifications[index]['unread'] == true) {
      try {
        final session = context.read<SessionController>();
        final userId = session.user?.id ?? 'guest';
        final role = session.user?.role ?? 'CITIZEN';
        final readKey = 'notifications_read_${userId}_$role';
        
        final prefs = await SharedPreferences.getInstance();
        final List<String> readIds = prefs.getStringList(readKey) ?? [];
        
        final id = _notifications[index]['id'] as String;
        if (!readIds.contains(id)) {
          readIds.add(id);
          await prefs.setStringList(readKey, readIds);
        }
        
        setState(() {
          _notifications[index] = Map<String, dynamic>.from(_notifications[index])..['unread'] = false;
        });
      } catch (_) {}
    }
  }

  Future<void> _deleteNotification(String id) async {
    try {
      final session = context.read<SessionController>();
      final userId = session.user?.id ?? 'guest';
      final role = session.user?.role ?? 'CITIZEN';
      final deletedKey = 'notifications_deleted_${userId}_$role';
      
      final prefs = await SharedPreferences.getInstance();
      final List<String> deletedIds = prefs.getStringList(deletedKey) ?? [];
      
      if (!deletedIds.contains(id)) {
        deletedIds.add(id);
        await prefs.setStringList(deletedKey, deletedIds);
      }
      
      setState(() {
        _notifications.removeWhere((item) => item['id'] == id);
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final isDark = _isDark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          "Thông báo", 
          style: TextStyle(fontWeight: FontWeight.bold, color: isDark ? Colors.white : const Color(0xFF1E1B4B))
        ),
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        iconTheme: IconThemeData(color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
        actions: [
          if (_notifications.any((item) => item['unread'] == true))
            IconButton(
              icon: const Icon(Icons.done_all, color: Color(0xFF10B981)),
              tooltip: "Đánh dấu tất cả đã đọc",
              onPressed: _markAllAsRead,
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadNotifications,
        color: const Color(0xFF10B981),
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
                    return Dismissible(
                      key: Key(item['id']),
                      background: Container(
                        color: Colors.redAccent,
                        alignment: Alignment.centerRight,
                        padding: const EdgeInsets.only(right: 20),
                        child: const Icon(Icons.delete_outline, color: Colors.white),
                      ),
                      direction: DismissDirection.endToStart,
                      onDismissed: (_) => _deleteNotification(item['id']),
                      child: _buildNotificationItem(item, index),
                    );
                  },
                ),
        ),
      ),
    );
  }

  Widget _buildNotificationItem(Map<String, dynamic> item, int index) {
    final isUnread = item["unread"] as bool;
    final isDark = _isDark;
    
    IconData iconData;
    Color iconColor;
    
    switch (item["type"]) {
      case "friend":
        iconData = Icons.person_add_outlined;
        iconColor = Colors.blue;
        break;
      case "chat":
        iconData = Icons.chat_bubble_outline;
        iconColor = Colors.purple;
        break;
      case "report":
        iconData = Icons.campaign_outlined;
        iconColor = Colors.teal;
        break;
      default:
        iconData = Icons.notifications_none;
        iconColor = Colors.orange;
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: isUnread 
            ? (isDark ? const Color(0x2610B981) : const Color(0x0D10B981)) 
            : (isDark ? const Color(0xFF1E293B) : Colors.white),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isUnread 
              ? const Color(0x3310B981) 
              : (isDark ? const Color(0xFF334155) : Colors.transparent),
        ),
      ),
      child: ListTile(
        onTap: () => _markAsRead(index),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.15),
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
                  color: isDark ? Colors.white : Colors.black87,
                ),
              ),
            ),
            Text(
              item["time"],
              style: TextStyle(
                fontSize: 12, 
                color: isDark ? Colors.grey[400] : Colors.grey.shade500
              ),
            ),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            item["body"],
            style: TextStyle(
              color: isUnread 
                  ? (isDark ? Colors.grey[200] : Colors.black87) 
                  : (isDark ? Colors.grey[400] : Colors.grey.shade600),
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
    return const ListTile(
      leading: CircleAvatar(),
      title: Bone.text(width: 150),
      subtitle: Bone.text(width: 250),
    );
  }

  Widget _buildEmptyState() {
    final isDark = _isDark;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.notifications_none_outlined, 
            size: 64, 
            color: isDark ? Colors.grey[600] : Colors.grey.shade300
          ),
          const SizedBox(height: 16),
          Text(
            "Không có thông báo nào", 
            style: TextStyle(
              color: isDark ? Colors.grey[400] : Colors.grey.shade500, 
              fontSize: 16
            )
          ),
        ],
      ),
    );
  }
}
