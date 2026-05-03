import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class OfficialLayout extends StatelessWidget {
  final Widget child;

  const OfficialLayout({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    // Current route location to calculate selected index
    final String location = GoRouterState.of(context).uri.path;
    int currentIndex = _calculateSelectedIndex(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (index) {
          switch (index) {
            case 0:
              context.go('/official/reports');
              break;
            case 1:
              context.go('/official/chats');
              break;
            case 2:
              context.go('/official/profile');
              break;
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'Báo cáo',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Tin nhắn',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Cá nhân',
          ),
        ],
      ),
    );
  }

  int _calculateSelectedIndex(String location) {
    if (location.startsWith('/official/reports')) return 0;
    if (location.startsWith('/official/chats')) return 1;
    if (location.startsWith('/official/profile')) return 2;
    return 1; // Default is chats for official based on initial config
  }
}
