import 'package:flutter/material.dart';
import '../../home/home_shell.dart';

class AppLogoButton extends StatelessWidget {
  final double size;
  final EdgeInsets padding;

  const AppLogoButton({
    super.key, 
    this.size = 28,
    this.padding = const EdgeInsets.only(left: 16.0),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Center(
        child: InkWell(
          onTap: () {
            HomeNavigationNotification(0).dispatch(context);
          },
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: const Color(0xFF10B981).withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Image.asset(
              'assets/images/app_logo.png',
              width: size,
              height: size,
              fit: BoxFit.contain,
            ),
          ),
        ),
      ),
    );
  }
}
