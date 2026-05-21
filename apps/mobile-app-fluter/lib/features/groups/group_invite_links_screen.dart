import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:skeletonizer/skeletonizer.dart';
import '../../services/group_service.dart';

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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã tạo link mời')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Không thể tạo link mời')));
    }
  }

  Future<void> _revokeLink(String inviteId) async {
    try {
      await widget.groupService.revokeInviteLink(groupId: widget.groupId, inviteId: inviteId);
      _loadLinks();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã thu hồi link')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Không thể thu hồi')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Link mời - ${widget.groupName}')),
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
                  ? const Center(child: Text('Chưa có link mời nào', style: TextStyle(color: Colors.grey)))
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
                            leading: const Icon(Icons.link, color: Color(0xFF7C3AED)),
                            title: Text(code, style: const TextStyle(fontWeight: FontWeight.w600, fontFamily: 'monospace')),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Đã dùng: $uses${maxUses != null ? ' / $maxUses' : ''}', style: const TextStyle(fontSize: 12)),
                                if (expiresAt != null) Text('Hết hạn: $expiresAt', style: const TextStyle(fontSize: 12, color: Colors.orange)),
                              ],
                            ),
                            trailing: PopupMenuButton<String>(
                              onSelected: (v) {
                                if (v == 'copy') {
                                  Clipboard.setData(ClipboardData(text: code));
                                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã sao chép')));
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
