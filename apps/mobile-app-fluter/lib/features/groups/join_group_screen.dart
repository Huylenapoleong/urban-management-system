import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/group_service.dart';
import '../../services/app_services.dart';
import '../shared/widgets/app_toast.dart';

class JoinGroupScreen extends StatefulWidget {
  final String? inviteCode;

  const JoinGroupScreen({super.key, this.inviteCode});

  @override
  State<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends State<JoinGroupScreen> {
  final _codeController = TextEditingController();
  bool _isJoining = false;
  String? _error;
  Map<String, dynamic>? _result;

  @override
  void initState() {
    super.initState();
    if (widget.inviteCode != null) {
      _codeController.text = widget.inviteCode!;
      _joinGroup();
    }
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _joinGroup() async {
    final code = _codeController.text.trim();
    if (code.isEmpty) {
      setState(() => _error = 'Vui lòng nhập mã mời');
      return;
    }

    setState(() { _isJoining = true; _error = null; });
    try {
      final groupService = context.read<AppServices>().groupService;
      final result = await groupService.joinByInviteCode(code);
      if (mounted) {
        setState(() { _result = result; _isJoining = false; });
        AppToast.show(
          context,
          message: 'Đã tham gia nhóm "${result['groupName'] ?? ''}"',
          type: AppToastType.success,
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().contains('banned') ? 'Bạn đã bị cấm khỏi nhóm này'
              : e.toString().contains('already') ? 'Bạn đã là thành viên nhóm này'
              : 'Mã mời không hợp lệ hoặc đã hết hạn';
          _isJoining = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          'Tham gia nhóm',
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
          ),
        ),
        centerTitle: true,
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        foregroundColor: isDark ? Colors.white : const Color(0xFF1E1B4B),
        elevation: 0,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: _result != null ? _buildSuccess(isDark) : _buildForm(isDark),
      ),
    );
  }

  Widget _buildForm(bool isDark) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(
          Icons.group_add,
          size: 80,
          color: isDark ? const Color(0xFF334155) : Colors.grey[300],
        ),
        const SizedBox(height: 24),
        Text(
          'Nhập mã mời để tham gia nhóm',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
          ),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _codeController,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 18,
            fontFamily: 'monospace',
            letterSpacing: 2,
            color: isDark ? Colors.white : Colors.black87,
          ),
          decoration: InputDecoration(
            hintText: 'ABC123XYZ',
            hintStyle: TextStyle(
              color: isDark ? const Color(0xFF64748B) : Colors.grey,
            ),
            fillColor: isDark ? const Color(0xFF1E293B) : Colors.white,
            filled: true,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(
                color: isDark ? const Color(0xFF334155) : Colors.grey.shade300,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(
                color: isDark ? const Color(0xFF7C3AED) : const Color(0xFF1E1B4B),
                width: 2,
              ),
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            errorText: _error,
            errorStyle: const TextStyle(
              color: Colors.redAccent,
            ),
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _isJoining ? null : _joinGroup,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF7C3AED),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: _isJoining
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Tham gia', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          ),
        ),
      ],
    );
  }

  Widget _buildSuccess(bool isDark) {
    final groupName = _result?['groupName'] ?? 'Nhóm';
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, size: 80, color: Color(0xFF7C3AED)),
          const SizedBox(height: 16),
          Text(
            'Đã tham gia $groupName!',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => Navigator.pop(context, _result),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF7C3AED),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            ),
            child: const Text('Quay lại'),
          ),
        ],
      ),
    );
  }
}
