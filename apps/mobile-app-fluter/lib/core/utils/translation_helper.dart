import "dart:core";
import "../network/api_client.dart";

/// Helper to translate system messages from English to Vietnamese.
String translateSystemMessage(String text) {
  if (text.isEmpty) return text;
  
  if (text == 'Call event.') return 'Sự kiện cuộc gọi.';
  if (text == 'Video call was rejected.') return 'Cuộc gọi video đã bị từ chối.';
  if (text == 'Voice call was rejected.') return 'Cuộc gọi thoại đã bị từ chối.';
  if (text == 'Video call ended.') return 'Cuộc gọi video đã kết thúc.';
  if (text == 'Voice call ended.') return 'Cuộc gọi thoại đã kết thúc.';

  // Video call ended (00:05).
  var match = RegExp(r'^Video call ended \((.+)\)\.$').firstMatch(text);
  if (match != null) {
    return 'Cuộc gọi video đã kết thúc (${match.group(1)}).';
  }

  // Voice call ended (00:05).
  match = RegExp(r'^Voice call ended \((.+)\)\.$').firstMatch(text);
  if (match != null) {
    return 'Cuộc gọi thoại đã kết thúc (${match.group(1)}).';
  }

  // Ownership was transferred from User A to User B.
  match = RegExp(r'^Ownership was transferred from (.+?) to (.+?)\.$').firstMatch(text);
  if (match != null) {
    return 'Quyền trưởng nhóm đã được chuyển từ ${match.group(1)} sang ${match.group(2)}.';
  }

  // User A renamed the group to Name B.
  match = RegExp(r'^(.+?) renamed the group to (.+?)\.$').firstMatch(text);
  if (match != null) {
    return '${match.group(1)} đã đổi tên nhóm thành ${match.group(2)}.';
  }

  // User A changed message permissions to Policy.
  match = RegExp(r'^(.+?) changed message permissions to (.+?)\.$').firstMatch(text);
  if (match != null) {
    var policy = match.group(2);
    if (policy == 'Owner only') {
      policy = 'Chỉ trưởng nhóm';
    } else if (policy == 'Owner and Deputies only') {
      policy = 'Trưởng nhóm và phó nhóm';
    } else if (policy == 'All members') {
      policy = 'Tất cả thành viên';
    }
    return '${match.group(1)} đã thay đổi quyền gửi tin nhắn thành $policy.';
  }

  // User A joined the group via invite link.
  match = RegExp(r'^(.+?) joined the group via invite link\.$').firstMatch(text);
  if (match != null) {
    return '${match.group(1)} đã tham gia nhóm bằng liên kết mời.';
  }

  // User A joined the group.
  match = RegExp(r'^(.+?) joined the group\.$').firstMatch(text);
  if (match != null) {
    return '${match.group(1)} đã tham gia nhóm.';
  }

  // User A left the group.
  match = RegExp(r'^(.+?) left the group\.$').firstMatch(text);
  if (match != null) {
    return '${match.group(1)} đã rời khỏi nhóm.';
  }

  // User A banned User B from the group.
  match = RegExp(r'^(.+?) banned (.+?) from the group\.$').firstMatch(text);
  if (match != null) {
    return '${match.group(1)} đã cấm ${match.group(2)} tham gia nhóm.';
  }

  // User A unbanned User B.
  match = RegExp(r'^(.+?) unbanned (.+?)\.$').firstMatch(text);
  if (match != null) {
    return '${match.group(1)} đã bỏ cấm cho ${match.group(2)}.';
  }

  // User A added User B to the group.
  match = RegExp(r'^(.+?) added (.+?) to the group\.$').firstMatch(text);
  if (match != null) {
    return '${match.group(1)} đã thêm ${match.group(2)} vào nhóm.';
  }

  // User A changed User B's role to Role.
  match = RegExp(r'^(.+?) changed (.+?)\x27s role to (OWNER|DEPUTY|MEMBER)\.$').firstMatch(text);
  if (match != null) {
    var role = match.group(3);
    if (role == 'OWNER') {
      role = 'Trưởng nhóm';
    } else if (role == 'DEPUTY') {
      role = 'Phó nhóm';
    } else if (role == 'MEMBER') {
      role = 'Thành viên';
    }
    return '${match.group(1)} đã thay đổi vai trò của ${match.group(2)} thành $role.';
  }

  // User A removed User B from the group.
  match = RegExp(r'^(.+?) removed (.+?) from the group\.$').firstMatch(text);
  if (match != null) {
    return '${match.group(1)} đã xóa ${match.group(2)} khỏi nhóm.';
  }

  // User A left the call.
  match = RegExp(r'^(.+?) left the call\.$').firstMatch(text);
  if (match != null) {
    return '${match.group(1)} đã rời cuộc gọi.';
  }

  return text;
}

/// Translates group management API and exception errors to premium Vietnamese notifications.
String translateGroupError(dynamic error, {String? fallback}) {
  final message = ApiClient.extractError(error);

  if (message.contains('Owner must choose another active member as the new owner before leaving.')) {
    return 'Không thể rời nhóm vì bạn đang là Trưởng nhóm! Vui lòng chuyển quyền Trưởng nhóm cho thành viên khác trước khi rời.';
  }
  if (message.contains('Blocked user not found.')) {
    return 'Không tìm thấy người dùng bị chặn.';
  }
  if (message.contains('Cannot block yourself.')) {
    return 'Bạn không thể tự chặn chính mình.';
  }
  if (message.contains('Friend requests are blocked between these users.')) {
    return 'Không thể thực hiện yêu cầu kết bạn do tài khoản của bạn hoặc đối phương đã bị chặn.';
  }
  if (message.contains('Membership not found.')) {
    return 'Không tìm thấy thông tin thành viên của bạn trong nhóm.';
  }
  if (message.contains('You cannot ban yourself from the group.')) {
    return 'Bạn không thể cấm chính mình khỏi nhóm.';
  }
  if (message.contains('The group owner cannot be banned.')) {
    return 'Không thể cấm Trưởng nhóm khỏi nhóm.';
  }
  if (message.contains('Deputies can only ban regular members.')) {
    return 'Phó nhóm chỉ có quyền cấm thành viên thường.';
  }
  if (message.contains('You cannot transfer group ownership.')) {
    return 'Bạn không có quyền chuyển quyền Trưởng nhóm.';
  }
  if (message.contains('Choose another active member as the new owner.')) {
    return 'Vui lòng chọn một thành viên khác đang hoạt động làm Trưởng nhóm mới.';
  }
  if (message.contains('Group ownership changed.')) {
    return 'Thông tin quyền Trưởng nhóm đã thay đổi. Vui lòng tải lại trang và thử lại.';
  }
  if (message.contains('You cannot access members of this group.')) {
    return 'Bạn không có quyền xem danh sách thành viên của nhóm này.';
  }
  if (message.contains('Only the owner can') || message.contains('Only owner can')) {
    return 'Chỉ có Trưởng nhóm mới có quyền thực hiện thao tác này.';
  }
  if (message.contains('Forbidden') || message.contains('permission') || message.contains('Permission denied')) {
    return 'Bạn không có quyền thực hiện hành động này.';
  }
  if (message.contains('User already in group') || message.contains('already a member')) {
    return 'Người dùng này đã là thành viên của nhóm.';
  }
  if (message.contains('Group not found')) {
    return 'Không tìm thấy thông tin nhóm.';
  }
  if (message.contains('is already banned') || message.contains('banned')) {
    return 'Thành viên này đã bị cấm khỏi nhóm.';
  }

  // Fallbacks or default Vietnamese messages for common keywords
  if (message.toLowerCase().contains('owner')) {
    return 'Thao tác thất bại do liên quan đến quyền Trưởng nhóm. Vui lòng kiểm tra lại.';
  }

  // If the message is already Vietnamese, keep it
  if (message.contains('Không thể') || message.contains('Lỗi') || message.contains('thành công') || message.contains('nhóm')) {
    return message;
  }

  if (fallback != null && fallback.isNotEmpty) {
    return '$fallback. Chi tiết: $message';
  }

  return 'Thao tác thất bại. Lỗi: $message';
}

extension SystemMessageTranslation on String {
  String get translatedSystemMessage => translateSystemMessage(this);
}


