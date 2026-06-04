import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';

/// Service hiển thị thông báo đẩy cục bộ (local push notifications).
/// Hỗ trợ 3 loại thông báo:
///  - [showMessageNotification] — Tin nhắn mới
///  - [showCallNotification]    — Cuộc gọi đến
///  - [showReportNotification]  — Báo cáo mới / cập nhật trạng thái
class LocalNotificationService {
  static final LocalNotificationService _instance =
      LocalNotificationService._internal();
  factory LocalNotificationService() => _instance;
  LocalNotificationService._internal();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  // Stream để app có thể phản ứng khi user nhấn vào notification
  final _onTapController = StreamController<String?>.broadcast();
  Stream<String?> get onNotificationTap => _onTapController.stream;

  // Channel IDs
  static const _channelMessage = 'chat_messages';
  static const _channelCall = 'incoming_calls';
  static const _channelReport = 'reports';

  // Notification IDs
  static const _idCall = 9001;
  static const _idReport = 9002;
  int _messageIdCounter = 1;

  Future<void> initialize() async {
    if (_initialized) return;

    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    await _plugin.initialize(
      const InitializationSettings(
        android: androidSettings,
        iOS: iosSettings,
      ),
      onDidReceiveNotificationResponse: (details) {
        _onTapController.add(details.payload);
      },
    );

    // Tạo các notification channels trên Android
    await _createChannels();

    _initialized = true;
    debugPrint('[LocalNotification] Initialized');
  }

  Future<void> _createChannels() async {
    final androidPlugin = AndroidFlutterLocalNotificationsPlugin();

    // Channel cho tin nhắn
    await androidPlugin.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelMessage,
        'Tin nhắn',
        description: 'Thông báo tin nhắn mới',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      ),
    );

    // Channel cho cuộc gọi đến — độ ưu tiên cao nhất
    await androidPlugin.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelCall,
        'Cuộc gọi đến',
        description: 'Thông báo cuộc gọi video/thoại đến',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
      ),
    );

    // Channel cho báo cáo
    await androidPlugin.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelReport,
        'Báo cáo',
        description: 'Thông báo cập nhật báo cáo',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      ),
    );
  }

  /// Yêu cầu quyền thông báo (Android 13+).
  Future<bool> requestPermission() async {
    try {
      final status = await Permission.notification.request();
      return status.isGranted;
    } catch (e) {
      debugPrint('[LocalNotification] Permission request error: $e');
      return false;
    }
  }

  /// Hiển thị thông báo tin nhắn mới.
  /// [senderId] — ID người gửi (dùng làm nhóm notification)
  /// [senderName] — Tên người gửi
  /// [conversationId] — ID cuộc trò chuyện (payload để điều hướng)
  /// [preview] — Nội dung tin nhắn rút gọn
  Future<void> showMessageNotification({
    required String senderName,
    required String conversationId,
    required String preview,
    String? groupName,
    bool playSound = true,
  }) async {
    if (!_initialized) await initialize();

    final title = groupName != null ? '$groupName • $senderName' : senderName;
    final id = _messageIdCounter++;
    if (_messageIdCounter > 8999) _messageIdCounter = 1;

    await _plugin.show(
      id,
      title,
      preview,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelMessage,
          'Tin nhắn',
          channelDescription: 'Thông báo tin nhắn mới',
          importance: playSound ? Importance.high : Importance.low,
          priority: playSound ? Priority.high : Priority.low,
          icon: '@mipmap/ic_launcher',
          groupKey: conversationId,
          setAsGroupSummary: false,
          styleInformation: BigTextStyleInformation(preview),
          ticker: title,
          playSound: playSound,
          enableVibration: playSound,
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: playSound,
        ),
      ),
      payload: 'chat:$conversationId',
    );
  }

  /// Hiển thị thông báo cuộc gọi đến.
  Future<void> showCallNotification({
    required String callerName,
    required String conversationId,
    bool isVideo = true,
  }) async {
    if (!_initialized) await initialize();

    final callType = isVideo ? '📹 Cuộc gọi video' : '📞 Cuộc gọi thoại';

    await _plugin.show(
      _idCall,
      '$callType đến',
      '$callerName đang gọi cho bạn...',
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelCall,
          'Cuộc gọi đến',
          channelDescription: 'Thông báo cuộc gọi video/thoại đến',
          importance: Importance.max,
          priority: Priority.max,
          icon: '@mipmap/ic_launcher',
          fullScreenIntent: true, // Hiển thị ngay cả khi màn hình tắt
          ongoing: true,          // Không thể swipe away
          autoCancel: false,
          ticker: '$callerName đang gọi',
          category: AndroidNotificationCategory.call,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: false,
          presentSound: true,
          interruptionLevel: InterruptionLevel.timeSensitive,
        ),
      ),
      payload: 'call:$conversationId',
    );
  }

  /// Ẩn thông báo cuộc gọi (khi cuộc gọi kết thúc/được chấp nhận).
  Future<void> dismissCallNotification() async {
    await _plugin.cancel(_idCall);
  }

  /// Hiển thị thông báo báo cáo mới hoặc cập nhật trạng thái.
  Future<void> showReportNotification({
    required String title,
    required String body,
    String? reportId,
  }) async {
    if (!_initialized) await initialize();

    await _plugin.show(
      _idReport,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelReport,
          'Báo cáo',
          channelDescription: 'Thông báo cập nhật báo cáo',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: reportId != null ? 'report:$reportId' : null,
    );
  }

  void dispose() {
    _onTapController.close();
  }
}
