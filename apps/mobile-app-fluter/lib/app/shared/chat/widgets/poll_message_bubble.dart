import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../features/chat/models/chat_message.dart';
import '../../../../state/auth_controller.dart';
import '../../../../state/providers.dart';
import '../chat_providers.dart';

class PollMessageBubble extends ConsumerWidget {
  final ChatMessage message;
  final bool isMine;
  final String conversationId;

  const PollMessageBubble({
    super.key,
    required this.message,
    required this.isMine,
    required this.conversationId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final userId = auth.user?.id ?? '';
    final pollDataRaw = message.pollData;
    if (pollDataRaw == null) return const SizedBox.shrink();

    final question = pollDataRaw['question'] ?? 'Bình chọn';
    final isMultipleChoice = pollDataRaw['isMultipleChoice'] == true;
    final optionsRaw = pollDataRaw['options'] as List? ?? [];
    
    // Parse options
    final options = optionsRaw.map((o) {
      final opt = o as Map<String, dynamic>;
      final votes = (opt['votes'] as List?)?.map((e) => e.toString()).toList() ?? [];
      return {
        'id': opt['id'] ?? '',
        'text': opt['text'] ?? '',
        'votes': votes,
      };
    }).toList();

    final totalVotes = options.fold<int>(0, (sum, opt) => sum + (opt['votes'] as List).length);

    void handleVote(String optionId) async {
      if (userId.isEmpty) return;

      final newOptions = options.map((opt) {
        final votes = List<String>.from(opt['votes'] as List);
        final hasVoted = votes.contains(userId);

        if (opt['id'] == optionId) {
          if (hasVoted) {
            votes.remove(userId);
          } else {
            votes.add(userId);
          }
          return {...opt, 'votes': votes};
        }

        if (!isMultipleChoice) {
          votes.remove(userId);
          return {...opt, 'votes': votes};
        }

        return opt;
      }).toList();

      final newPollData = {
        'question': question,
        'isMultipleChoice': isMultipleChoice,
        'options': newOptions,
      };

      // Giữ lại text fallback
      final parsedContent = jsonDecode(message.content) as Map<String, dynamic>;
      parsedContent['poll'] = newPollData;
      
      final newContentString = jsonEncode(parsedContent);

      try {
        await ref.read(chatRepositoryProvider).editMessage(
          conversationId: conversationId,
          messageId: message.id,
          content: newContentString,
        );
        ref.invalidate(chatMessagesProvider(conversationId));
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Không thể gửi bình chọn')),
          );
        }
      }
    }

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      width: 280,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0)),
        boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.poll_outlined, color: Color(0xFF7C3AED)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  question.toString(),
                  style: TextStyle(
                    fontWeight: FontWeight.w700, 
                    fontSize: 14, 
                    color: isDark ? Colors.white : const Color(0xFF0F172A),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...options.map((opt) {
            final text = opt['text'] as String;
            final votes = opt['votes'] as List<String>;
            final hasVoted = votes.contains(userId);
            final voteCount = votes.length;
            final percentage = totalVotes > 0 ? (voteCount / totalVotes) : 0.0;

            return GestureDetector(
              onTap: () => handleVote(opt['id'] as String),
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                child: Stack(
                  children: [
                    Container(
                      height: 36,
                      decoration: BoxDecoration(
                        color: hasVoted 
                            ? (isDark ? const Color(0xFF6B21A8).withValues(alpha: 0.25) : const Color(0xFFF3E8FF)) 
                            : (isDark ? const Color(0xFF334155).withValues(alpha: 0.3) : const Color(0xFFF8FAFC)),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: hasVoted 
                              ? (isDark ? const Color(0xFFC084FC) : const Color(0xFF7C3AED)) 
                              : (isDark ? const Color(0xFF475569) : const Color(0xFFE2E8F0)),
                        ),
                      ),
                      alignment: Alignment.centerLeft,
                    ),
                    FractionallySizedBox(
                      widthFactor: percentage,
                      child: Container(
                        height: 36,
                        decoration: BoxDecoration(
                          color: hasVoted 
                              ? (isDark ? const Color(0xFFC084FC).withValues(alpha: 0.2) : const Color(0xFFD8B4FE).withValues(alpha: 0.4)) 
                              : (isDark ? const Color(0xFF475569).withValues(alpha: 0.25) : const Color(0xFFE2E8F0).withValues(alpha: 0.5)),
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                text,
                                style: TextStyle(
                                  fontWeight: hasVoted ? FontWeight.w600 : FontWeight.w400,
                                  color: hasVoted 
                                      ? (isDark ? const Color(0xFFF3E8FF) : const Color(0xFF5B21B6)) 
                                      : (isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155)),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Text(
                              '$voteCount',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: hasVoted 
                                    ? (isDark ? const Color(0xFFF3E8FF) : const Color(0xFF5B21B6)) 
                                    : (isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 4),
          Text(
            '$totalVotes phiếu bầu • ${isMultipleChoice ? 'Chọn nhiều' : 'Chọn một'}',
            style: TextStyle(
              fontSize: 11, 
              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
            ),
          ),
        ],
      ),
    );
  }
}
