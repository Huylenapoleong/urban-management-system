import 'package:flutter/material.dart';

class AboutAppScreen extends StatelessWidget {
  const AboutAppScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text("Thông tin ứng dụng", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withOpacity(0.1),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(Icons.location_city, size: 50, color: Color(0xFF10B981)),
            ),
            const SizedBox(height: 24),
            const Text(
              "Urban Management",
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
            ),
            const SizedBox(height: 8),
            const Text("Phiên bản 1.0.0", style: TextStyle(color: Color(0xFF64748B), fontSize: 15)),
            const SizedBox(height: 48),
            const Text(
              "Ứng dụng quản lý cư dân và khu đô thị thông minh, mang đến trải nghiệm sống tiện nghi, an toàn và kết nối cho mọi người.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF475569), fontSize: 15, height: 1.6),
            ),
            const SizedBox(height: 48),
            _buildLinkItem(context, "Điều khoản sử dụng"),
            _buildLinkItem(context, "Chính sách bảo mật"),
            _buildLinkItem(context, "Giấy phép nguồn mở"),
            const SizedBox(height: 40),
            const Text("© 2026 Urban Management. All rights reserved.", style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
          ],
        ),
      ),
    );
  }

  Widget _buildLinkItem(BuildContext context, String title) {
    return InkWell(
      onTap: () {
        // Future: navigate to webview or sub screen
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)),
            const Icon(Icons.chevron_right, color: Colors.grey),
          ],
        ),
      ),
    );
  }
}
