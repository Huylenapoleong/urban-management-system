import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "package:flutter_riverpod/flutter_riverpod.dart" show ProviderScope;

import "package:firebase_core/firebase_core.dart";
import "package:firebase_messaging/firebase_messaging.dart";
import "package:flutter_dotenv/flutter_dotenv.dart";

import "core/theme/app_theme.dart";
import "features/auth/login_screen.dart";
import "features/home/home_shell.dart";
import "services/app_services.dart";
import "state/session_controller.dart";
import "features/chat/widgets/global_call_overlay.dart";

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: ".env");
  
  try {
    await Firebase.initializeApp();
    await FirebaseMessaging.instance.requestPermission();
  } catch (e) {
    debugPrint("Firebase initialization error: $e");
  }

  final services = AppServices.create();
  runApp(
    ProviderScope(
      child: UrbanManagementApp(services: services),
    ),
  );
}

class UrbanManagementApp extends StatelessWidget {
  const UrbanManagementApp({super.key, required this.services});

  final AppServices services;
  static final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<AppServices>.value(value: services),
        ChangeNotifierProvider<SessionController>(
          create: (_) =>
              SessionController(appServices: services)..initialize(),
        ),
      ],
      child: Consumer<SessionController>(
        builder: (context, session, _) {
          return MaterialApp(
            navigatorKey: UrbanManagementApp.navigatorKey,
            debugShowCheckedModeBanner: false,
            title: "Urban Management",
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            themeMode: session.isDarkMode ? ThemeMode.dark : ThemeMode.light,
            home: !session.isInitialized
                ? const Scaffold(
                    body: Center(child: CircularProgressIndicator()),
                  )
                : (!session.isAuthenticated ? const LoginScreen() : const HomeShell()),
            builder: (context, child) {
              return Stack(
                children: [
                  if (child != null) child,
                  GlobalCallOverlay(services: services),
                ],
              );
            },
          );
        },
      ),
    );
  }
}
