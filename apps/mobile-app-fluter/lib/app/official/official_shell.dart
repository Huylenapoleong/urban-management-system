import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../features/chat/widgets/call_incoming_listener.dart';
import '../../features/chat/widgets/notification_listener_widget.dart';
import '../../state/session_controller.dart';

/// Bottom-nav shell cho giao diện Official với thiết kế Floating Glassmorphic và bộ điều hướng StatefulNavigationShell.
class OfficialShell extends StatelessWidget {
  const OfficialShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final idx = navigationShell.currentIndex;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    final session = context.watch<SessionController>();
    final unreadCount = session.unreadMessagesCount;

    return NotificationListenerWidget(
      child: CallIncomingListener(
      child: Scaffold(
        extendBody: true, // Cho phép body cuộn bên dưới thanh điều hướng kính mờ
        body: navigationShell,
        bottomNavigationBar: Container(
          margin: EdgeInsets.fromLTRB(
            16, 
            0, 
            16, 
            16 + MediaQuery.of(context).padding.bottom
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: isDark ? Colors.black.withOpacity(0.4) : Colors.black.withOpacity(0.08),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: BackdropFilter(
               filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
              child: Container(
                height: 68,
                padding: const EdgeInsets.symmetric(horizontal: 10),
                decoration: BoxDecoration(
                  color: isDark 
                      ? const Color(0xFF1E293B).withOpacity(0.75) 
                      : Colors.white.withOpacity(0.85),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: isDark 
                        ? Colors.white.withOpacity(0.08) 
                        : Colors.black.withOpacity(0.05),
                    width: 1.5,
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildNavItem(context, 0, Icons.home_outlined, Icons.home, 'Trang chủ', idx, unreadCount),
                    _buildNavItem(context, 1, Icons.assignment_outlined, Icons.assignment, 'Báo cáo', idx, unreadCount),
                    _buildNavItem(context, 2, Icons.chat_bubble_outline, Icons.chat_bubble, 'Tin nhắn', idx, unreadCount),
                    _buildNavItem(context, 3, Icons.person_outline, Icons.person, 'Cá nhân', idx, unreadCount),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    );
  }


  Widget _buildNavItem(
    BuildContext context,
    int index,
    IconData inactiveIcon,
    IconData activeIcon,
    String label,
    int currentIndex,
    int unreadCount,
  ) {
    final isSelected = index == currentIndex;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    final activeColor = isDark ? const Color(0xFF22C55E) : const Color(0xFF15803D);
    final inactiveColor = isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);

    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {
          navigationShell.goBranch(
            index,
            initialLocation: index == navigationShell.currentIndex,
          );
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedScale(
                scale: isSelected ? 1.15 : 1.0,
                duration: const Duration(milliseconds: 200),
                child: index == 2 && unreadCount > 0
                    ? Badge(
                        label: Text(unreadCount > 99 ? "99+" : "$unreadCount"),
                        child: Icon(
                          isSelected ? activeIcon : inactiveIcon,
                          color: isSelected ? activeColor : inactiveColor,
                          size: 24,
                        ),
                      )
                    : Icon(
                        isSelected ? activeIcon : inactiveIcon,
                        color: isSelected ? activeColor : inactiveColor,
                        size: 24,
                      ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? activeColor : inactiveColor,
                  fontSize: 10,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
