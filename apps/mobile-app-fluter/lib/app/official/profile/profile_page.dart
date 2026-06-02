import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../services/app_services.dart';
import '../../../state/session_controller.dart';
import '../../../features/profile/profile_screen.dart';

/// Official profile page — đọc user từ SessionController
/// và delegate cho ProfileScreen có sẵn.
class OfficialProfilePage extends StatelessWidget {
  const OfficialProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final services = context.read<AppServices>();
    final user = session.user;

    if (user == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return ProfileScreen(
      user: user,
      userService: services.userService,
      uploadService: services.uploadService,
      onRefreshProfile: session.refreshProfile,
      onLogout: session.logout,
    );
  }
}
