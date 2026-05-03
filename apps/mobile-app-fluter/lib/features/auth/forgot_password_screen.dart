import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../../state/session_controller.dart";

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _loginController = TextEditingController();
  final _otpController = TextEditingController();
  final _newPasswordController = TextEditingController();

  bool _isOtpMode = false;

  @override
  void dispose() {
    _loginController.dispose();
    _otpController.dispose();
    _newPasswordController.dispose();
    super.dispose();
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green.shade600,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _submit(SessionController session) async {
    FocusScope.of(context).unfocus();
    session.clearError();

    if (_isOtpMode) {
      final success = await session.confirmForgotPassword(
        login: _loginController.text.trim(),
        otpCode: _otpController.text.trim(),
        newPassword: _newPasswordController.text,
      );

      if (!mounted) return;

      if (success) {
        _showSuccess("Password reset successfully. You can now login.");
        Navigator.of(context).pop();
      } else if (session.errorMessage != null) {
        _showError(session.errorMessage!);
      }
      return;
    }

    final login = _loginController.text.trim();
    if (login.isEmpty) {
      _showError("Please enter your email or phone number.");
      return;
    }

    final success = await session.requestForgotPasswordOtp(login);
    if (!mounted) return;

    if (success) {
      setState(() => _isOtpMode = true);
    } else if (session.errorMessage != null) {
      _showError(session.errorMessage!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final loading = session.isLoading;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Reset Password"),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      backgroundColor: const Color(0xFFFAF5FF), // Background color from UI/UX Pro Max
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Card(
                elevation: 4,
                shadowColor: const Color(0xFF7C3AED).withOpacity(0.2),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(
                        Icons.lock_reset_rounded,
                        size: 64,
                        color: const Color(0xFF7C3AED), // Primary color
                      ),
                      const SizedBox(height: 24),
                      Text(
                        _isOtpMode ? "Create New Password" : "Forgot Password?",
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: const Color(0xFF4C1D95), // Text dark color
                            ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _isOtpMode
                            ? "Enter the OTP sent to ${_loginController.text.trim()} and your new password."
                            : "Enter the email or phone number associated with your account and we'll send you an OTP to reset your password.",
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Colors.grey.shade600,
                              height: 1.5,
                            ),
                      ),
                      const SizedBox(height: 32),
                      if (!_isOtpMode) ...[
                        TextField(
                          controller: _loginController,
                          textInputAction: TextInputAction.done,
                          keyboardType: TextInputType.emailAddress,
                          onSubmitted: (_) => _submit(session),
                          decoration: InputDecoration(
                            labelText: "Email or phone",
                            hintText: "you@example.com",
                            prefixIcon: const Icon(Icons.person_outline),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ] else ...[
                        TextField(
                          controller: _otpController,
                          keyboardType: TextInputType.number,
                          textInputAction: TextInputAction.next,
                          decoration: InputDecoration(
                            labelText: "OTP Code",
                            hintText: "123456",
                            prefixIcon: const Icon(Icons.password_rounded),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _newPasswordController,
                          obscureText: true,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _submit(session),
                          decoration: InputDecoration(
                            labelText: "New Password",
                            hintText: "Minimum 10 characters",
                            prefixIcon: const Icon(Icons.lock_outline),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 32),
                      FilledButton(
                        onPressed: loading ? null : () => _submit(session),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFFF97316), // CTA Orange
                          foregroundColor: Colors.white,
                          minimumSize: const Size.fromHeight(56),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: loading
                            ? const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(
                                _isOtpMode ? "Reset Password" : "Send OTP",
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                      ),
                      if (_isOtpMode) ...[
                        const SizedBox(height: 16),
                        TextButton(
                          onPressed: loading
                              ? null
                              : () => setState(() => _isOtpMode = false),
                          child: const Text("Go back"),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
