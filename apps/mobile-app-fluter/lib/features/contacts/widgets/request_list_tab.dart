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
      final received = await widget.userService.listFriendRequests(direction: "incoming");
      final sent = await widget.userService.listFriendRequests(direction: "outgoing");
      if (mounted) {
        setState(() {
          _receivedRequests = received;
          _sentRequests = sent;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final currentList = _showSent ? _sentRequests : _receivedRequests;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(16)),
            child: Row(
              children: [
                _buildToggleOption("Đã nhận", !_showSent, () => setState(() => _showSent = false)),
                _buildToggleOption("Đã gửi", _showSent, () => setState(() => _showSent = true)),
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
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _isLoading ? 5 : currentList.length,
                      itemBuilder: (context, index) {
                        if (_isLoading) return _buildSkeletonItem();
                        final requestData = currentList[index];
                        final otherUser = UserProfile.fromJson(requestData);
                        return _buildRequestItem(otherUser, requestData, !_showSent);
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildToggleOption(String label, bool isSelected, VoidCallback onTap) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            boxShadow: isSelected ? [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4, offset: const Offset(0, 2))] : [],
          ),
          child: Center(
            child: Text(label, style: TextStyle(fontWeight: isSelected ? FontWeight.bold : FontWeight.w500, color: isSelected ? const Color(0xFF7C3AED) : const Color(0xFF64748B))),
          ),
        ),
      ),
    );
  }

  Widget _buildRequestItem(UserProfile user, Map<String, dynamic> data, bool isIncoming) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 5)]),
      child: Row(
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
                Text(user.fullName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF1E1B4B))),
                Text(isIncoming ? "Muốn kết bạn với bạn" : "Chờ phản hồi...", style: TextStyle(color: Colors.grey[500], fontSize: 13)),
              ],
            ),
          ),
          if (isIncoming) ...[
            IconButton(icon: const Icon(Icons.check_circle, color: Colors.green, size: 32), onPressed: () => _handleRequest(user.id, "accept")),
            IconButton(icon: const Icon(Icons.cancel, color: Colors.redAccent, size: 32), onPressed: () => _handleRequest(user.id, "reject")),
          ] else
            TextButton(onPressed: () => _handleRequest(user.id, "cancel"), child: const Text("Hủy", style: TextStyle(color: Colors.redAccent))),
        ],
      ),
    );
  }

  Future<void> _handleRequest(String userId, String action) async {
    try {
      if (action == "accept") await widget.userService.acceptFriendRequest(userId);
      else if (action == "reject") await widget.userService.rejectFriendRequest(userId);
      else if (action == "cancel") await widget.userService.cancelFriendRequest(userId);
      _loadRequests();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi: $e")));
    }
  }

  Widget _buildSkeletonItem() {
    return Card(elevation: 0, margin: const EdgeInsets.only(bottom: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), child: const ListTile(leading: CircleAvatar(radius: 28), title: Bone.text(width: 100), subtitle: Bone.text(width: 150)));
  }

  Widget _buildEmptyState() {
    return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.mail_outline, size: 80, color: Colors.grey[200]), const SizedBox(height: 16), Text("Không có yêu cầu nào", style: TextStyle(color: Colors.grey[400], fontSize: 16))]));
  }
}
