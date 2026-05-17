import 'package:flutter/material.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Thông tin ứng dụng'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF1E1B4B),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const SizedBox(height: 40),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF7C3AED).withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.location_city, size: 80, color: Color(0xFF7C3AED)),
            ),
            const SizedBox(height: 24),
            const Text(
              'Urban Management System',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF1E1B4B)),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Phiên bản 1.0.0 (Build 12)',
              style: TextStyle(color: Colors.grey, fontSize: 16),
            ),
            const SizedBox(height: 40),
            _buildInfoRow('Nhà phát triển', 'Nhóm Phát triển CNM'),
            const Divider(height: 32),
            _buildInfoRow('Bản quyền', '© 2026 UMS Team. All rights reserved.'),
            const Divider(height: 32),
            _buildInfoRow('Điều khoản sử dụng', 'Xem chi tiết', isLink: true),
            const Divider(height: 32),
            _buildInfoRow('Chính sách bảo mật', 'Xem chi tiết', isLink: true),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String title, String value, {bool isLink = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: const TextStyle(fontSize: 16, color: Color(0xFF1E1B4B))),
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: isLink ? FontWeight.bold : FontWeight.normal,
            color: isLink ? const Color(0xFF7C3AED) : Colors.grey[700],
          ),
        ),
      ],
    );
  }
}
