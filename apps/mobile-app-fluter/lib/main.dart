import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "package:firebase_core/firebase_core.dart";
import "package:firebase_messaging/firebase_messaging.dart";

import "core/theme/app_theme.dart";
import "features/auth/login_screen.dart";
import "features/home/home_shell.dart";
import "services/app_services.dart";
import "state/session_controller.dart";

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    await Firebase.initializeApp();
    await FirebaseMessaging.instance.requestPermission();
  } catch (e) {
    debugPrint("Firebase initialization error: $e");
  }

  final services = AppServices.create();
  runApp(UrbanManagementApp(services: services));
}

class UrbanManagementApp extends StatelessWidget {
  const UrbanManagementApp({super.key, required this.services});

  final AppServices services;

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
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: "Urban Management",
        theme: AppTheme.light(),
        home: Consumer<SessionController>(
          builder: (context, session, _) {
            if (!session.isInitialized) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            if (!session.isAuthenticated) {
              return const LoginScreen();
            }
            return const HomeShell();
          },
        ),
      ),
    );
  }
}
