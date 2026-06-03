import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../models/conversation_summary.dart';
import '../../../services/app_services.dart';
import '../../../services/call_sound_service.dart';
import '../../../services/webrtc_service.dart';
import '../../../state/session_controller.dart';
import '../call_screen.dart';

/// Widget bọc [child] và tự động lắng nghe [WebRTCService.callState].
/// Khi trạng thái chuyển sang [CallState.ringing], nó sẽ điều hướng đến
/// [CallScreen] bằng [rootNavigator] để hiển thị đúng cách trên shell GoRouter.
class CallIncomingListener extends StatefulWidget {
  final Widget child;

  const CallIncomingListener({super.key, required this.child});

  @override
  State<CallIncomingListener> createState() => _CallIncomingListenerState();
}

class _CallIncomingListenerState extends State<CallIncomingListener> {
  WebRTCService? _webRTCService;
  bool _isNavigating = false;
  final _sound = CallSoundService();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final services = context.read<AppServices>();
    final newService = services.webRTCService;

    if (_webRTCService != newService) {
      _webRTCService?.callState.removeListener(_onCallStateChanged);
      _webRTCService = newService;
      _webRTCService?.callState.addListener(_onCallStateChanged);
    }
  }

  @override
  void dispose() {
    _webRTCService?.callState.removeListener(_onCallStateChanged);
    super.dispose();
  }

  void _onCallStateChanged() {
    final svc = _webRTCService;
    if (svc == null || !mounted) return;

    final state = svc.callState.value;

    // Reset cờ và dừng nhạc khi cuộc gọi kết thúc
    if (state == CallState.idle || state == CallState.connected) {
      _isNavigating = false;
      _sound.stopRingtone();
      return;
    }

    // Chỉ xử lý khi trạng thái là ringing và chưa đang navigate
    if (state != CallState.ringing || _isNavigating) return;

    // Phát nhạc chuông báo cuộc gọi đến
    _sound.playRingtone();

    // Đặt cờ để tránh điều hướng nhiều lần
    _isNavigating = true;

    // Sử dụng addPostFrameCallback để đảm bảo widget đã được build
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        _isNavigating = false;
        return;
      }

      final session = context.read<SessionController>();
      final currentUser = session.user;
      if (currentUser == null) {
        _isNavigating = false;
        return;
      }

      final convId = svc.currentConversationId ?? '';
      final isGroup = convId.startsWith('group:') ||
          convId.startsWith('group#') ||
          convId.startsWith('grp#') ||
          convId.startsWith('GRP#');

      final callerName =
          svc.activeConfig?['callerName']?.toString() ?? 'Người dùng';
      final callerAvatarUrl =
          svc.activeConfig?['callerAvatarUrl']?.toString();

      // Tạo ConversationSummary từ thông tin cuộc gọi đến
      // groupName là required non-nullable, dùng callerName làm tên hiển thị
      final conversation = ConversationSummary(
        conversationId: convId,
        groupName: callerName,
        groupAvatarUrl: isGroup ? callerAvatarUrl : null,
        peerAvatarUrl: isGroup ? null : callerAvatarUrl,
        lastSenderName: callerName,
        unreadCount: 0,
        isGroup: isGroup,
        updatedAt: DateTime.now().toIso8601String(),
      );

      // Điều hướng bằng rootNavigator để thoát khỏi shell GoRouter
      Navigator.of(context, rootNavigator: true)
          .push<void>(
        MaterialPageRoute(
          builder: (_) => CallScreen(
            webRTCService: svc,
            conversation: conversation,
            currentUser: currentUser,
            launchedFromChatDetail: false,
          ),
        ),
      )
          .whenComplete(() {
        if (mounted) {
          _isNavigating = false;
        }
      });
    });
  }


  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
