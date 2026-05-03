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
import "../../services/webrtc_service.dart";

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  StreamSubscription? _callInitSub;
  StreamSubscription? _callInviteSub;

  @override
  void initState() {
    super.initState();
    final services = context.read<AppServices>();
    final session = context.read<SessionController>();
    _callInitSub = services.socketService.onCallInit.listen((data) {
      _openIncomingCall(context, services.webRTCService, session.user, data);
    });
    _callInviteSub = services.socketService.onCallInvite.listen((data) {
      _openIncomingCall(context, services.webRTCService, session.user, data);
    });
  }

  @override
  void dispose() {
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
    final isGroup = data["isGroup"] as bool? ?? false;

    final summary = ConversationSummary(
      conversationId: conversationId,
      groupName: callerName,
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
      HomeScreen(),
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
      ReportsScreen(reportService: services.reportService),
      ProfileScreen(
        user: user,
        onRefreshProfile: session.refreshProfile,
        onLogout: session.logout,
      ),
    ];

    return Stack(
      children: [
        Scaffold(
          body: IndexedStack(
            index: _index,
            children: pages,
          ),
          bottomNavigationBar: Container(
            decoration: BoxDecoration(
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 10,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: NavigationBar(
              backgroundColor: Colors.white,
              indicatorColor: const Color(0xFF7C3AED).withOpacity(0.1),
              selectedIndex: _index,
              onDestinationSelected: (value) => setState(() => _index = value),
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
        // Mini PiP (Picture-in-Picture)
        _buildMiniPiP(context, services.webRTCService, session.user),
      ],
    );
  }

  Widget _buildMiniPiP(
      BuildContext context, WebRTCService webRTCService, dynamic user) {
    return ValueListenableBuilder<CallState>(
      valueListenable: webRTCService.callState,
      builder: (context, state, _) {
        // Chỉ hiện PiP nếu đang gọi và KHÔNG phải (Giả lập vì CallScreen đang pop ra)
        // Việc nhận diện chính xác CallScreen có nằm top ở Navigator ko cần RouterObserver
        // Ta tạm che bằng logic: Nếu có call mới hiện Draggable
        if (state == CallState.idle) return const SizedBox.shrink();

        return Positioned(
          top: 100,
          right: 20,
          child: GestureDetector(
            onTap: () {
              // Mở lại CallScreen
              if (webRTCService.currentConversationId != null) {
                // Tạo fake summary để mở lại
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => CallScreen(
                      webRTCService: webRTCService,
                      conversation: ConversationSummary(
                        conversationId: webRTCService.currentConversationId!,
                        groupName: "Đang gọi",
                        unreadCount: 0,
                        isGroup: false,
                        updatedAt: DateTime.now().toIso8601String(),
                      ),
                      currentUser: user,
                    ),
                  ),
                );
              }
            },
            child: Container(
              width: 80,
              height: 120,
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(12),
                boxShadow: const [
                  BoxShadow(color: Colors.black26, blurRadius: 10)
                ],
              ),
              child: const Center(
                child: Icon(Icons.videocam, color: Colors.green, size: 30),
              ),
            ),
          ),
        );
      },
    );
  }
}
