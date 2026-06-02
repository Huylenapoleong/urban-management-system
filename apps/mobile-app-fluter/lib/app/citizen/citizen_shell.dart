import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Bottom-nav shell cho giao diện Citizen.
/// GoRouter's ShellRoute sẽ inject [child] là nội dung của route đang active.
class CitizenShell extends StatelessWidget {
  const CitizenShell({super.key, required this.child});

  final Widget child;

  static int _selectedIndex(String location) {
    if (location.startsWith('/citizen/chats')) return 1;
    if (location.startsWith('/citizen/contacts')) return 2;
    if (location.startsWith('/citizen/reports')) return 3;
    if (location.startsWith('/citizen/profile')) return 4;
    return 0; // /citizen/home
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final idx = _selectedIndex(location);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: child,
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
            switch (i) {
              case 0:
                context.go('/citizen/home');
              case 1:
                context.go('/citizen/chats');
              case 2:
                context.go('/citizen/contacts');
              case 3:
                context.go('/citizen/reports');
              case 4:
                context.go('/citizen/profile');
            }
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
    );
  }
}
