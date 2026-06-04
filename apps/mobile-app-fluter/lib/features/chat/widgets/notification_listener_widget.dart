import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../services/app_services.dart';
import '../../../services/local_notification_service.dart';
import '../../../services/webrtc_service.dart';
import '../../../state/session_controller.dart';

/// Widget lắng nghe các sự kiện socket và hiển thị local push notification.
///
/// Đặt widget này bao quanh Shell để đảm bảo luôn active trong suốt
/// vòng đời của người dùng đã đăng nhập.
///
/// Hỗ trợ thông báo:
///  - 💬 Tin nhắn mới (message.created)
///  - 📞 Cuộc gọi đến (call.init / call.invite)
///  - 📊 Báo cáo (conversation.updated với type báo cáo)
class NotificationListenerWidget extends StatefulWidget {
  final Widget child;

  const NotificationListenerWidget({super.key, required this.child});

  @override
  State<NotificationListenerWidget> createState() =>
      _NotificationListenerWidgetState();
}

class _NotificationListenerWidgetState
    extends State<NotificationListenerWidget> {
  AppServices? _services;
  LocalNotificationService? _notif;
  final List<StreamSubscription> _subs = [];

  String? get _currentUserId {
    if (!mounted) return null;
    try {
      return context.read<SessionController>().user?.id;
    } catch (_) {
      return null;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final services = context.read<AppServices>();
    if (_services != services) {
      _cancelSubs();
      _services = services;
      _notif = services.localNotificationService;
      _setupListeners(services);
    }
  }

  void _setupListeners(AppServices services) {
    // ── Tin nhắn mới ─────────────────────────────────────────────────────────
    _subs.add(
      services.socketService.onMessageCreated.listen((msg) {
        // Không thông báo tin nhắn của chính mình
        if (msg.senderId == _currentUserId) return;

        final senderName = msg.senderName.isNotEmpty ? msg.senderName : 'Ai đó';
        final conversationId = msg.conversationId;
        final isGroup = conversationId.startsWith('group:') ||
            conversationId.startsWith('GRP#');

        // Xác định preview nội dung
        String preview;
        if (msg.type == 'image') {
          preview = '\u{1F5BC} Đã gửi một ảnh';
        } else if (msg.type == 'file') {
          preview = '\u{1F4CE} Đã gửi một tệp';
        } else if (msg.type == 'audio') {
          preview = '\u{1F3B5} Đã gửi một đoạn âm thanh';
        } else if (msg.type == 'video') {
          preview = '\u{1F3AC} Đã gửi một video';
        } else {
          final text = msg.contentText;
          preview = text.isNotEmpty
              ? (text.length > 100
                  ? '${text.substring(0, 100)}...'
                  : text)
              : 'Tin nhắn mới';
        }

        _notif?.showMessageNotification(
          senderName: senderName,
          conversationId: conversationId,
          preview: preview,
          groupName: isGroup ? 'Nhóm chat' : null,
        );
      }),
    );

    // ── Cuộc gọi đến (call.init) ─────────────────────────────────────────────
    _subs.add(
      services.socketService.onCallInit.listen((data) {
        final callerId = data['callerId']?.toString();
        // Không thông báo cuộc gọi của chính mình
        if (callerId == _currentUserId) return;

        final callerName = data['callerName']?.toString() ?? 'Ai đó';
        final conversationId = data['conversationId']?.toString() ?? '';
        final isVideo = data['isVideo'] != false;

        _notif?.showCallNotification(
          callerName: callerName,
          conversationId: conversationId,
          isVideo: isVideo,
        );

        // Dừng thông báo cuộc gọi khi cuộc gọi kết thúc
        _waitAndDismissCall(services);
      }),
    );

    // ── Cuộc gọi đến (call.invite cho group) ─────────────────────────────────
    _subs.add(
      services.socketService.onCallInvite.listen((data) {
        final callerId = data['callerId']?.toString();
        if (callerId == _currentUserId) return;

        final callerName = data['callerName']?.toString() ?? 'Ai đó';
        final conversationId = data['conversationId']?.toString() ?? '';
        final isVideo = data['isVideo'] != false;

        _notif?.showCallNotification(
          callerName: callerName,
          conversationId: conversationId,
          isVideo: isVideo,
        );

        _waitAndDismissCall(services);
      }),
    );

    // ── Lắng nghe callState để dismiss notification cuộc gọi khi đã xử lý ────
    _subs.add(
      services.webRTCService.callState.addListenerAsStream().listen((state) {
        if (state != CallState.ringing) {
          _notif?.dismissCallNotification();
        }
      }),
    );
  }

  /// Lắng nghe kết thúc cuộc gọi để dismiss notification.
  void _waitAndDismissCall(AppServices services) {
    StreamSubscription? sub;
    sub = services.socketService.onCallEnd.listen((_) {
      _notif?.dismissCallNotification();
      sub?.cancel();
    });
    _subs.add(sub);

    sub = services.socketService.onCallReject.listen((_) {
      _notif?.dismissCallNotification();
      sub?.cancel();
    });
    _subs.add(sub);
  }

  void _cancelSubs() {
    for (final sub in _subs) {
      sub.cancel();
    }
    _subs.clear();
  }

  @override
  void dispose() {
    _cancelSubs();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}

// Extension helper để convert ValueNotifier thành Stream
extension _ValueNotifierStream<T> on ValueNotifier<T> {
  Stream<T> addListenerAsStream() {
    late StreamController<T> controller;
    void listener() => controller.add(value);
    controller = StreamController<T>(
      onListen: () => addListener(listener),
      onCancel: () => removeListener(listener),
    );
    return controller.stream;
  }
}
