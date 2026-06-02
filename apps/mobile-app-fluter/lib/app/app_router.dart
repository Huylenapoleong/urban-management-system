import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../state/session_controller.dart';

// ── Auth ─────────────────────────────────────────────────────────────────────
import '../features/auth/login_screen.dart';

// ── Citizen ──────────────────────────────────────────────────────────────────
import 'citizen/citizen_shell.dart';
import 'citizen/home/home_page.dart';
import 'citizen/profile/profile_page.dart';

// ── Official ──────────────────────────────────────────────────────────────────
import 'official/official_shell.dart';
import 'official/home/home_page.dart';
import 'official/reports/reports_page.dart';
import 'official/profile/profile_page.dart';

// ── Features Chat ─────────────────────────────────────────────────────────────
import 'package:provider/provider.dart';
import '../features/chat/chat_workspace_screen.dart';
import '../features/chat/chat_detail_screen.dart';
import '../models/conversation_summary.dart';
import '../services/app_services.dart';
import '../features/contacts/contacts_screen.dart';
import '../features/reports/reports_screen.dart';
import '../services/location_service.dart';

// ─── Role helpers ─────────────────────────────────────────────────────────────
const _officialRoles = {
  'ADMIN',
  'PROVINCE_OFFICER',
  'WARD_OFFICER',
  'OFFICER',
};

bool _isOfficial(String? role) =>
    role != null && _officialRoles.contains(role.toUpperCase());

// ─── Router factory ───────────────────────────────────────────────────────────
/// Tạo GoRouter instance.
/// [session] dùng làm refreshListenable để router rebuild khi auth thay đổi.
GoRouter createAppRouter(SessionController session) {
  return GoRouter(
    initialLocation: '/citizen/home',
    refreshListenable: session, // SessionController extends ChangeNotifier
    redirect: (context, state) {
      final isInit = session.isInitialized;
      final isAuth = session.isAuthenticated;
      final role = session.user?.role;
      final location = state.uri.path;

      // Đang khởi tạo → không redirect
      if (!isInit) return null;

      // ── Tự động sửa lỗi chính tả và làm sạch đường dẫn thừa ────────────────────
      // Sửa lỗi gõ /offical (thiếu chữ i) -> /official
      if (location.startsWith('/offical')) {
        final corrected = location.replaceAll('/offical', '/official');
        if (corrected.endsWith('/Home')) return corrected.replaceAll('/Home', '');
        if (corrected.endsWith('/home')) return corrected.replaceAll('/home', '');
        return corrected;
      }

      // Sửa lỗi lặp hậu tố /Home hoặc /home ở cuối đường dẫn của cán bộ
      if (location.startsWith('/official/home') && location.endsWith('/Home')) {
        return '/official/home';
      }
      if (location.startsWith('/official/home') && location.endsWith('/home')) {
        return '/official/home';
      }
      // ─────────────────────────────────────────────────────────────────────────

      // Chưa đăng nhập → về login
      if (!isAuth) {
        if (location == '/login') return null;
        return '/login';
      }

      // Đã đăng nhập, đang ở login → về đúng home theo role
      if (location == '/login') {
        return _isOfficial(role) ? '/official/home' : '/citizen/home';
      }

      // Official vào citizen route → redirect về official
      if (_isOfficial(role) && location.startsWith('/citizen')) {
        return '/official/home';
      }

      // Citizen vào official route → redirect về citizen
      if (!_isOfficial(role) && location.startsWith('/official')) {
        return '/citizen/home';
      }

      return null; // không redirect
    },
    routes: [
      // ── Login ─────────────────────────────────────────────────────────────
      GoRoute(
        path: '/login',
        pageBuilder: (_, __) => const NoTransitionPage(
          child: LoginScreen(),
        ),
      ),

      // ── Citizen ShellRoute ─────────────────────────────────────────────────
      ShellRoute(
        builder: (_, __, child) => CitizenShell(child: child),
        routes: [
          GoRoute(
            path: '/citizen/home',
            pageBuilder: (_, __) => const NoTransitionPage(
              child: CitizenHomePage(),
            ),
          ),
          GoRoute(
            path: '/citizen/chats',
            pageBuilder: (context, __) {
              final services = context.read<AppServices>();
              return NoTransitionPage(
                child: ChatWorkspaceScreen(
                  conversationService: services.conversationService,
                  uploadService: services.uploadService,
                  socketService: services.socketService,
                  userService: services.userService,
                  groupService: services.groupService,
                  webRTCService: services.webRTCService,
                  currentUser: session.user,
                ),
              );
            },
            routes: [
              GoRoute(
                path: ':conversationId',
                builder: (context, state) {
                  final id = Uri.decodeComponent(
                      state.pathParameters['conversationId'] ?? '');
                  final name = Uri.decodeComponent(
                      state.uri.queryParameters['name'] ?? '');
                  final services = context.read<AppServices>();
                  return ChatDetailScreen(
                    conversation: ConversationSummary(
                      conversationId: id,
                      groupName: name,
                      unreadCount: 0,
                      isGroup: id.startsWith("group:") || id.startsWith("GRP#"),
                      updatedAt: DateTime.now().toIso8601String(),
                    ),
                    conversationService: services.conversationService,
                    uploadService: services.uploadService,
                    socketService: services.socketService,
                    userService: services.userService,
                    groupService: services.groupService,
                    webRTCService: services.webRTCService,
                    currentUser: session.user,
                  );
                },
              ),
            ],
          ),
          GoRoute(
            path: '/citizen/contacts',
            pageBuilder: (_, __) => const NoTransitionPage(
              child: ContactsScreen(),
            ),
          ),
          GoRoute(
            path: '/citizen/reports',
            pageBuilder: (context, __) {
              final services = context.read<AppServices>();
              return NoTransitionPage(
                child: ReportsScreen(
                  reportService: services.reportService,
                  uploadService: services.uploadService,
                  locationService: LocationService(apiClient: services.apiClient),
                ),
              );
            },
          ),
          GoRoute(
            path: '/citizen/profile',
            pageBuilder: (_, __) => const NoTransitionPage(
              child: _CitizenProfileRoute(),
            ),
          ),
        ],
      ),

      // ── Official ShellRoute ─────────────────────────────────────────────────
      ShellRoute(
        builder: (_, __, child) => OfficialShell(child: child),
        routes: [
          GoRoute(
            path: '/official/home',
            pageBuilder: (_, __) => const NoTransitionPage(
              child: OfficialHomePage(),
            ),
          ),
          GoRoute(
            path: '/official/reports',
            pageBuilder: (_, __) => const NoTransitionPage(
              child: OfficialReportsPage(),
            ),
          ),
          GoRoute(
            path: '/official/chats',
            pageBuilder: (context, __) {
              final services = context.read<AppServices>();
              return NoTransitionPage(
                child: ChatWorkspaceScreen(
                  conversationService: services.conversationService,
                  uploadService: services.uploadService,
                  socketService: services.socketService,
                  userService: services.userService,
                  groupService: services.groupService,
                  webRTCService: services.webRTCService,
                  currentUser: session.user,
                ),
              );
            },
            routes: [
              GoRoute(
                path: ':conversationId',
                builder: (context, state) {
                  final id = Uri.decodeComponent(
                      state.pathParameters['conversationId'] ?? '');
                  final name = Uri.decodeComponent(
                      state.uri.queryParameters['name'] ?? '');
                  final services = context.read<AppServices>();
                  return ChatDetailScreen(
                    conversation: ConversationSummary(
                      conversationId: id,
                      groupName: name,
                      unreadCount: 0,
                      isGroup: id.startsWith("group:") || id.startsWith("GRP#"),
                      updatedAt: DateTime.now().toIso8601String(),
                    ),
                    conversationService: services.conversationService,
                    uploadService: services.uploadService,
                    socketService: services.socketService,
                    userService: services.userService,
                    groupService: services.groupService,
                    webRTCService: services.webRTCService,
                    currentUser: session.user,
                  );
                },
              ),
            ],
          ),
          GoRoute(
            path: '/official/contacts',
            pageBuilder: (_, __) => const NoTransitionPage(
              child: ContactsScreen(),
            ),
          ),
          GoRoute(
            path: '/official/profile',
            pageBuilder: (_, __) => const NoTransitionPage(
              child: OfficialProfilePage(),
            ),
          ),
        ],
      ),
    ],
  );
}

// ─── Citizen profile page (wrapper tự đọc session context) ────────────────────
/// ProfileScreen yêu cầu user object từ SessionController.
/// Widget này tự đọc từ context để tránh phải truyền qua GoRouter state.
class _CitizenProfileRoute extends StatelessWidget {
  const _CitizenProfileRoute();

  @override
  Widget build(BuildContext context) {
    return const CitizenProfilePage();
  }
}
