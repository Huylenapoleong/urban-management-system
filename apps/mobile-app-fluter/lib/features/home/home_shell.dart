import "dart:async";
import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../../services/app_services.dart";
import "../../state/session_controller.dart";
import "../../core/theme/app_theme.dart";
import "../chat/chat_workspace_screen.dart";
import "../contacts/contacts_screen.dart";
import "../notifications/notifications_screen.dart";
import "../profile/profile_screen.dart";
import "../reports/reports_screen.dart";
import "home_screen.dart";
import "../../models/conversation_summary.dart";
import "../chat/call_screen.dart";
import "../chat/widgets/floating_call_overlay.dart";
import "../../services/webrtc_service.dart";
import "../shared/widgets/app_toast.dart";

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  bool _wasInCall = false;
  late WebRTCService _webRTCService;
  VoidCallback? _callStateListener;

  void _setIndex(int index) {
    setState(() {
      _index = index;
    });
  }
  StreamSubscription? _callInitSub;
  StreamSubscription? _callInviteSub;

  @override
  void initState() {
    super.initState();
    final services = context.read<AppServices>();
    final session = context.read<SessionController>();
    _webRTCService = services.webRTCService;
    _wasInCall = _webRTCService.callState.value != CallState.idle;
    _callStateListener = () {
      final isInCall = _webRTCService.callState.value != CallState.idle;
      if (_wasInCall && !isInCall && mounted) {
        AppToast.show(
          context,
          message: "Cuoc goi da ket thuc",
          type: AppToastType.info,
        );
      }
      _wasInCall = isInCall;
    };
    _webRTCService.callState.addListener(_callStateListener!);
    _callInitSub = services.socketService.onCallInit.listen((data) {
      _openIncomingCall(context, services.webRTCService, session.user, data);
    });
    _callInviteSub = services.socketService.onCallInvite.listen((data) {
      _openIncomingCall(context, services.webRTCService, session.user, data);
    });
  }

  @override
  void dispose() {
    if (_callStateListener != null) {
      _webRTCService.callState.removeListener(_callStateListener!);
    }
    _callInitSub?.cancel();
    _callInviteSub?.cancel();
    super.dispose();
  }

  void _openIncomingCall(
    BuildContext context,
    WebRTCService webRTCService,
    dynamic currentUser,
    Map<String, dynamic> data,
  ) {
    if (!mounted) return;

    final conversationId = data["conversationId"] as String? ?? "";
    final callerName = data["callerName"] as String? ?? "Người dùng";
    final callerAvatarUrl = data["callerAvatarUrl"] as String?;

    final isGroup = data["isGroup"] as bool? ??
        conversationId.startsWith("group:") ||
        conversationId.startsWith("group#") ||
        conversationId.startsWith("grp#") ||
        conversationId.startsWith("GRP#");

    final summary = ConversationSummary(
      conversationId: conversationId,
      groupName: isGroup ? "Cuộc gọi nhóm" : callerName,
      unreadCount: 0,
      isGroup: isGroup,
      updatedAt: DateTime.now().toIso8601String(),
      peerAvatarUrl: callerAvatarUrl,
      groupAvatarUrl: callerAvatarUrl,
    );

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CallScreen(
          webRTCService: webRTCService,
          conversation: summary,
          currentUser: currentUser,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final services = context.read<AppServices>();
    final session = context.watch<SessionController>();
    final user = session.user;

    if (user == null) {
      return const Scaffold(body: SizedBox.shrink());
    }

    final pages = <Widget>[
      const HomeScreen(),
      ChatWorkspaceScreen(
        conversationService: services.conversationService,
        uploadService: services.uploadService,
        socketService: services.socketService,
        userService: services.userService,
        groupService: services.groupService,
        webRTCService: services.webRTCService,
        currentUser: user,
      ),
      const ContactsScreen(),
      ReportsScreen(
        reportService: services.reportService,
        uploadService: services.uploadService,
      ),
      ProfileScreen(
        user: user,
        userService: services.userService,
        uploadService: services.uploadService,
        onRefreshProfile: session.refreshProfile,
        onLogout: session.logout,
      ),
    ];

    return Stack(
      children: [
        NotificationListener<HomeNavigationNotification>(
          onNotification: (notification) {
            _setIndex(notification.index);
            return true;
          },
          child: Scaffold(
            body: IndexedStack(
              index: _index,
              children: pages,
            ),
            bottomNavigationBar: Container(
              decoration: BoxDecoration(
                boxShadow: [
                  BoxShadow(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.transparent
                        : Colors.black.withOpacity(0.05),
                    blurRadius: 10,
                    offset: const Offset(0, -2),
                  ),
                ],
              ),
              child: NavigationBar(
                backgroundColor: Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xFF1E293B)
                    : Colors.white,
                indicatorColor: const Color(0xFF7C3AED).withOpacity(0.1),
                selectedIndex: _index,
                onDestinationSelected: (value) => setState(() => _index = value),
                labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.home_outlined),
                    selectedIcon: Icon(Icons.home, color: Color(0xFF7C3AED)),
                    label: "Trang chủ",
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.chat_bubble_outline),
                    selectedIcon:
                        Icon(Icons.chat_bubble, color: Color(0xFF7C3AED)),
                    label: "Tin nhắn",
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.people_outline),
                    selectedIcon: Icon(Icons.people, color: Color(0xFF7C3AED)),
                    label: "Bạn bè",
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.description_outlined),
                    selectedIcon:
                        Icon(Icons.description, color: Color(0xFF7C3AED)),
                    label: "Báo cáo",
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.person_outline),
                    selectedIcon: Icon(Icons.person, color: Color(0xFF7C3AED)),
                    label: "Cá nhân",
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class HomeNavigationNotification extends Notification {
  final int index;
  HomeNavigationNotification(this.index);
}
