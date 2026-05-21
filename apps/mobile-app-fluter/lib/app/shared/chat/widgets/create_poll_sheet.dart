import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../features/chat/data/chat_repository.dart';
import '../../../../state/providers.dart';
import '../chat_providers.dart';

class CreatePollBottomSheet extends ConsumerStatefulWidget {
  final String conversationId;

  const CreatePollBottomSheet({super.key, required this.conversationId});

  static Future<void> show(BuildContext context, String conversationId) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
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
    return Container(
      padding: const EdgeInsets.all(20),
      height: MediaQuery.of(context).size.height * 0.7,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40, height: 5,
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Tạo Bình Chọn', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          TextField(
            controller: _questionController,
            decoration: InputDecoration(
              labelText: 'Câu hỏi',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ListView.builder(
              itemCount: _optionControllers.length,
              itemBuilder: (context, index) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _optionControllers[index],
                          decoration: InputDecoration(
                            hintText: 'Lựa chọn ${index + 1}',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
          ),
          TextButton.icon(
            onPressed: _optionControllers.length < 10 ? _addOption : null,
            icon: const Icon(Icons.add),
            label: const Text('Thêm lựa chọn'),
          ),
          SwitchListTile(
            title: const Text('Cho phép chọn nhiều'),
            value: _isMultipleChoice,
            onChanged: (v) => setState(() => _isMultipleChoice = v),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _isSending ? null : _submitPoll,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: _isSending ? const CircularProgressIndicator(color: Colors.white) : const Text('Tạo Bình Chọn'),
          ),
        ],
      ),
    );
  }
}
