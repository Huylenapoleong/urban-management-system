import "package:flutter/material.dart";
import "package:skeletonizer/skeletonizer.dart";
import "../../../services/user_service.dart";
import "../../../models/user_profile.dart";
import "../../shared/widgets/user_avatar.dart";

class RequestListTab extends StatefulWidget {
  final UserService userService;
  const RequestListTab({super.key, required this.userService});

  @override
  State<RequestListTab> createState() => _RequestListTabState();
}

class _RequestListTabState extends State<RequestListTab> with AutomaticKeepAliveClientMixin {
  List<Map<String, dynamic>> _receivedRequests = [];
  List<Map<String, dynamic>> _sentRequests = [];
  bool _isLoading = true;
  bool _showSent = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadRequests();
  }

  Future<void> _loadRequests() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      // API uses uppercase: INCOMING / OUTGOING
      final received = await widget.userService.listFriendRequests(direction: "INCOMING");
      final sent = await widget.userService.listFriendRequests(direction: "OUTGOING");
      if (mounted) {
        setState(() {
          _receivedRequests = received;
          _sentRequests = sent;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error loading friend requests: $e");
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Lỗi tải danh sách yêu cầu: $e"),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final currentList = _showSent ? _sentRequests : _receivedRequests;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                _buildToggleOption(
                  "Đã nhận${_receivedRequests.isNotEmpty ? ' (${_receivedRequests.length})' : ''}",
                  !_showSent,
                  () => setState(() => _showSent = false),
                  isDark,
                ),
                _buildToggleOption(
                  "Đã gửi${_sentRequests.isNotEmpty ? ' (${_sentRequests.length})' : ''}",
                  _showSent,
                  () => setState(() => _showSent = true),
                  isDark,
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadRequests,
            color: const Color(0xFF7C3AED),
            child: Skeletonizer(
              enabled: _isLoading,
              child: currentList.isEmpty && !_isLoading
                  ? _buildEmptyState(_showSent)
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _isLoading ? 5 : currentList.length,
                      itemBuilder: (context, index) {
                        if (_isLoading) return _buildSkeletonItem();
                        final requestData = currentList[index];
                        final user = UserProfile.fromJson(requestData);
                        return _buildRequestItem(user, requestData, !_showSent);
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildToggleOption(String label, bool isSelected, VoidCallback onTap, bool isDark) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? (isDark ? const Color(0xFF0F172A) : Colors.white) : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            boxShadow: isSelected
                ? [BoxShadow(color: isDark ? Colors.transparent : Colors.black.withOpacity(0.05), blurRadius: 4, offset: const Offset(0, 2))]
                : [],
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                color: isSelected ? const Color(0xFF7C3AED) : const Color(0xFF64748B),
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildRequestItem(UserProfile user, Map<String, dynamic> data, bool isIncoming) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final requestedAt = data['requestedAt'] as String?;
    String? timeAgo;
    if (requestedAt != null) {
      try {
        final dt = DateTime.parse(requestedAt).toLocal();
        final diff = DateTime.now().difference(dt);
        if (diff.inDays > 0) {
          timeAgo = "${diff.inDays} ngày trước";
        } else if (diff.inHours > 0) {
          timeAgo = "${diff.inHours} giờ trước";
        } else if (diff.inMinutes > 0) {
          timeAgo = "${diff.inMinutes} phút trước";
        } else {
          timeAgo = "Vừa xong";
        }
      } catch (_) {}
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color ?? (isDark ? const Color(0xFF1E293B) : Colors.white),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: isDark ? Colors.transparent : Colors.black.withOpacity(0.02), blurRadius: 5)],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          UserAvatar(
            userId: user.id,
            initialAvatarUrl: user.avatarUrl,
            initialDisplayName: user.fullName,
            radius: 28,
            userService: widget.userService,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.fullName,
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
                ),
                const SizedBox(height: 2),
                Text(
                  isIncoming ? "Muốn kết bạn với bạn" : "Đang chờ phản hồi...",
                  style: TextStyle(color: Colors.grey[500], fontSize: 13),
                ),
                if (timeAgo != null) ...[
                  const SizedBox(height: 2),
                  Text(timeAgo, style: TextStyle(color: Colors.grey[400], fontSize: 11)),
                ],
              ],
            ),
          ),
          if (isIncoming) ...[
            // Accept button
            GestureDetector(
              onTap: () => _handleRequest(user.id, "accept"),
              child: Container(
                margin: const EdgeInsets.only(left: 6),
                width: 40,
                height: 40,
                decoration: const BoxDecoration(
                  color: Color(0xFF22C55E),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check, color: Colors.white, size: 22),
              ),
            ),
            const SizedBox(width: 6),
            // Reject button
            GestureDetector(
              onTap: () => _handleRequest(user.id, "reject"),
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.close, color: Colors.grey[600], size: 22),
              ),
            ),
          ] else
            TextButton(
              onPressed: () => _handleRequest(user.id, "cancel"),
              style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
              child: const Text("Hủy"),
            ),
        ],
      ),
    );
  }

  Future<void> _handleRequest(String userId, String action) async {
    try {
      if (action == "accept") {
        await widget.userService.acceptFriendRequest(userId);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Đã chấp nhận kết bạn!"), backgroundColor: Color(0xFF22C55E)),
          );
        }
      } else if (action == "reject") {
        await widget.userService.rejectFriendRequest(userId);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Đã từ chối yêu cầu")),
          );
        }
      } else if (action == "cancel") {
        await widget.userService.cancelFriendRequest(userId);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Đã hủy yêu cầu kết bạn")),
          );
        }
      }
      _loadRequests();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi: $e")));
      }
    }
  }

  Widget _buildSkeletonItem() {
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: const ListTile(
        leading: CircleAvatar(radius: 28),
        title: Bone.text(width: 100),
        subtitle: Bone.text(width: 150),
      ),
    );
  }

  Widget _buildEmptyState(bool isSent) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            isSent ? Icons.send_outlined : Icons.mail_outline,
            size: 80,
            color: Colors.grey[300],
          ),
          const SizedBox(height: 16),
          Text(
            isSent ? "Chưa gửi yêu cầu kết bạn nào" : "Chưa có yêu cầu kết bạn nào",
            style: TextStyle(color: Colors.grey[400], fontSize: 15),
          ),
        ],
      ),
    );
  }
}
