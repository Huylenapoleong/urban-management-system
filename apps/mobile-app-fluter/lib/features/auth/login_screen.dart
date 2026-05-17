import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "package:google_fonts/google_fonts.dart";

import "../../state/session_controller.dart";
import "../../services/app_services.dart";
import "../../services/location_service.dart";
import "../shared/widgets/location_picker_widget.dart";
import "forgot_password_screen.dart";

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _loginController = TextEditingController();
  final _passwordController = TextEditingController();
  final _fullNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _locationController = TextEditingController();

  bool _registerMode = false;
  bool _isOtpMode = false;
  bool _obscurePassword = true;
  final _otpController = TextEditingController();

  @override
  void dispose() {
    _loginController.dispose();
    _passwordController.dispose();
    _fullNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _submit(SessionController session) async {
    FocusScope.of(context).unfocus();
    session.clearError();

    if (_isOtpMode) {
      bool success = false;
      if (_registerMode) {
        success = await session.verifyRegisterOtp(
          login: _emailController.text.trim().isNotEmpty
              ? _emailController.text.trim()
              : _phoneController.text.trim(),
          otpCode: _otpController.text.trim(),
        );
      } else {
        success = await session.verifyLoginOtp(
          login: _loginController.text.trim(),
          otpCode: _otpController.text.trim(),
        );
      }

      if (!mounted) return;
      if (!success && session.errorMessage != null) {
        _showError(_localizeErrorMessage(session.errorMessage));
      }
      return;
    }

    if (_registerMode) {
      if (_emailController.text.trim().isEmpty && _phoneController.text.trim().isEmpty) {
        _showError("Vui lòng nhập Email hoặc Số điện thoại để đăng ký.");
        return;
      }
      if (_passwordController.text.length < 10) {
        _showError("Mật khẩu phải có ít nhất 10 ký tự.");
        return;
      }
      if (_locationController.text.trim().isEmpty) {
        _showError("Vui lòng chọn Tỉnh/Thành phố và Phường/Xã hợp lệ.");
        return;
      }

      final success = await session.requestRegisterOtp(
        fullName: _fullNameController.text.trim(),
        password: _passwordController.text,
        locationCode: _locationController.text.trim(),
        email: _emailController.text.trim().isEmpty
            ? null
            : _emailController.text.trim(),
        phone: _phoneController.text.trim().isEmpty ? null : _phoneController.text.trim(),
      );
      if (!mounted) return;
      if (success) {
        setState(() => _isOtpMode = true);
      } else if (session.errorMessage != null) {
        _showError(_localizeErrorMessage(session.errorMessage));
      }
      return;
    }

    final success = await session.requestLoginOtp(
      login: _loginController.text.trim(),
      password: _passwordController.text,
    );
    if (!mounted) return;
    if (success) {
      setState(() => _isOtpMode = true);
    } else if (session.errorMessage != null) {
      _showError(_localizeErrorMessage(session.errorMessage));
    }
  }

  String _localizeErrorMessage(String? message) {
    if (message == null) return "Đã có lỗi xảy ra. Vui lòng thử lại.";
    
    final lowerMsg = message.toLowerCase();
    
    // OTP related
    if (lowerMsg.contains("invalid otp") || lowerMsg.contains("incorrect") || lowerMsg.contains("not match")) {
      return "Mã OTP không chính xác. Vui lòng kiểm tra lại.";
    }
    if (lowerMsg.contains("expired")) {
      return "Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại.";
    }
    if (lowerMsg.contains("too many attempts")) {
      return "Bạn đã thử quá nhiều lần. Vui lòng chờ 15 phút rồi thử lại.";
    }
    
    // Registration/Validation
    if (lowerMsg.contains("password must be longer")) {
      return "Mật khẩu phải có ít nhất 10 ký tự.";
    }
    if (lowerMsg.contains("email is invalid")) {
      return "Địa chỉ email không hợp lệ.";
    }
    if (lowerMsg.contains("phone already exists") || lowerMsg.contains("email already exists") || lowerMsg.contains("conflict")) {
      return "Tài khoản (Email hoặc SĐT) này đã được đăng ký.";
    }
    
    // Login
    if (lowerMsg.contains("invalid credentials") || lowerMsg.contains("not found")) {
      return "Thông tin đăng nhập không chính xác.";
    }
    
    return message;
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red.shade600,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final appServices = context.read<AppServices>();
    final loading = session.isLoading;

    final locationService = LocationService(apiClient: appServices.apiClient);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFF0F172A), // Slate 900
              Color(0xFF1E293B), // Slate 800
              Color(0xFF0F172A), // Slate 900
            ],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 40.0),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // App Logo
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.1),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: const Color(0xFF10B981).withOpacity(0.3),
                          width: 2,
                        ),
                      ),
                      child: Image.asset(
                        'assets/images/app_logo.png',
                        width: 80,
                        height: 80,
                        fit: BoxFit.contain,
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      "Urban Management",
                      style: GoogleFonts.poppins(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Cổng thông tin quản lý cư dân",
                      style: GoogleFonts.inter(
                        fontSize: 15,
                        color: Colors.blueGrey.shade400,
                      ),
                    ),
                    const SizedBox(height: 40),

                    // Login Card
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.2),
                            blurRadius: 24,
                            offset: const Offset(0, 12),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            _isOtpMode
                                ? "Xác thực OTP"
                                : (_registerMode ? "Tạo tài khoản" : "Đăng nhập"),
                            style: GoogleFonts.poppins(
                              fontSize: 22,
                              fontWeight: FontWeight.w600,
                              color: const Color(0xFF0F172A),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _isOtpMode
                                ? "Vui lòng nhập mã OTP đã được gửi."
                                : (_registerMode
                                    ? "Đăng ký để sử dụng không gian làm việc số."
                                    : "Đăng nhập để tiếp tục."),
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              color: Colors.blueGrey.shade500,
                            ),
                          ),
                          const SizedBox(height: 32),
                          if (_isOtpMode) ...[
                            _buildTextField(
                              controller: _otpController,
                              label: "Mã OTP",
                              hint: "123456",
                              icon: Icons.security,
                              keyboardType: TextInputType.number,
                              onSubmit: (_) => _submit(session),
                            ),
                            const SizedBox(height: 24),
                          ] else ...[
                            if (_registerMode) ...[
                              _buildTextField(
                                controller: _fullNameController,
                                label: "Họ và tên",
                                hint: "Nguyễn Văn A",
                                icon: Icons.person_outline,
                              ),
                              const SizedBox(height: 16),
                              _buildTextField(
                                controller: _emailController,
                                label: "Email (hoặc nhập SĐT)",
                                hint: "name@example.com",
                                icon: Icons.email_outlined,
                                keyboardType: TextInputType.emailAddress,
                              ),
                              const SizedBox(height: 16),
                              _buildTextField(
                                controller: _phoneController,
                                label: "Số điện thoại (hoặc nhập Email)",
                                hint: "09xxxxxxxx",
                                icon: Icons.phone_outlined,
                                keyboardType: TextInputType.phone,
                              ),
                              const SizedBox(height: 16),
                              Theme(
                                data: Theme.of(context).copyWith(
                                  textTheme: Theme.of(context).textTheme.copyWith(
                                        labelLarge: GoogleFonts.inter(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500,
                                          color: const Color(0xFF0F172A),
                                        ),
                                      ),
                                ),
                                child: LocationPickerWidget(
                                  locationService: locationService,
                                  initialLocationCode: _locationController.text,
                                  onLocationSelected: (code) {
                                    _locationController.text = code;
                                  },
                                ),
                              ),
                              const SizedBox(height: 16),
                            ] else ...[
                              _buildTextField(
                                controller: _loginController,
                                label: "Email hoặc số điện thoại",
                                hint: "you@example.com",
                                icon: Icons.person_outline,
                                keyboardType: TextInputType.emailAddress,
                              ),
                              const SizedBox(height: 16),
                            ],
                            _buildTextField(
                              controller: _passwordController,
                              label: "Mật khẩu",
                              hint: "••••••••",
                              icon: Icons.lock_outline,
                              isPassword: true,
                              obscureText: _obscurePassword,
                              onToggleVisibility: () {
                                setState(() {
                                  _obscurePassword = !_obscurePassword;
                                });
                              },
                              onSubmit: (_) => _submit(session),
                            ),
                            const SizedBox(height: 24),
                          ],
                          FilledButton(
                            onPressed: loading ? null : () => _submit(session),
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF10B981),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              elevation: 0,
                            ),
                            child: loading
                                ? const SizedBox(
                                    width: 24,
                                    height: 24,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.5,
                                      color: Colors.white,
                                    ),
                                  )
                                : Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        _isOtpMode
                                            ? Icons.check_circle_outline
                                            : (_registerMode
                                                ? Icons.person_add_alt
                                                : Icons.login),
                                        size: 20,
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        _isOtpMode
                                            ? "Xác nhận OTP"
                                            : (_registerMode ? "Đăng ký" : "Đăng nhập"),
                                        style: GoogleFonts.inter(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                          ),
                          const SizedBox(height: 16),
                          if (!_isOtpMode && !_registerMode)
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton(
                                onPressed: loading
                                    ? null
                                    : () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => const ForgotPasswordScreen(),
                                          ),
                                        );
                                      },
                                style: TextButton.styleFrom(
                                  foregroundColor: const Color(0xFF10B981),
                                ),
                                child: Text(
                                  "Quên mật khẩu?",
                                  style: GoogleFonts.inter(fontWeight: FontWeight.w500),
                                ),
                              ),
                            ),
                          const Divider(height: 32),
                          if (!_isOtpMode)
                            TextButton(
                              onPressed: loading
                                  ? null
                                  : () => setState(() {
                                        _registerMode = !_registerMode;
                                      }),
                              style: TextButton.styleFrom(
                                foregroundColor: Colors.blueGrey.shade600,
                              ),
                              child: Text(
                                _registerMode
                                    ? "Đã có tài khoản? Đăng nhập"
                                    : "Chưa có tài khoản? Đăng ký",
                                style: GoogleFonts.inter(),
                              ),
                            )
                          else
                            TextButton(
                              onPressed: loading
                                  ? null
                                  : () => setState(() {
                                        _isOtpMode = false;
                                      }),
                              style: TextButton.styleFrom(
                                foregroundColor: Colors.blueGrey.shade600,
                              ),
                              child: Text(
                                "Quay lại",
                                style: GoogleFonts.inter(),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    bool isPassword = false,
    bool? obscureText,
    VoidCallback? onToggleVisibility,
    TextInputType? keyboardType,
    Function(String)? onSubmit,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: const Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          obscureText: isPassword ? (obscureText ?? true) : false,
          keyboardType: keyboardType,
          textInputAction: onSubmit != null ? TextInputAction.done : TextInputAction.next,
          onSubmitted: onSubmit,
          style: GoogleFonts.inter(fontSize: 15),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: GoogleFonts.inter(color: Colors.blueGrey.shade400, fontSize: 15),
            prefixIcon: Icon(icon, color: Colors.blueGrey.shade400, size: 20),
            suffixIcon: isPassword && onToggleVisibility != null
                ? IconButton(
                    icon: Icon(
                      (obscureText ?? true) ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                      color: Colors.blueGrey.shade400,
                      size: 20,
                    ),
                    onPressed: onToggleVisibility,
                  )
                : null,
            filled: true,
            fillColor: Colors.blueGrey.shade50,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.blueGrey.shade200, width: 1),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF10B981), width: 1.5),
            ),
            contentPadding: const EdgeInsets.symmetric(vertical: 16),
          ),
        ),
      ],
    );
  }
}
