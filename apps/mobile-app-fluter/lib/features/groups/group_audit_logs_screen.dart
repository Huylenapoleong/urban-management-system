import 'package:flutter/material.dart';
import 'package:skeletonizer/skeletonizer.dart';
import 'package:intl/intl.dart';
import '../../services/group_service.dart';

class GroupAuditLogsScreen extends StatefulWidget {
  final GroupService groupService;
  final String groupId;
  final String groupName;

  const GroupAuditLogsScreen({super.key, required this.groupService, required this.groupId, required this.groupName});

  @override
  State<GroupAuditLogsScreen> createState() => _GroupAuditLogsScreenState();
}

class _GroupAuditLogsScreenState extends State<GroupAuditLogsScreen> {
  List<Map<String, dynamic>> _logs = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadLogs();
  }

  Future<void> _loadLogs() async {
    setState(() => _isLoading = true);
    try {
      final logs = await widget.groupService.getAuditLogs(widget.groupId);
      if (mounted) setState(() { _logs = logs; _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  IconData _eventIcon(String? action) {
    switch (action?.toUpperCase()) {
      case 'GROUP_CREATED': return Icons.group_add;
      case 'GROUP_MEMBER_ADDED': return Icons.person_add;
      case 'GROUP_MEMBER_REMOVED': return Icons.person_remove;
      case 'GROUP_MEMBER_BANNED': return Icons.block;
      case 'GROUP_MEMBER_UNBANNED': return Icons.check_circle;
      case 'GROUP_OWNERSHIP_TRANSFERRED': return Icons.swap_horiz;
      case 'GROUP_UPDATED': return Icons.edit;
      case 'GROUP_DISSOLVED': return Icons.delete_forever;
      case 'INVITE_CREATED': return Icons.link;
      case 'INVITE_REVOKED': return Icons.link_off;
      default: return Icons.info_outline;
    }
  }

  Color _eventColor(String? action) {
    switch (action?.toUpperCase()) {
      case 'GROUP_CREATED': return Colors.green;
      case 'GROUP_MEMBER_ADDED': return Colors.green;
      case 'GROUP_MEMBER_REMOVED': return Colors.orange;
      case 'GROUP_MEMBER_BANNED': return Colors.red;
      case 'GROUP_MEMBER_UNBANNED': return Colors.teal;
      case 'GROUP_OWNERSHIP_TRANSFERRED': return const Color(0xFF7C3AED);
      case 'GROUP_DISSOLVED': return Colors.red;
      default: return const Color(0xFF64748B);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          'Nhật ký - ${widget.groupName}',
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        iconTheme: IconThemeData(color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
      ),
      body: RefreshIndicator(
        onRefresh: _loadLogs,
        child: Skeletonizer(
          enabled: _isLoading,
          child: _isLoading
              ? ListView.builder(itemCount: 8, itemBuilder: (_, __) => const ListTile(leading: CircleAvatar(radius: 16), title: Text('Loading...'), subtitle: Text('...')))
              : _logs.isEmpty
                  ? Center(child: Text('Chưa có hoạt động nào', style: TextStyle(color: isDark ? const Color(0xFF64748B) : Colors.grey)))
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _logs.length,
                      itemBuilder: (context, index) {
                        final log = _logs[index];
                        final action = log['action']?.toString() ?? '';
                        final summary = log['summary']?.toString() ?? '';
                        final occurredAt = log['occurredAt']?.toString() ?? '';
                        final time = DateTime.tryParse(occurredAt);
                        final timeStr = time != null ? DateFormat('dd/MM/yyyy HH:mm').format(time.toLocal()) : occurredAt;

                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF1E293B) : Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
                          ),
                          child: ListTile(
                            leading: CircleAvatar(
                              radius: 18,
                              backgroundColor: _eventColor(action).withOpacity(0.15),
                              child: Icon(_eventIcon(action), size: 20, color: _eventColor(action)),
                            ),
                            title: Text(
                              summary.isNotEmpty ? summary : action,
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: isDark ? Colors.white : Colors.black87),
                            ),
                            subtitle: Text(
                              timeStr,
                              style: TextStyle(fontSize: 11, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF94A3B8)),
                            ),
                          ),
                        );
                      },
                    ),
        ),
      ),
    );
  }

}
