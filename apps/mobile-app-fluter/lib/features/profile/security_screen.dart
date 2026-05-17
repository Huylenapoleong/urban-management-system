import 'package:flutter/material.dart';
import '../../services/auth_service.dart';

class SecurityScreen extends StatefulWidget {
  final AuthService authService;

  const SecurityScreen({super.key, required this.authService});

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  bool _isLoading = false;
  List<Map<String, dynamic>> _sessions = [];

  @override
  void initState() {
    super.initState();
    _fetchSessions();
  }

  Future<void> _fetchSessions() async {
    try {
      final sessions = await widget.authService.listSessions();
      if (mounted) {
        setState(() {
          _sessions = sessions;
        });
      }
    } catch (e) {
      print("Error fetching sessions: $e");
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade600),
    );
  }

  void _showSuccess(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: const Color(0xFF10B981)),
    );
  }

  Future<void> _handleChangePassword() async {
    setState(() => _isLoading = true);
    try {
      await widget.authService.requestChangePasswordOtp();
      if (!mounted) return;
      
      final result = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (context) => _ChangePasswordDialog(authService: widget.authService),
      );

      if (result == true) {
        _showSuccess("Đổi mật khẩu thành công!");
      }
    } catch (e) {
      _showError("Lỗi yêu cầu đổi mật khẩu: \${e.toString()}");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleRevokeSession(String sessionId, bool isCurrent) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Đăng xuất thiết bị"),
        content: Text(isCurrent 
          ? "Bạn đang đăng xuất khỏi chính thiết bị này. Tiếp tục?" 
          : "Thiết bị này sẽ không còn quyền truy cập vào tài khoản của bạn. Tiếp tục?"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Hủy")),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text("Đăng xuất"),
          ),
        ],
      ),
    );

    if (ok == true) {
      setState(() => _isLoading = true);
      try {
        await widget.authService.revokeSession(sessionId);
        if (isCurrent) {
          if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
        } else {
          await _fetchSessions();
          _showSuccess("Đã đăng xuất thiết bị thành công");
        }
      } catch (e) {
        _showError("Lỗi: ${e.toString()}");
      } finally {
        if (mounted) setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _handleLogoutAll() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Đăng xuất tất cả thiết bị"),
        content: const Text("Bạn sẽ bị đăng xuất khỏi tất cả các thiết bị hiện tại, bao gồm cả thiết bị này. Tiếp tục?"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Hủy")),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text("Đăng xuất tất cả"),
          ),
        ],
      ),
    );

    if (ok == true) {
      setState(() => _isLoading = true);
      try {
        await widget.authService.logoutAll();
        // Since we logged out of all, including this one, token is cleared.
        // We should just pop back to root or trigger root listener, but auth state will catch it.
        if (mounted) {
          Navigator.of(context).popUntil((route) => route.isFirst);
        }
      } catch (e) {
        _showError("Lỗi đăng xuất: ${e.toString()}");
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text("Bảo mật tài khoản", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
        centerTitle: true,
      ),
      body: _isLoading 
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                "Quản lý mật khẩu và các thiết bị đăng nhập của bạn.",
                style: TextStyle(color: Color(0xFF64748B), fontSize: 14),
              ),
              const SizedBox(height: 24),
              _buildSecurityItem(
                icon: Icons.lock_outline,
                title: "Đổi mật khẩu",
                subtitle: "Nhận mã OTP qua Email/SĐT để đổi",
                iconColor: Colors.blue.shade600,
                onTap: _handleChangePassword,
              ),
              const SizedBox(height: 16),
              _buildSecurityItem(
                icon: Icons.phonelink_erase_outlined,
                title: "Đăng xuất tất cả thiết bị",
                subtitle: "Đóng tất cả các phiên đăng nhập",
                iconColor: Colors.red.shade600,
                onTap: _handleLogoutAll,
              ),
              const SizedBox(height: 32),
              Row(
                children: [
                  const Icon(Icons.history, size: 20, color: Color(0xFF64748B)),
                  const SizedBox(width: 8),
                  Text(
                    "Lịch sử đăng nhập (${_sessions.length})",
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1E293B),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (_sessions.isEmpty)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 20),
                    child: Text("Không có dữ liệu phiên đăng nhập", style: TextStyle(color: Colors.grey)),
                  ),
                )
              else
                ..._sessions.map((session) => _buildSessionItem(session)),
            ],
          ),
    );
  }

  Widget _buildSessionItem(Map<String, dynamic> session) {
    final metadata = session['metadata'] ?? {};
    final device = metadata['device'] ?? {};
    final String deviceName = device['model'] ?? device['type'] ?? "Thiết bị không xác định";
    final String os = device['os'] ?? "";
    final String ip = metadata['ip'] ?? "Không rõ IP";
    final String lastUsed = session['updatedAt'] ?? session['createdAt'] ?? "";
    final bool isCurrent = session['isCurrent'] ?? false;
    final String sessionId = session['sessionId'] ?? "";

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isCurrent ? Colors.blue.shade100 : Colors.grey.shade100),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: (isCurrent ? Colors.blue : Colors.grey).withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(
            isCurrent ? Icons.smartphone : Icons.devices_other,
            color: isCurrent ? Colors.blue : Colors.grey,
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                deviceName,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (isCurrent)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  "Đang dùng",
                  style: TextStyle(color: Colors.green, fontSize: 10, fontWeight: FontWeight.bold),
                ),
              ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("${os != "" ? '$os • ' : ''}$ip", style: const TextStyle(fontSize: 12)),
            Text(
              "Hoạt động: ${_formatTime(lastUsed)}",
              style: const TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ],
        ),
        trailing: IconButton(
          icon: const Icon(Icons.logout, size: 20, color: Colors.grey),
          onPressed: () => _handleRevokeSession(sessionId, isCurrent),
          tooltip: "Đăng xuất thiết bị này",
        ),
      ),
    );
  }

  String _formatTime(String isoString) {
    if (isoString.isEmpty) return "Không rõ";
    try {
      final date = DateTime.parse(isoString).toLocal();
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 1) return "Vừa xong";
      if (diff.inMinutes < 60) return "${diff.inMinutes} phút trước";
      if (diff.inHours < 24) return "${diff.inHours} giờ trước";
      
      return "${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute.toString().padLeft(2, '0')}";
    } catch (_) {
      return isoString;
    }
  }

  Widget _buildSecurityItem({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color iconColor,
    required VoidCallback onTap,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade100),
      ),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: iconColor),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 13)),
        trailing: const Icon(Icons.chevron_right, color: Colors.grey),
      ),
    );
  }
}

class _ChangePasswordDialog extends StatefulWidget {
  final AuthService authService;
  const _ChangePasswordDialog({required this.authService});

  @override
  State<_ChangePasswordDialog> createState() => _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends State<_ChangePasswordDialog> {
  final _otpController = TextEditingController();
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  bool _isLoading = false;
  String? _error;

  Future<void> _submit() async {
    final otp = _otpController.text.trim();
    final current = _currentPasswordController.text;
    final next = _newPasswordController.text;

    if (otp.length < 4 || current.isEmpty || next.length < 10) {
      setState(() => _error = "Vui lòng nhập đầy đủ thông tin hợp lệ. Mật khẩu mới >= 10 ký tự.");
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      await widget.authService.changePassword({
        "otpCode": otp,
        "currentPassword": current,
        "newPassword": next,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text("Nhập OTP & Đổi Mật Khẩu", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_error != null)
              Container(
                padding: const EdgeInsets.all(8),
                margin: const EdgeInsets.only(bottom: 16),
                color: Colors.red.shade50,
                child: Text(_error!, style: TextStyle(color: Colors.red.shade800, fontSize: 13)),
              ),
            TextField(
              controller: _otpController,
              decoration: const InputDecoration(labelText: "Mã OTP (Đã gửi qua Email/SĐT)"),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _currentPasswordController,
              decoration: const InputDecoration(labelText: "Mật khẩu hiện tại"),
              obscureText: true,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _newPasswordController,
              decoration: const InputDecoration(labelText: "Mật khẩu mới (>= 10 ký tự)"),
              obscureText: true,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _isLoading ? null : () => Navigator.pop(context, false), child: const Text("Hủy")),
        ElevatedButton(
          onPressed: _isLoading ? null : _submit,
          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF10B981), foregroundColor: Colors.white),
          child: _isLoading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) : const Text("Xác nhận"),
        ),
      ],
    );
  }
}
