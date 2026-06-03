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

  @override
  void initState() {
    super.initState();
    _session = SessionController(appServices: widget.services)..initialize();
    // Router tạo một lần – nó tự refresh khi _session notify (refreshListenable)
    _router = createAppRouter(_session);
  }

  @override
  void dispose() {
    _router.dispose();
    _session.dispose();
    super.dispose();
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
          );
        },
      ),
    );
  }
}
