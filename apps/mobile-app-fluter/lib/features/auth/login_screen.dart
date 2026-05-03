import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../../state/session_controller.dart";
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
  final _locationController = TextEditingController(text: "VN-HCM-D1-W1");

  bool _registerMode = false;
  bool _isOtpMode = false;
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
        _showError(session.errorMessage!);
      }
      return;
    }

    if (_registerMode) {
      final success = await session.requestRegisterOtp(
        fullName: _fullNameController.text.trim(),
        password: _passwordController.text,
        locationCode: _locationController.text.trim(),
        email: _emailController.text.trim().isEmpty
            ? null
            : _emailController.text.trim(),
        phone:
            _phoneController.text.trim().isEmpty ? null : _phoneController.text.trim(),
      );
      if (!mounted) return;
      if (success) {
        setState(() => _isOtpMode = true);
      } else if (session.errorMessage != null) {
        _showError(session.errorMessage!);
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
      _showError(session.errorMessage!);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final loading = session.isLoading;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        _isOtpMode
                            ? "Verification"
                            : (_registerMode ? "Create account" : "Citizen and Official chat"),
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _isOtpMode
                            ? "Enter the OTP sent to your email or phone."
                            : (_registerMode
                                ? "Register and continue to mobile workspace."
                                : "Sign in to continue."),
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Colors.grey.shade600,
                            ),
                      ),
                      const SizedBox(height: 20),
                      if (_isOtpMode) ...[
                        TextField(
                          controller: _otpController,
                          keyboardType: TextInputType.number,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _submit(session),
                          decoration: const InputDecoration(
                            labelText: "OTP Code",
                            hintText: "123456",
                          ),
                        ),
                        const SizedBox(height: 20),
                      ] else ...[
                        if (_registerMode) ...[
                          TextField(
                            controller: _fullNameController,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: "Full name",
                              hintText: "Nguyen Van A",
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _emailController,
                            textInputAction: TextInputAction.next,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                              labelText: "Email (optional)",
                              hintText: "name@example.com",
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _phoneController,
                            textInputAction: TextInputAction.next,
                            keyboardType: TextInputType.phone,
                            decoration: const InputDecoration(
                              labelText: "Phone (optional)",
                              hintText: "09xxxxxxxx",
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _locationController,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: "Location code",
                              hintText: "VN-HCM-D1-W1",
                            ),
                          ),
                          const SizedBox(height: 12),
                        ] else ...[
                          TextField(
                            controller: _loginController,
                            textInputAction: TextInputAction.next,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                              labelText: "Email or phone",
                              hintText: "you@example.com",
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                        TextField(
                          controller: _passwordController,
                          obscureText: true,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _submit(session),
                          decoration: const InputDecoration(
                            labelText: "Password",
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],
                      FilledButton.icon(
                        onPressed: loading ? null : () => _submit(session),
                        icon: loading
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Icon(_isOtpMode
                                ? Icons.check_circle_outline
                                : (_registerMode ? Icons.person_add_alt : Icons.login)),
                        label: Text(_isOtpMode
                            ? "Verify OTP"
                            : (_registerMode ? "Register" : "Sign in")),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(52),
                        ),
                      ),
                      const SizedBox(height: 12),
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
                            child: const Text("Forgot password?"),
                          ),
                        ),
                      if (!_isOtpMode)
                        TextButton(
                          onPressed: loading
                              ? null
                              : () => setState(() {
                                    _registerMode = !_registerMode;
                                  }),
                          child: Text(
                            _registerMode
                                ? "Already have an account? Sign in"
                                : "Need an account? Register",
                          ),
                        )
                      else
                        TextButton(
                          onPressed: loading
                              ? null
                              : () => setState(() {
                                    _isOtpMode = false;
                                  }),
                          child: const Text("Go back"),
                        ),
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
