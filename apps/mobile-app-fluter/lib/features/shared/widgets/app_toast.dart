import 'package:flutter/material.dart';

enum AppToastType { success, error, warning, info }

class AppToast {
  static void show(
    BuildContext context, {
    required String message,
    String? title,
    AppToastType type = AppToastType.success,
    Duration duration = const Duration(seconds: 3),
  }) {
    final overlayState = Overlay.of(context);
    late OverlayEntry overlayEntry;
    
    // Icon & Color mapping
    IconData iconData;
    Color primaryColor;
    Color accentColor;
    List<Color> gradientColors;

    switch (type) {
      case AppToastType.success:
        iconData = Icons.check_circle_rounded;
        primaryColor = const Color(0xFF10B981); // Emerald
        accentColor = const Color(0xFFD1FAE5);
        gradientColors = [const Color(0xFF0F766E), const Color(0xFF0D9488)]; // Teal gradient
        break;
      case AppToastType.error:
        iconData = Icons.error_rounded;
        primaryColor = const Color(0xFFEF4444); // Red
        accentColor = const Color(0xFFFEE2E2);
        gradientColors = [const Color(0xFFBE123C), const Color(0xFFE11D48)]; // Rose/Red gradient
        break;
      case AppToastType.warning:
        iconData = Icons.warning_rounded;
        primaryColor = const Color(0xFFF59E0B); // Amber
        accentColor = const Color(0xFFFEF3C7);
        gradientColors = [const Color(0xFFB45309), const Color(0xFFD97706)]; // Amber gradient
        break;
      case AppToastType.info:
        iconData = Icons.info_rounded;
        primaryColor = const Color(0xFF3B82F6); // Blue
        accentColor = const Color(0xFFDBEAFE);
        gradientColors = [const Color(0xFF1D4ED8), const Color(0xFF2563EB)]; // Royal Blue gradient
        break;
    }

    final defaultTitle = title ?? _getDefaultTitle(type);

    overlayEntry = OverlayEntry(
      builder: (context) => _ToastWidget(
        message: message,
        title: defaultTitle,
        iconData: iconData,
        primaryColor: primaryColor,
        accentColor: accentColor,
        gradientColors: gradientColors,
        duration: duration,
        onDismiss: () {
          overlayEntry.remove();
        },
      ),
    );

    overlayState.insert(overlayEntry);
  }

  static String _getDefaultTitle(AppToastType type) {
    switch (type) {
      case AppToastType.success:
        return "Thành công";
      case AppToastType.error:
        return "Thất bại";
      case AppToastType.warning:
        return "Cảnh báo";
      case AppToastType.info:
        return "Thông báo";
    }
  }
}

class _ToastWidget extends StatefulWidget {
  final String message;
  final String title;
  final IconData iconData;
  final Color primaryColor;
  final Color accentColor;
  final List<Color> gradientColors;
  final Duration duration;
  final VoidCallback onDismiss;

  const _ToastWidget({
    required this.message,
    required this.title,
    required this.iconData,
    required this.primaryColor,
    required this.accentColor,
    required this.gradientColors,
    required this.duration,
    required this.onDismiss,
  });

  @override
  State<_ToastWidget> createState() => _ToastWidgetState();
}

class _ToastWidgetState extends State<_ToastWidget> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _yAnimation;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );

    _yAnimation = Tween<double>(begin: -120, end: 0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
    );

    _fadeAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeIn),
    );

    _controller.forward();

    Future.delayed(widget.duration, () {
      if (mounted) {
        _controller.reverse().then((_) => widget.onDismiss());
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top + 16;

    return Positioned(
      top: topPadding,
      left: 16,
      right: 16,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Transform.translate(
            offset: Offset(0, _yAnimation.value),
            child: Opacity(
              opacity: _fadeAnimation.value,
              child: child,
            ),
          );
        },
        child: Material(
          color: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: widget.gradientColors,
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: widget.primaryColor.withOpacity(0.35),
                  blurRadius: 24,
                  offset: const Offset(0, 10),
                )
              ],
              border: Border.all(
                color: Colors.white.withOpacity(0.2),
                width: 1.5,
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.18),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    widget.iconData,
                    color: Colors.white,
                    size: 26,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        widget.message,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.9),
                          fontSize: 13.5,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () {
                    _controller.reverse().then((_) => widget.onDismiss());
                  },
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.close_rounded,
                      color: Colors.white.withOpacity(0.7),
                      size: 18,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
