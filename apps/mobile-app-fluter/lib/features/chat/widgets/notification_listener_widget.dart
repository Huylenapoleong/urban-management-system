import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../services/app_services.dart';
import '../../../services/local_notification_service.dart';
import '../../../services/webrtc_service.dart';
import '../../../services/call_sound_service.dart';
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

  final Map<String, _ConversationDebounceState> _debounceStates = {};

  bool _checkIsSilent(String conversationId) {
    final now = DateTime.now();
    var state = _debounceStates[conversationId];
    if (state == null) {
      state = _ConversationDebounceState()
        ..messageCount = 1
        ..windowStart = now
        ..lastMessageTime = now
        ..silentMode = false;
      _debounceStates[conversationId] = state;
      return false;
    }

    if (now.difference(state.lastMessageTime).inMilliseconds > 5000) {
      state.messageCount = 1;
      state.windowStart = now;
      state.lastMessageTime = now;
      state.silentMode = false;
      return false;
    }

    state.lastMessageTime = now;
    state.messageCount++;

    if (now.difference(state.windowStart).inMilliseconds > 10000) {
      state.windowStart = now;
      state.messageCount = 1;
      state.silentMode = false;
      return false;
    }

    if (state.messageCount > 5) {
      state.silentMode = true;
    }

    return state.silentMode;
  }

  void _setupListeners(AppServices services) {
    // ── Tin nhắn mới ─────────────────────────────────────────────────────────
    _subs.add(
      services.socketService.onMessageCreated.listen((msg) {
        debugPrint('[NotificationListener] Received message: id=${msg.id}, senderId=${msg.senderId}, conversationId=${msg.conversationId}, type=${msg.type}');
        
        // Không thông báo tin nhắn của chính mình
        if (msg.senderId == _currentUserId) {
          debugPrint('[NotificationListener] Ignored because message is from self');
          return;
        }

        // Nếu người dùng đang thực sự xem cuộc hội thoại này, không phát âm thanh hoặc hiện thông báo
        try {
          final session = context.read<SessionController>();
          final activeConvId = session.activeConversationId;
          debugPrint('[NotificationListener] activeConvId=$activeConvId, msg.conversationId=${msg.conversationId}');
          
          if (activeConvId == msg.conversationId) {
            // Xác định xem người dùng có thực sự đang ở tab Tin nhắn và màn hình ChatDetail không bị che bởi màn hình khác (như Cài đặt)
            final isShellVisible = ModalRoute.of(context)?.isCurrent ?? false;
            
            final isOfficial = session.user?.role != null &&
                const {'ADMIN', 'PROVINCE_OFFICER', 'WARD_OFFICER', 'OFFICER'}
                    .contains(session.user!.role!.toUpperCase());
            final isChatTab = isOfficial
                ? session.activeTabIndex == 2
                : session.activeTabIndex == 1;

            debugPrint('[NotificationListener] activeTabIndex=${session.activeTabIndex}, isShellVisible=$isShellVisible, isChatTab=$isChatTab');
            if (isShellVisible && isChatTab) {
              debugPrint('[NotificationListener] Ignored because user is actively viewing this conversation');
              return;
            }
          }
        } catch (e) {
          debugPrint('[NotificationListener] Error checking active view status: $e');
        }

        final session = context.read<SessionController>();
        debugPrint('[NotificationListener] pushNotificationEnabled=${session.pushNotificationEnabled}');
        if (!session.pushNotificationEnabled) {
          debugPrint('[NotificationListener] Ignored because pushNotificationEnabled is false');
          return;
        }

        final conversationId = msg.conversationId;
        final isGroup = conversationId.startsWith('group:') ||
            conversationId.startsWith('GRP#');

        // Xác định preview nội dung gốc
        String originalText = '';
        if (msg.type == 'image') {
          originalText = '\u{1F5BC} Đã gửi một ảnh';
        } else if (msg.type == 'file') {
          originalText = '\u{1F4CE} Đã gửi một tệp';
        } else if (msg.type == 'audio') {
          originalText = '\u{1F3B5} Đã gửi một đoạn âm thanh';
        } else if (msg.type == 'video') {
          originalText = '\u{1F3AC} Đã gửi một video';
        } else {
          originalText = msg.contentText;
        }

        final userFullName = session.user?.fullName ?? '';
        final hasMention = userFullName.isNotEmpty &&
            (originalText.toLowerCase().contains('@all') ||
                originalText.toLowerCase().contains('@${userFullName.toLowerCase()}'));

        debugPrint('[NotificationListener] isGroup=$isGroup, hasMention=$hasMention');

        // Áp dụng bộ lọc nhóm
        if (isGroup) {
          final filter = session.groupNotificationFilter;
          debugPrint('[NotificationListener] groupNotificationFilter=$filter');
          if (filter == 'MENTIONS_ONLY' && !hasMention) {
            debugPrint('[NotificationListener] Ignored group message because MENTIONS_ONLY and not mentioned');
            return;
          }
          if (filter == 'PINNED_ONLY' && msg.pinnedAt == null) {
            debugPrint('[NotificationListener] Ignored group message because PINNED_ONLY and not pinned');
            return;
          }
        }

        // Áp dụng silent debounce 1-1
        bool isSilent = false;
        if (!isGroup && session.oneToOneSilentDebounce) {
          isSilent = _checkIsSilent(conversationId);
          debugPrint('[NotificationListener] 1-1 SilentDebounce check returned isSilent=$isSilent');
        }

        // Quyết định phát âm thanh
        bool shouldPlaySound = true;
        if (isGroup) {
          if (session.groupSoundEnabled) {
            shouldPlaySound = true;
          } else {
            shouldPlaySound = hasMention && session.priorityMentionsOverride;
          }
        } else {
          shouldPlaySound = !isSilent;
        }
        debugPrint('[NotificationListener] shouldPlaySound=$shouldPlaySound');

        if (shouldPlaySound) {
          try {
            CallSoundService().playMessageSound();
          } catch (e) {
            debugPrint('[NotificationListener] Error playing sound: $e');
          }
        }

        // Áp dụng Privacy Mode cho 1-1
        String senderName = msg.senderName.isNotEmpty ? msg.senderName : 'Ai đó';
        String preview = originalText;
        String? displayGroupName = isGroup ? 'Nhóm chat' : null;

        if (!isGroup) {
          final privacyMode = session.oneToOnePrivacyMode;
          debugPrint('[NotificationListener] oneToOnePrivacyMode=$privacyMode');
          if (privacyMode == 'HIDE_CONTENT') {
            preview = 'Bạn có tin nhắn mới';
          } else if (privacyMode == 'ANONYMOUS') {
            senderName = 'Urban Management';
            preview = 'Bạn có tin nhắn mới';
          }
        }

        debugPrint('[NotificationListener] Showing notification: title=$senderName, preview=$preview, sound=$shouldPlaySound');
        try {
          _notif?.showMessageNotification(
            senderName: senderName,
            conversationId: conversationId,
            preview: preview.isNotEmpty ? preview : 'Tin nhắn mới',
            groupName: displayGroupName,
            playSound: shouldPlaySound,
          );
        } catch (e) {
          debugPrint('[NotificationListener] Error showing message notification: $e');
        }
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

class _ConversationDebounceState {
  int messageCount = 0;
  DateTime windowStart = DateTime.now();
  DateTime lastMessageTime = DateTime.now();
  bool silentMode = false;
}
