import 'package:flutter/material.dart';

class CitizenHomePage extends StatelessWidget {
  const CitizenHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Trang chủ'),
        centerTitle: false,
      ),
      body: const Center(
        child: Text('Giao diện Trang chủ Citizen đang phát triển'),
      ),
    );
  }
}
