import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";
import "package:flutter_riverpod/flutter_riverpod.dart" show ProviderScope;

import "package:firebase_core/firebase_core.dart";
import "package:firebase_messaging/firebase_messaging.dart";
import "package:flutter_dotenv/flutter_dotenv.dart";
import "package:intl/date_symbol_data_local.dart";

import "core/theme/app_theme.dart";
import "services/app_services.dart";
import "state/session_controller.dart";
import "app/app_router.dart";
import "features/chat/widgets/global_call_overlay.dart";
import "services/webrtc_service.dart";
import "models/conversation_summary.dart";
import "features/chat/call_screen.dart";
import "dart:async";

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: ".env");
  await initializeDateFormatting('vi_VN', null);

  try {
    await Firebase.initializeApp();
    await FirebaseMessaging.instance.requestPermission();
  } catch (e) {
    debugPrint("Firebase initialization error: $e");
  }

  final services = AppServices.create();

  // Khởi tạo local notification service và xin quyền
  final notifService = services.localNotificationService;
  await notifService.initialize();
  await notifService.requestPermission();

  runApp(
    ProviderScope(
      child: UrbanManagementApp(services: services),
    ),
  );
}

class UrbanManagementApp extends StatefulWidget {
  const UrbanManagementApp({super.key, required this.services});

  final AppServices services;

  @override
  State<UrbanManagementApp> createState() => _UrbanManagementAppState();
}

class _UrbanManagementAppState extends State<UrbanManagementApp> {
  late final SessionController _session;
  late final GoRouter _router;
  StreamSubscription? _notifTapSub;

  @override
  void initState() {
    super.initState();
    _session = SessionController(appServices: widget.services)..initialize();
    // Router tạo một lần – nó tự refresh khi _session notify (refreshListenable)
    _router = createAppRouter(_session);

    widget.services.webRTCService.callState.addListener(_handleCallStateChange);
    _notifTapSub = widget.services.localNotificationService.onNotificationTap.listen(_handleNotificationTap);
  }

  @override
  void dispose() {
    widget.services.webRTCService.callState.removeListener(_handleCallStateChange);
    _notifTapSub?.cancel();
    _router.dispose();
    _session.dispose();
    super.dispose();
  }

  void _handleCallStateChange() {
    final state = widget.services.webRTCService.callState.value;
    final convId = widget.services.webRTCService.currentConversationId;
    if ((state == CallState.connecting || state == CallState.connected) && convId != null) {
      final isGroup = convId.startsWith("group:") ||
          convId.startsWith("group#") ||
          convId.startsWith("grp#") ||
          convId.startsWith("GRP#");
      final isVideo = !widget.services.webRTCService.isAudioOnly;
      final typeStr = isVideo ? "Video" : "Thoại";
      final title = isGroup ? "Cuộc gọi nhóm đang diễn ra" : "Cuộc gọi $typeStr đang diễn ra";

      widget.services.localNotificationService.showOngoingCallNotification(
        conversationId: convId,
        title: title,
        body: "Chạm để quay lại cuộc gọi",
      );
    } else if (state == CallState.idle) {
      widget.services.localNotificationService.dismissOngoingCallNotification();
    }
  }

  void _handleNotificationTap(String? payload) {
    if (payload == null) return;
    if (payload.startsWith("reenter:")) {
      final convId = payload.substring(8);
      final webRTCService = widget.services.webRTCService;
      final user = _session.user;
      if (webRTCService.callState.value != CallState.idle && user != null) {
        final isGroup = convId.startsWith("group:") ||
            convId.startsWith("group#") ||
            convId.startsWith("grp#") ||
            convId.startsWith("GRP#");

        webRTCService.isCallMinimized.value = false;

        rootNavigatorKey.currentState?.push(
          MaterialPageRoute(
            builder: (_) => CallScreen(
              webRTCService: webRTCService,
              conversation: ConversationSummary(
                conversationId: convId,
                groupName: isGroup ? "Cuộc gọi nhóm" : "Đang gọi",
                unreadCount: 0,
                isGroup: isGroup,
                updatedAt: DateTime.now().toIso8601String(),
              ),
              currentUser: user,
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<AppServices>.value(value: widget.services),
        ChangeNotifierProvider<SessionController>.value(value: _session),
      ],
      child: Consumer<SessionController>(
        builder: (context, session, _) {
          return MaterialApp.router(
            debugShowCheckedModeBanner: false,
            title: "Urban Management",
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            themeMode: session.isDarkMode ? ThemeMode.dark : ThemeMode.light,
            routerConfig: _router,
            builder: (context, child) {
              return Stack(
                children: [
                  if (child != null) child,
                  Positioned.fill(
                    child: GlobalCallOverlay(services: widget.services),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}
