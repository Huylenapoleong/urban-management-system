import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'app/auth/login_page.dart';
import 'core/theme/app_theme.dart';
import 'app/citizen/chat/chat_detail_page.dart';
import 'app/citizen/chat/conversation_list_page.dart';
import 'app/citizen/home/home_page.dart';
import 'app/citizen/profile/profile_page.dart';
import 'app/citizen/citizen_layout.dart';
import 'app/official/chat/chat_detail_page.dart';
import 'app/official/chat/conversation_list_page.dart';
import 'app/official/reports/reports_page.dart';
import 'app/official/profile/profile_page.dart';
import 'app/official/official_layout.dart';
import 'state/auth_controller.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);
  String homeByRole(bool isOfficial) => isOfficial ? '/official/chats' : '/citizen/chats';

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/login',
    redirect: (context, state) {
      final isLoggedIn = auth.user != null;
      final isLogin = state.uri.path == '/login';
      final targetHome = homeByRole(auth.user?.isOfficial ?? false);

      if (!isLoggedIn && !isLogin) return '/login';
      if (isLoggedIn && isLogin) return targetHome;

      if (isLoggedIn && state.uri.path == '/') {
        return targetHome;
      }

      if (isLoggedIn && state.uri.path == '/chats') {
        return targetHome;
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const AppLoginPage(),
      ),
      // OFFICIAL ROUTES
      ShellRoute(
        builder: (context, state, child) => OfficialLayout(child: child),
        routes: [
          GoRoute(
            path: '/official/reports',
            builder: (context, state) => const OfficialReportsPage(),
          ),
          GoRoute(
            path: '/official/chats',
            builder: (context, state) => const OfficialConversationListPage(),
          ),
          GoRoute(
            path: '/official/profile',
            builder: (context, state) => const OfficialProfilePage(),
          ),
        ],
      ),
      GoRoute(
        path: '/official/chats/:id',
        parentNavigatorKey: rootNavigatorKey, // full screen map
        builder: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          final name = state.uri.queryParameters['name'] ?? 'Conversation';
          return OfficialChatDetailPage(
            conversationId: id,
            title: name,
          );
        },
      ),
      // CITIZEN ROUTES
      ShellRoute(
        builder: (context, state, child) => CitizenLayout(child: child),
        routes: [
          GoRoute(
            path: '/citizen/home',
            builder: (context, state) => const CitizenHomePage(),
          ),
          GoRoute(
            path: '/citizen/chats',
            builder: (context, state) => const CitizenConversationListPage(),
          ),
          GoRoute(
            path: '/citizen/profile',
            builder: (context, state) => const CitizenProfilePage(),
          ),
        ],
      ),
      GoRoute(
        path: '/citizen/chats/:id',
        parentNavigatorKey: rootNavigatorKey, // full screen map
        builder: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          final name = state.uri.queryParameters['name'] ?? 'Conversation';
          return CitizenChatDetailPage(
            conversationId: id,
            title: name,
          );
        },
      ),
    ],
  );
});

class UmsFlutterApp extends ConsumerWidget {
  const UmsFlutterApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'UMS Flutter',
      theme: AppTheme.light(),
      routerConfig: router,
    );
  }
}
