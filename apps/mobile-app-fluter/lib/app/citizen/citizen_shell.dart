import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/chat/widgets/call_incoming_listener.dart';
import '../../features/chat/widgets/notification_listener_widget.dart';

/// Bottom-nav shell cho giao diện Citizen với bộ điều hướng StatefulNavigationShell để tối ưu hóa bộ nhớ đệm.
class CitizenShell extends StatelessWidget {
  const CitizenShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final idx = navigationShell.currentIndex;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return NotificationListenerWidget(
      child: CallIncomingListener(
      child: Scaffold(
        body: navigationShell,
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            boxShadow: [
              BoxShadow(
                color: isDark ? Colors.transparent : Colors.black.withOpacity(0.05),
                blurRadius: 10,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: NavigationBar(
            backgroundColor:
                isDark ? const Color(0xFF1E293B) : Colors.white,
            indicatorColor: const Color(0xFF1E88E5).withOpacity(0.12),
            selectedIndex: idx,
            labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
            onDestinationSelected: (i) {
              navigationShell.goBranch(
                i,
                initialLocation: i == navigationShell.currentIndex,
              );
            },
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home, color: Color(0xFF1E88E5)),
                label: 'Trang chủ',
              ),
              NavigationDestination(
                icon: Icon(Icons.chat_bubble_outline),
                selectedIcon: Icon(Icons.chat_bubble, color: Color(0xFF1E88E5)),
                label: 'Tin nhắn',
              ),
              NavigationDestination(
                icon: Icon(Icons.people_outline),
                selectedIcon: Icon(Icons.people, color: Color(0xFF1E88E5)),
                label: 'Bạn bè',
              ),
              NavigationDestination(
                icon: Icon(Icons.description_outlined),
                selectedIcon: Icon(Icons.description, color: Color(0xFF1E88E5)),
                label: 'Báo cáo',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person, color: Color(0xFF1E88E5)),
                label: 'Cá nhân',
              ),
            ],
          ),
        ),
      ),
    ),
    );
  }
}

