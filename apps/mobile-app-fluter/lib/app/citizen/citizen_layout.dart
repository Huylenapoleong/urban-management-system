import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class CitizenLayout extends StatelessWidget {
  final Widget child;

  const CitizenLayout({super.key, required this.child});

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
              context.go('/citizen/home');
              break;
            case 1:
              context.go('/citizen/chats');
              break;
            case 2:
              context.go('/citizen/contacts');
              break;
            case 3:
              context.go('/citizen/reports');
              break;
            case 4:
              context.go('/citizen/profile');
              break;
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Trang chủ',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Tin nhắn',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Bạn bè',
          ),
          NavigationDestination(
            icon: Icon(Icons.description_outlined),
            selectedIcon: Icon(Icons.description),
            label: 'Báo cáo',
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
    if (location.startsWith('/citizen/home')) return 0;
    if (location.startsWith('/citizen/chats')) return 1;
    if (location.startsWith('/citizen/contacts')) return 2;
    if (location.startsWith('/citizen/reports')) return 3;
    if (location.startsWith('/citizen/profile')) return 4;
    return 0; // Default
  }
}
