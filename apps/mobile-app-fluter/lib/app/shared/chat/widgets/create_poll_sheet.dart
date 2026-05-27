import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../state/providers.dart';
import '../chat_providers.dart';

class CreatePollBottomSheet extends ConsumerStatefulWidget {
  final String conversationId;

  const CreatePollBottomSheet({super.key, required this.conversationId});

  static Future<void> show(BuildContext context, String conversationId) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: CreatePollBottomSheet(conversationId: conversationId),
      ),
    );
  }

  @override
  ConsumerState<CreatePollBottomSheet> createState() => _CreatePollBottomSheetState();
}

class _CreatePollBottomSheetState extends ConsumerState<CreatePollBottomSheet> {
  final _questionController = TextEditingController();
  final List<TextEditingController> _optionControllers = [
    TextEditingController(),
    TextEditingController(),
  ];
  bool _isMultipleChoice = false;
  bool _isSending = false;

  @override
  void dispose() {
    _questionController.dispose();
    for (var c in _optionControllers) {
      c.dispose();
    }
    super.dispose();
  }

  void _addOption() {
    if (_optionControllers.length < 10) {
      setState(() {
        _optionControllers.add(TextEditingController());
      });
    }
  }

  void _removeOption(int index) {
    if (_optionControllers.length > 2) {
      setState(() {
        _optionControllers[index].dispose();
        _optionControllers.removeAt(index);
      });
    }
  }

  Future<void> _submitPoll() async {
    final question = _questionController.text.trim();
    final validOptions = _optionControllers.map((c) => c.text.trim()).where((t) => t.isNotEmpty).toList();

    if (question.isEmpty || validOptions.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng nhập câu hỏi và ít nhất 2 lựa chọn')),
      );
      return;
    }

    setState(() => _isSending = true);

    final pollData = {
      'text': '📊 Bình chọn: $question',
      'poll': {
        'question': question,
        'isMultipleChoice': _isMultipleChoice,
        'options': validOptions.asMap().entries.map((e) => {
          'id': 'opt_${DateTime.now().millisecondsSinceEpoch}_${e.key}',
          'text': e.value,
          'votes': [],
        }).toList(),
      }
    };

    try {
      await ref.read(chatRepositoryProvider).sendTextMessage(
        conversationId: widget.conversationId,
        content: jsonEncode(pollData),
        clientMessageId: 'poll_${DateTime.now().millisecondsSinceEpoch}',
      );
      ref.invalidate(chatMessagesProvider(widget.conversationId));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Không thể tạo bình chọn')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final hintColor = isDark ? Colors.grey[400] : Colors.grey[600];

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 40, height: 5,
                  decoration: BoxDecoration(
                    color: isDark ? Colors.grey[700] : Colors.grey[300],
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Tạo Bình Chọn',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: textColor),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _questionController,
                style: TextStyle(color: textColor),
                decoration: InputDecoration(
                  labelText: 'Câu hỏi',
                  labelStyle: TextStyle(color: hintColor),
                  hintStyle: TextStyle(color: hintColor),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: isDark ? const Color(0xFF475569) : Colors.grey.shade300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _optionControllers.length,
                itemBuilder: (context, index) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _optionControllers[index],
                            style: TextStyle(color: textColor),
                            decoration: InputDecoration(
                              hintText: 'Lựa chọn ${index + 1}',
                              hintStyle: TextStyle(color: hintColor),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide(color: isDark ? const Color(0xFF475569) : Colors.grey.shade300),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 2),
                              ),
                            ),
                          ),
                        ),
                        if (_optionControllers.length > 2)
                          IconButton(
                            icon: const Icon(Icons.remove_circle_outline, color: Colors.red),
                            onPressed: () => _removeOption(index),
                          )
                      ],
                    ),
                  );
                },
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _optionControllers.length < 10 ? _addOption : null,
                  icon: Icon(Icons.add, color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
                  label: Text(
                    'Thêm lựa chọn',
                    style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
                  ),
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Cho phép chọn nhiều', style: TextStyle(color: textColor)),
                value: _isMultipleChoice,
                activeThumbColor: const Color(0xFF7C3AED),
                onChanged: (v) => setState(() => _isMultipleChoice = v),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _isSending ? null : _submitPoll,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF7C3AED),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _isSending
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('Tạo Bình Chọn', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
