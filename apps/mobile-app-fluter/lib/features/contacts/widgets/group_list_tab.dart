import "package:flutter/material.dart";
import "package:skeletonizer/skeletonizer.dart";
import "package:provider/provider.dart";
import "../../../services/group_service.dart";
import "../../../services/app_services.dart";
import "../../shared/widgets/user_avatar.dart";
import "../../chat/chat_detail_screen.dart";
import "../../../models/conversation_summary.dart";
import "../../../state/session_controller.dart";

class GroupListTab extends StatefulWidget {
  final GroupService groupService;
  const GroupListTab({super.key, required this.groupService});

  @override
  State<GroupListTab> createState() => _GroupListTabState();
}

class _GroupListTabState extends State<GroupListTab> with AutomaticKeepAliveClientMixin {
  List<Map<String, dynamic>> _groups = [];
  bool _isLoading = true;
  String _searchQuery = "";

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadGroups();
  }

  Future<void> _loadGroups() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final groups = await widget.groupService.listGroups(mine: true);
      if (mounted) {
        setState(() {
          _groups = groups;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filteredGroups {
    if (_searchQuery.isEmpty) return _groups;
    return _groups.where((g) {
      final name = g["groupName"]?.toString().toLowerCase() ?? "";
      return name.contains(_searchQuery.toLowerCase());
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                )
              ],
            ),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: const InputDecoration(
                hintText: "Tìm kiếm nhóm...",
                prefixIcon: Icon(Icons.search, color: Color(0xFF7C3AED)),
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadGroups,
            color: const Color(0xFF7C3AED),
            child: Skeletonizer(
              enabled: _isLoading,
              child: _groups.isEmpty && !_isLoading
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _isLoading ? 5 : _filteredGroups.length,
                      itemBuilder: (context, index) {
                        if (_isLoading) {
                          return _buildSkeletonItem();
                        }
                        final group = _filteredGroups[index];
                        return _buildGroupItem(group);
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSkeletonItem() {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 8),
      leading: const CircleAvatar(radius: 28),
      title: Container(height: 16, width: 150, color: Colors.grey[300]),
      subtitle: Container(height: 12, width: 100, color: Colors.grey[200]),
    );
  }

  Widget _buildGroupItem(Map<String, dynamic> group) {
    final groupId = group["id"] ?? "";
    final groupName = group["groupName"] ?? "Nhóm không tên";
    final memberCount = group["memberCount"] ?? 0;
    final groupType = group["groupType"] ?? "AREA";
    final description = group["description"] ?? "";

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF1F5F9)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: UserAvatar(
          userId: null,
          initialDisplayName: groupName,
          radius: 28,
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                groupName,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: Color(0xFF1E293B),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (group["isOfficial"] == true)
              const Icon(Icons.verified, color: Colors.blue, size: 16),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(
              "$memberCount thành viên • $groupType",
              style: TextStyle(color: Colors.grey[600], fontSize: 13),
            ),
            if (description.isNotEmpty)
              Text(
                description,
                style: TextStyle(color: Colors.grey[500], fontSize: 12),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right, color: Color(0xFF94A3B8)),
        onTap: () => _navigateToChat(group),
      ),
    );
  }

  void _navigateToChat(Map<String, dynamic> group) {
    final groupId = group["id"] ?? "";
    final conversation = ConversationSummary(
      conversationId: "group:$groupId",
      groupName: group["groupName"] ?? "Nhóm",
      unreadCount: 0,
      isGroup: true,
      updatedAt: DateTime.now().toIso8601String(),
    );

    final services = context.read<AppServices>();
    final session = context.read<SessionController>();

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ChatDetailScreen(
          conversation: conversation,
          conversationService: services.conversationService,
          uploadService: services.uploadService,
          socketService: services.socketService,
          userService: services.userService,
          groupService: services.groupService,
          webRTCService: services.webRTCService,
          currentUser: session.user,
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.group_outlined, size: 80, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            "Bạn chưa tham gia nhóm nào",
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.grey[400],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            "Hãy khám phá hoặc tạo nhóm mới!",
            style: TextStyle(color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }
}
