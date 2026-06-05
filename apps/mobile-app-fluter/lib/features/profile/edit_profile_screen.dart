import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../services/user_service.dart';
import '../../models/user_profile.dart';
import '../../services/app_services.dart';
import '../../services/location_service.dart';
import '../shared/widgets/app_toast.dart';

class EditProfileScreen extends StatefulWidget {
  final UserProfile user;
  final UserService userService;
  final VoidCallback onProfileUpdated;

  const EditProfileScreen({
    super.key,
    required this.user,
    required this.userService,
    required this.onProfileUpdated,
  });

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  late TextEditingController _fullNameController;
  late TextEditingController _emailController;
  late TextEditingController _phoneController;
  late TextEditingController _locationController;
  
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _fullNameController = TextEditingController(text: widget.user.fullName);
    _emailController = TextEditingController(text: widget.user.email ?? "");
    _phoneController = TextEditingController(text: widget.user.phone ?? "");
    _locationController = TextEditingController(text: "Đang tải...");
    
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _resolveLocation();
    });
  }

  Future<void> _resolveLocation() async {
    if (widget.user.locationCode.isEmpty) {
      if (mounted) {
        setState(() {
          _locationController.text = "Không có địa chỉ";
        });
      }
      return;
    }
    try {
      final appServices = context.read<AppServices>();
      final locationService = LocationService(apiClient: appServices.apiClient);
      final resolved = await locationService.resolveLocationCode(widget.user.locationCode);
      if (mounted) {
        setState(() {
          _locationController.text = resolved.displayName;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _locationController.text = widget.user.locationCode;
        });
      }
    }
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    final fullName = _fullNameController.text.trim();
    final email = _emailController.text.trim();
    final phone = _phoneController.text.trim();

    if (fullName.length < 2) {
      _showError("Họ và tên phải có ít nhất 2 ký tự.");
      return;
    }

    setState(() => _isLoading = true);

    try {
      await widget.userService.updateProfile({
        "fullName": fullName,
        if (email.isNotEmpty) "email": email,
        if (phone.isNotEmpty) "phone": phone,
      });

      widget.onProfileUpdated();
      
      if (mounted) {
        AppToast.show(
          context,
          message: "Cập nhật thông tin thành công!",
          type: AppToastType.success,
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        final errorMsg = e.toString().toLowerCase();
        String displayError = "Đã xảy ra lỗi. Vui lòng thử lại.";
        
        if (errorMsg.contains("email already exists") || errorMsg.contains("phone already exists")) {
          displayError = "Email hoặc Số điện thoại này đã được sử dụng bởi tài khoản khác.";
        } else if (errorMsg.contains("invalid email")) {
          displayError = "Địa chỉ email không hợp lệ.";
        }
        
        _showError(displayError);
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _showError(String message) {
    AppToast.show(
      context,
      message: message,
      type: AppToastType.error,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          "Chỉnh sửa thông tin",
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 18,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        foregroundColor: isDark ? Colors.white : const Color(0xFF0F172A),
        elevation: 0,
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Cập nhật thông tin liên hệ và cá nhân của bạn.",
              style: TextStyle(color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B), fontSize: 14),
            ),
            const SizedBox(height: 32),
            _buildTextField(
              controller: _fullNameController,
              label: "Họ và tên",
              hint: "Nhập họ và tên của bạn",
              icon: Icons.person_outline,
            ),
            const SizedBox(height: 20),
            _buildTextField(
              controller: _emailController,
              label: "Email",
              hint: "nguyenvana@example.com",
              icon: Icons.email_outlined,
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 20),
            _buildTextField(
              controller: _phoneController,
              label: "Số điện thoại",
              hint: "0912345678",
              icon: Icons.phone_outlined,
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 20),
            _buildTextField(
              controller: _locationController,
              label: "Địa chỉ",
              hint: "Địa chỉ của bạn",
              icon: Icons.location_on_outlined,
              readOnly: true,
            ),
            const SizedBox(height: 48),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _saveProfile,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF10B981),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: _isLoading
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                      )
                    : const Text("Lưu thay đổi", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    TextInputType? keyboardType,
    bool readOnly = false,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: isDark ? Colors.white : const Color(0xFF1E293B),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          readOnly: readOnly,
          style: GoogleFonts.inter(
            fontSize: 15,
            color: readOnly
                ? (isDark ? Colors.grey.shade500 : Colors.grey.shade600)
                : (isDark ? Colors.white : Colors.black87),
          ),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: GoogleFonts.inter(color: isDark ? Colors.grey.shade500 : Colors.blueGrey.shade300, fontSize: 15),
            prefixIcon: Icon(icon, color: isDark ? Colors.grey.shade400 : Colors.blueGrey.shade400, size: 22),
            suffixIcon: readOnly ? const Icon(Icons.lock_outline, color: Colors.grey, size: 20) : null,
            filled: true,
            fillColor: readOnly
                ? (isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9))
                : (isDark ? const Color(0xFF1E293B) : Colors.white),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: readOnly
                    ? (isDark ? Colors.grey.shade800 : Colors.blueGrey.shade50)
                    : (isDark ? Colors.grey.shade800 : Colors.blueGrey.shade100),
                width: 1,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: readOnly
                    ? (isDark ? Colors.grey.shade800 : Colors.blueGrey.shade50)
                    : const Color(0xFF10B981),
                width: readOnly ? 1 : 1.5,
              ),
            ),
            contentPadding: const EdgeInsets.symmetric(vertical: 16),
          ),
        ),
      ],
    );
  }
}
