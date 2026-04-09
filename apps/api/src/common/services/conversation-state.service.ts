import { Injectable } from '@nestjs/common';
import { MESSAGE_TYPES } from '@urban/shared-constants';
import type {
  ConversationSummary,
  MediaAsset,
  MessageItem,
} from '@urban/shared-types';
import {
  getConversationKind,
  isDmConversationId,
  isGroupConversationId,
  makeConversationSummarySk,
  makeInboxPk,
  makeInboxStatsKey,
} from '@urban/shared-utils';
import { toConversationSummary, toMessage } from '../mappers';
import type { StoredConversation, StoredMessage } from '../storage-records';

interface StructuredMessageContent extends Record<string, unknown> {
  text: string;
  mention: unknown[];
}

export type SupportedMessageType = (typeof MESSAGE_TYPES)[number];

export interface MessageDeliveryContext {
  participantIds: string[];
  summariesByUser: Map<string, StoredConversation>;
}

@Injectable()
export class ConversationStateService {
  groupActiveMessagesByConversation(
    messages: StoredMessage[],
  ): Map<string, StoredMessage[]> {
    const grouped = new Map<string, StoredMessage[]>();

    for (const message of messages) {
      if (message.deletedAt) {
        continue;
      }

      const existing = grouped.get(message.conversationId);

      if (existing) {
        existing.push(message);
        continue;
      }

      grouped.set(message.conversationId, [message]);
    }

    for (const [conversationId, items] of grouped.entries()) {
      grouped.set(
        conversationId,
        items.sort((left, right) => {
          const sentAtCompare = right.sentAt.localeCompare(left.sentAt);
          return sentAtCompare !== 0
            ? sentAtCompare
            : right.messageId.localeCompare(left.messageId);
        }),
      );
    }

    return grouped;
  }

  buildExpectedSummary(
    currentSummary: StoredConversation,
    activeMessages: StoredMessage[],
  ): StoredConversation {
    const latestMessage = activeMessages[0];
    const kind = getConversationKind(currentSummary.conversationId);
    const lastReadAt = this.resolveStoredLastReadAt(
      currentSummary,
      latestMessage.sentAt,
    );

    return {
      ...currentSummary,
      PK: makeInboxPk(currentSummary.userId),
      SK: makeConversationSummarySk(
        currentSummary.conversationId,
        latestMessage.sentAt,
      ),
      GSI1PK: makeInboxStatsKey(currentSummary.userId, kind),
      lastMessagePreview: this.buildPreview(latestMessage),
      lastSenderName: latestMessage.senderName,
      unreadCount: this.computeUnreadCount(
        currentSummary.userId,
        activeMessages,
        lastReadAt,
      ),
      isGroup: kind === 'GRP',
      updatedAt: latestMessage.sentAt,
      lastReadAt,
      deletedAt: null,
    };
  }

  computeUnreadCount(
    participantId: string,
    messages: StoredMessage[],
    lastReadAt: string | null,
  ): number {
    return messages.filter(
      (message) =>
        message.senderId !== participantId &&
        (!lastReadAt || message.sentAt > lastReadAt),
    ).length;
  }

  resolveStoredLastReadAt(
    conversation: StoredConversation | undefined,
    fallbackSentAt?: string,
  ): string | null {
    if (conversation?.lastReadAt !== undefined) {
      return conversation.lastReadAt ?? null;
    }

    if (!conversation) {
      return null;
    }

    if (conversation.unreadCount === 0) {
      return (
        this.getConversationLastMessageSentAt(conversation) ??
        fallbackSentAt ??
        null
      );
    }

    return null;
  }

  getConversationLastMessageSentAt(
    conversation: StoredConversation,
  ): string | null {
    const marker = '#LAST#';
    const markerIndex = conversation.SK.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    const sentAt = conversation.SK.slice(markerIndex + marker.length);
    return sentAt || null;
  }

  hasConversationSummaryChanged(
    current: StoredConversation | undefined,
    next: StoredConversation,
  ): boolean {
    if (!current) {
      return true;
    }

    return (
      current.SK !== next.SK ||
      current.groupName !== next.groupName ||
      current.lastMessagePreview !== next.lastMessagePreview ||
      current.lastSenderName !== next.lastSenderName ||
      current.unreadCount !== next.unreadCount ||
      current.deletedAt !== next.deletedAt ||
      current.updatedAt !== next.updatedAt ||
      current.lastReadAt !== next.lastReadAt ||
      (current.isPinned ?? false) !== (next.isPinned ?? false) ||
      (current.archivedAt ?? null) !== (next.archivedAt ?? null) ||
      (current.mutedUntil ?? null) !== (next.mutedUntil ?? null)
    );
  }

  normalizeStoredContent(
    type: SupportedMessageType,
    rawContent: string,
  ): string {
    if (!this.usesStructuredContent(type)) {
      return rawContent;
    }

    const parsedContent = this.tryParseStructuredContent(rawContent);

    if (parsedContent) {
      return JSON.stringify(parsedContent);
    }

    return JSON.stringify({
      text: rawContent,
      mention: [],
    } satisfies StructuredMessageContent);
  }

  usesStructuredContent(type: SupportedMessageType): boolean {
    return type === 'TEXT' || type === 'EMOJI' || type === 'SYSTEM';
  }

  tryParseStructuredContent(
    rawContent: string,
  ): StructuredMessageContent | undefined {
    if (!rawContent) {
      return {
        text: '',
        mention: [],
      };
    }

    try {
      const parsed = JSON.parse(rawContent) as unknown;

      if (typeof parsed === 'string') {
        return {
          text: parsed,
          mention: [],
        };
      }

      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        return undefined;
      }

      const record = parsed as Record<string, unknown>;
      return {
        ...record,
        text: typeof record.text === 'string' ? record.text : '',
        mention: Array.isArray(record.mention) ? record.mention : [],
      };
    } catch {
      return undefined;
    }
  }

  extractPreviewText(rawContent: string): string | undefined {
    const normalized = rawContent.trim();

    if (!normalized) {
      return undefined;
    }

    const parsed = this.tryParseStructuredContent(normalized);
    const text = parsed?.text?.trim();

    if (text) {
      return text;
    }

    return parsed ? undefined : normalized;
  }

  buildPreview(message: StoredMessage): string {
    if (
      message.type !== 'TEXT' &&
      message.type !== 'EMOJI' &&
      message.type !== 'SYSTEM'
    ) {
      return `[${message.type}]`;
    }

    const previewText = this.extractPreviewText(message.content);

    if (!previewText) {
      return '[Attachment]';
    }

    return previewText.slice(0, 100);
  }

  hasMeaningfulMessageBody(
    type: SupportedMessageType,
    content: string,
    attachmentAsset?: MediaAsset,
    attachmentUrl?: string,
  ): boolean {
    if (attachmentAsset?.key || attachmentUrl) {
      return true;
    }

    if (!content) {
      return false;
    }

    if (this.usesStructuredContent(type)) {
      return Boolean(this.extractPreviewText(content));
    }

    return content.trim().length > 0;
  }
  getMessageDeliveryState(
    message: StoredMessage,
    context?: MessageDeliveryContext,
  ): Pick<
    MessageItem,
    | 'deliveryState'
    | 'recipientCount'
    | 'deliveredCount'
    | 'readByCount'
    | 'lastReadAt'
  > {
    if (!context) {
      return {};
    }

    const recipientIds = context.participantIds.filter(
      (participantId) => participantId !== message.senderId,
    );
    const deliveredRecipients = recipientIds.filter((participantId) =>
      context.summariesByUser.has(participantId),
    );
    const readAtValues = deliveredRecipients
      .map(
        (participantId) =>
          context.summariesByUser.get(participantId)?.lastReadAt,
      )
      .filter(
        (value): value is string =>
          typeof value === 'string' && value >= message.sentAt,
      )
      .sort((left, right) => right.localeCompare(left));
    const recipientCount = recipientIds.length;
    const deliveredCount = deliveredRecipients.length;
    const readByCount = readAtValues.length;

    return {
      deliveryState:
        recipientCount > 0 && readByCount >= recipientCount
          ? 'READ'
          : recipientCount > 0 && deliveredCount >= recipientCount
            ? 'DELIVERED'
            : 'SENT',
      recipientCount,
      deliveredCount,
      readByCount,
      lastReadAt: readAtValues[0],
    };
  }

  serializeConversationSummary(
    actorId: string,
    conversation: StoredConversation,
  ): ConversationSummary {
    const summary = toConversationSummary(conversation);

    return {
      ...summary,
      conversationId: this.toPublicConversationId(
        actorId,
        summary.conversationId,
      ),
    };
  }

  serializeMessage(
    actorId: string,
    message: StoredMessage,
    deliveryContext?: MessageDeliveryContext,
  ): MessageItem {
    const item = toMessage(message);

    return {
      ...item,
      ...this.getMessageDeliveryState(message, deliveryContext),
      conversationId: this.toPublicConversationId(actorId, item.conversationId),
    };
  }

  toPublicConversationId(actorId: string, conversationId: string): string {
    if (isGroupConversationId(conversationId)) {
      return `group:${conversationId.slice('GRP#'.length)}`;
    }

    if (!isDmConversationId(conversationId)) {
      return conversationId;
    }

    const participantIds = conversationId.slice('DM#'.length).split('#');
    const otherParticipantId = participantIds.find(
      (participantId) => participantId !== actorId,
    );

    return otherParticipantId ? `dm:${otherParticipantId}` : conversationId;
  }
}
