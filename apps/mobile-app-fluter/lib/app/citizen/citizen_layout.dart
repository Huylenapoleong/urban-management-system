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
    if (location.startsWith('/citizen/profile')) return 2;
    return 0; // Default
  }
}
