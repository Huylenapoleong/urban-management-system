import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:skeletonizer/skeletonizer.dart';
import '../../services/group_service.dart';
import '../shared/widgets/app_toast.dart';

class GroupInviteLinksScreen extends StatefulWidget {
  final GroupService groupService;
  final String groupId;
  final String groupName;

  const GroupInviteLinksScreen({super.key, required this.groupService, required this.groupId, required this.groupName});

  @override
  State<GroupInviteLinksScreen> createState() => _GroupInviteLinksScreenState();
}

class _GroupInviteLinksScreenState extends State<GroupInviteLinksScreen> {
  List<Map<String, dynamic>> _links = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadLinks();
  }

  Future<void> _loadLinks() async {
    setState(() => _isLoading = true);
    try {
      final links = await widget.groupService.listInviteLinks(widget.groupId);
      if (mounted) setState(() { _links = links; _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _createLink() async {
    try {
      await widget.groupService.createInviteLink(groupId: widget.groupId);
      _loadLinks();
      if (mounted) {
        AppToast.show(
          context,
          message: 'Đã tạo link mời',
          type: AppToastType.success,
        );
      }
    } catch (e) {
      if (mounted) {
        AppToast.show(
          context,
          message: 'Không thể tạo link mời',
          type: AppToastType.error,
        );
      }
    }
  }

  Future<void> _revokeLink(String inviteId) async {
    try {
      await widget.groupService.revokeInviteLink(groupId: widget.groupId, inviteId: inviteId);
      _loadLinks();
      if (mounted) {
        AppToast.show(
          context,
          message: 'Đã thu hồi link',
          type: AppToastType.success,
        );
      }
    } catch (e) {
      if (mounted) {
        AppToast.show(
          context,
          message: 'Không thể thu hồi',
          type: AppToastType.error,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          'Link mời - ${widget.groupName}',
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createLink,
        icon: const Icon(Icons.add_link),
        label: const Text('Tạo link mới'),
        backgroundColor: const Color(0xFF7C3AED),
        foregroundColor: Colors.white,
      ),
      body: RefreshIndicator(
        onRefresh: _loadLinks,
        child: Skeletonizer(
          enabled: _isLoading,
          child: _isLoading
              ? ListView.builder(itemCount: 3, itemBuilder: (_, __) => const ListTile(leading: Icon(Icons.link), title: Text('Loading...')))
              : _links.isEmpty
                  ? Center(child: Text('Chưa có link mời nào', style: TextStyle(color: isDark ? const Color(0xFF64748B) : Colors.grey)))
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _links.length,
                      itemBuilder: (context, index) {
                        final link = _links[index];
                        final code = link['code']?.toString() ?? '';
                        final id = link['id']?.toString() ?? '';
                        final uses = link['uses'] ?? 0;
                        final maxUses = link['maxUses'];
                        final expiresAt = link['expiresAt']?.toString();

                        return Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          child: ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            leading: Icon(Icons.link, color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
                            title: Text(
                              code,
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                fontFamily: 'monospace',
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Đã dùng: $uses${maxUses != null ? ' / $maxUses' : ''}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: isDark ? const Color(0xFF94A3B8) : Colors.black54,
                                  ),
                                ),
                                if (expiresAt != null)
                                  Text(
                                    'Hết hạn: $expiresAt',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: isDark ? Colors.amber.shade300 : Colors.orange,
                                    ),
                                  ),
                              ],
                            ),
                            trailing: PopupMenuButton<String>(
                              onSelected: (v) {
                                if (v == 'copy') {
                                  Clipboard.setData(ClipboardData(text: code));
                                  AppToast.show(
                                    context,
                                    message: 'Đã sao chép',
                                    type: AppToastType.success,
                                  );
                                } else if (v == 'revoke') {
                                  _revokeLink(id);
                                }
                              },
                              itemBuilder: (_) => [
                                const PopupMenuItem(value: 'copy', child: Text('Sao chép mã')),
                                const PopupMenuItem(value: 'revoke', child: Text('Thu hồi', style: TextStyle(color: Colors.red))),
                              ],
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
