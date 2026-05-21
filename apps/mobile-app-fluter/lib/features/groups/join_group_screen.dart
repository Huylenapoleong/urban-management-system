import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/group_service.dart';
import '../../services/app_services.dart';

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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Đã tham gia nhóm "${result['groupName'] ?? ''}"')),
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
    return Scaffold(
      appBar: AppBar(title: const Text('Tham gia nhóm')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: _result != null ? _buildSuccess() : _buildForm(),
      ),
    );
  }

  Widget _buildForm() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.group_add, size: 80, color: Colors.grey[300]),
        const SizedBox(height: 24),
        const Text('Nhập mã mời để tham gia nhóm', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 24),
        TextField(
          controller: _codeController,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 18, fontFamily: 'monospace', letterSpacing: 2),
          decoration: InputDecoration(
            hintText: 'ABC123XYZ',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
            errorText: _error,
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _isJoining ? null : _joinGroup,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: _isJoining
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Tham gia', style: TextStyle(fontSize: 16)),
          ),
        ),
      ],
    );
  }

  Widget _buildSuccess() {
    final groupName = _result?['groupName'] ?? 'Nhóm';
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, size: 80, color: Color(0xFF7C3AED)),
          const SizedBox(height: 16),
          Text('Đã tham gia $groupName!', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => Navigator.pop(context, _result),
            child: const Text('Quay lại'),
          ),
        ],
      ),
    );
  }
}
