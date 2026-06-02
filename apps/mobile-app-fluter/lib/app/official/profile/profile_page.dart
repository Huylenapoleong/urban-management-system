import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../state/auth_controller.dart';

class OfficialProfilePage extends ConsumerWidget {
  const OfficialProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cá nhân'),
      ),
      body: Center(
        child: FilledButton(
          onPressed: () {
            ref.read(authControllerProvider.notifier).logout();
          },
          child: const Text('Đăng xuất (Official)'),
        ),
      ),
    );
  }
}
