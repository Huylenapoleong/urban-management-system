import "package:flutter/material.dart";

import "../../../models/conversation_summary.dart";

class ConversationSettingsSheet extends StatelessWidget {
  const ConversationSettingsSheet({
    super.key,
    required this.conversation,
    required this.isUpdating,
    required this.onTogglePin,
    required this.onMuteOneHour,
    required this.onMuteFourHours,
    required this.onMuteUntilManual,
    required this.onUnmute,
    required this.onDeleteConversation,
  });

  final ConversationSummary conversation;
  final bool isUpdating;
  final VoidCallback onTogglePin;
  final VoidCallback onMuteOneHour;
  final VoidCallback onMuteFourHours;
  final VoidCallback onMuteUntilManual;
  final VoidCallback onUnmute;
  final VoidCallback onDeleteConversation;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 46,
              height: 4,
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          Text(
            conversation.title,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            conversation.conversationId,
            style: theme.textTheme.bodySmall?.copyWith(
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 12),
          _SheetAction(
            icon: conversation.isPinned ? Icons.push_pin : Icons.push_pin_outlined,
            label: conversation.isPinned ? "Unpin conversation" : "Pin conversation",
            onTap: isUpdating ? null : onTogglePin,
          ),
          const Divider(height: 16),
          _SheetAction(
            icon: Icons.notifications_off_outlined,
            label: "Mute for 1 hour",
            onTap: isUpdating ? null : onMuteOneHour,
          ),
          _SheetAction(
            icon: Icons.notifications_paused_outlined,
            label: "Mute for 4 hours",
            onTap: isUpdating ? null : onMuteFourHours,
          ),
          _SheetAction(
            icon: Icons.notifications_active_outlined,
            label: "Mute until manually enabled",
            onTap: isUpdating ? null : onMuteUntilManual,
          ),
          _SheetAction(
            icon: Icons.notifications_none,
            label: "Unmute",
            onTap: isUpdating ? null : onUnmute,
          ),
          const Divider(height: 16),
          _SheetAction(
            icon: Icons.delete_outline,
            label: "Delete from my inbox",
            danger: true,
            onTap: isUpdating ? null : onDeleteConversation,
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _SheetAction extends StatelessWidget {
  const _SheetAction({
    required this.icon,
    required this.label,
    this.onTap,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? Colors.red.shade700 : Colors.black87;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: onTap == null ? Colors.grey.shade500 : color,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
