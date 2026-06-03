import "dart:io";
import "package:firebase_messaging/firebase_messaging.dart";
import "package:flutter/foundation.dart";
import "package:shared_preferences/shared_preferences.dart";
import "user_service.dart";

class PushNotificationService {
  final UserService _userService;

  PushNotificationService({required UserService userService})
      : _userService = userService;

  /// Khởi tạo và đăng ký token FCM với backend
  Future<void> initializeAndRegister() async {
    try {
      final messaging = FirebaseMessaging.instance;

      // 1. Yêu cầu quyền thông báo từ người dùng
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint("[PushNotification] Quyền thông báo bị từ chối.");
        return;
      }

      // 2. Lấy token FCM thiết bị
      final token = await messaging.getToken();
      if (token == null || token.isEmpty) {
        debugPrint("[PushNotification] Token FCM trống hoặc null.");
        return;
      }

      debugPrint("[PushNotification] Token FCM: $token");

      // 3. Lấy hoặc tạo ngẫu nhiên một deviceId duy nhất cho thiết bị
      final prefs = await SharedPreferences.getInstance();
      String? deviceId = prefs.getString("push_device_id");
      if (deviceId == null) {
        final timestamp = DateTime.now().millisecondsSinceEpoch;
        deviceId = "device_flutter_$timestamp";
        await prefs.setString("push_device_id", deviceId);
      }

      // 4. Xác định hệ điều hành (platform)
      String platform = "web";
      if (!kIsWeb) {
        if (Platform.isAndroid) {
          platform = "android";
        } else if (Platform.isIOS) {
          platform = "ios";
        }
      }

      // 5. Đăng ký thông tin thiết bị với backend
      final payload = {
        "deviceId": deviceId,
        "provider": "FCM",
        "platform": platform,
        "pushToken": token,
        "appVariant": "mobile-app-fluter",
      };

      debugPrint("[PushNotification] Đăng ký thiết bị với payload: $payload");
      await _userService.registerPushDevice(payload);
      debugPrint("[PushNotification] Đăng ký thiết bị thành công.");

      // 6. Lắng nghe sự kiện khi token được cập nhật/làm mới
      messaging.onTokenRefresh.listen((newToken) async {
        debugPrint("[PushNotification] Cập nhật token FCM mới: $newToken");
        final updatedPayload = {
          "deviceId": deviceId!,
          "provider": "FCM",
          "platform": platform,
          "pushToken": newToken,
          "appVariant": "mobile-app-fluter",
        };
        try {
          await _userService.registerPushDevice(updatedPayload);
        } catch (e) {
          debugPrint("[PushNotification] Lỗi tự động cập nhật token FCM: $e");
        }
      });

      // Lắng nghe thông báo ở chế độ foreground (tùy chọn hiển thị log hoặc in-app alert)
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint("[PushNotification] Nhận thông báo ở chế độ foreground: ${message.notification?.title} | ${message.notification?.body}");
      });

    } catch (e) {
      debugPrint("[PushNotification] Lỗi thiết lập Push Notification: $e");
    }
  }

  /// Hủy đăng ký thiết bị khi người dùng đăng xuất
  Future<void> unregisterDevice() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final deviceId = prefs.getString("push_device_id");
      if (deviceId != null) {
        debugPrint("[PushNotification] Đang hủy đăng ký thiết bị: $deviceId");
        await _userService.deletePushDevice(deviceId);
      }
    } catch (e) {
      debugPrint("[PushNotification] Lỗi hủy đăng ký thiết bị: $e");
    }
  }
}
