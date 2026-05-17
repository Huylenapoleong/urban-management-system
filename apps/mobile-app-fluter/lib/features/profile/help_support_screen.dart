import 'package:flutter/material.dart';

class HelpSupportScreen extends StatelessWidget {
  const HelpSupportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text("Hỗ trợ & Trợ giúp", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildContactCard(),
          const SizedBox(height: 32),
          const Text("Câu hỏi thường gặp", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          _buildFaqItem("Làm sao để tôi đổi số điện thoại?", "Bạn có thể vào mục Cài đặt tài khoản -> Chỉnh sửa thông tin, sau đó nhập số điện thoại mới và lưu lại."),
          _buildFaqItem("Tôi quên mật khẩu phải làm sao?", "Ở màn hình đăng nhập, hãy chọn 'Quên mật khẩu' để nhận mã xác thực OTP qua Email hoặc Số điện thoại."),
          _buildFaqItem("Báo cáo sự cố môi trường như thế nào?", "Tại màn hình chính, chọn tính năng 'Gửi báo cáo', chụp ảnh sự cố và mô tả chi tiết vị trí."),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {},
        backgroundColor: const Color(0xFF10B981),
        icon: const Icon(Icons.support_agent, color: Colors.white),
        label: const Text("Chat với CSKH", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildContactCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF047857), Color(0xFF10B981)]),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("Liên hệ Ban Quản Lý", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          Row(
            children: [
              const Icon(Icons.phone, color: Colors.white70, size: 20),
              const SizedBox(width: 12),
              const Text("Hotline: 1900 1234", style: TextStyle(color: Colors.white, fontSize: 15)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.email, color: Colors.white70, size: 20),
              const SizedBox(width: 12),
              const Text("Email: support@urban.vn", style: TextStyle(color: Colors.white, fontSize: 15)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFaqItem(String question, String answer) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 0,
      child: ExpansionTile(
        title: Text(question, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        childrenPadding: const EdgeInsets.only(left: 16, right: 16, bottom: 16),
        children: [
          Text(answer, style: const TextStyle(color: Color(0xFF64748B), height: 1.5)),
        ],
      ),
    );
  }
}
