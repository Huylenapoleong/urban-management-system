import { Injectable } from '@nestjs/common';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import type {
  ChatConversationReadEvent,
  ChatConversationRemovedEvent,
  ChatConversationUpdatedEvent,
  ChatMessageCreatedEvent,
  ChatMessageDeletedEvent,
  ChatMessageUpdatedEvent,
} from '@urban/shared-types';
import type {
  StoredConversation,
  StoredMessage,
} from '../../common/storage-records';
import {
  ConversationStateService,
  type MessageDeliveryContext,
} from '../../common/services/conversation-state.service';
import {
  ConversationSummaryService,
  type ConversationSyncResult,
} from './conversation-summary.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { MediaAssetService } from '../../infrastructure/storage/media-asset.service';

@Injectable()
export class ConversationDispatchService {
  constructor(
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly conversationStateService: ConversationStateService,
    private readonly conversationSummaryService: ConversationSummaryService,
    private readonly mediaAssetService: MediaAssetService,
  ) {}

  async emitMessageCreated(
    eventId: string,
    actorUserId: string,
    message: StoredMessage,
    participants: string[],
    summariesByUser: Map<string, StoredConversation>,
    clientMessageId?: string,
  ): Promise<void> {
    for (const participantId of participants) {
      const summary = summariesByUser.get(participantId);

      if (!summary) {
        continue;
      }

      const payload: ChatMessageCreatedEvent = {
        eventId,
        conversationId: this.toPublicConversationId(
          participantId,
          message.conversationId,
        ),
        conversationKey: message.conversationId,
        message: await this.serializeMessage(participantId, message),
        summary: this.serializeConversationSummary(participantId, summary),
        sentByUserId: actorUserId,
        clientMessageId:
          participantId === message.senderId ? clientMessageId : undefined,
        occurredAt: message.sentAt,
      };

      this.chatRealtimeService.emitToUser(
        participantId,
        CHAT_SOCKET_EVENTS.MESSAGE_CREATED,
        payload,
      );
      this.emitConversationSummaryUpdated(
        eventId,
        participantId,
        message.conversationId,
        summary,
        'message.created',
        payload.occurredAt,
      );
    }
  }

  async emitMessageUpdated(
    eventId: string,
    actorUserId: string,
    message: StoredMessage,
    conversationKey: string,
    syncResult: ConversationSyncResult,
  ): Promise<void> {
    for (const [participantId] of syncResult.summariesByUser.entries()) {
      const payload: ChatMessageUpdatedEvent = {
        eventId,
        conversationId: this.toPublicConversationId(
          participantId,
          conversationKey,
        ),
        conversationKey,
        message: await this.serializeMessage(participantId, message),
        updatedByUserId: actorUserId,
        occurredAt: message.updatedAt,
      };

      this.chatRealtimeService.emitToUser(
        participantId,
        CHAT_SOCKET_EVENTS.MESSAGE_UPDATED,
        payload,
      );
    }

    for (const participantId of syncResult.changedUserIds) {
      const summary = syncResult.summariesByUser.get(participantId);

      if (!summary) {
        continue;
      }

      this.emitConversationSummaryUpdated(
        eventId,
        participantId,
        conversationKey,
        summary,
        'message.updated',
        message.updatedAt,
      );
    }
  }

  emitMessageDeleted(
    eventId: string,
    actorUserId: string,
    message: StoredMessage,
    conversationKey: string,
    syncResult: ConversationSyncResult,
  ): void {
    const occurredAt = message.deletedAt ?? message.updatedAt;

    for (const [participantId] of syncResult.summariesByUser.entries()) {
      const payload: ChatMessageDeletedEvent = {
        eventId,
        conversationId: this.toPublicConversationId(
          participantId,
          conversationKey,
        ),
        conversationKey,
        messageId: message.messageId,
        deletedByUserId: actorUserId,
        occurredAt,
      };

      this.chatRealtimeService.emitToUser(
        participantId,
        CHAT_SOCKET_EVENTS.MESSAGE_DELETED,
        payload,
      );
    }

    for (const participantId of syncResult.changedUserIds) {
      const summary = syncResult.summariesByUser.get(participantId);

      if (!summary) {
        continue;
      }

      this.emitConversationSummaryUpdated(
        eventId,
        participantId,
        conversationKey,
        summary,
        'message.deleted',
        occurredAt,
      );
    }

    for (const participantId of syncResult.removedUserIds) {
      this.emitConversationRemoved(
        eventId,
        participantId,
        conversationKey,
        occurredAt,
        'message.deleted',
      );
    }
  }

  async emitConversationRead(
    eventId: string,
    actorUserId: string,
    conversationKey: string,
    participants: string[],
    actorConversation: StoredConversation,
  ): Promise<void> {
    this.emitConversationSummaryUpdated(
      eventId,
      actorUserId,
      conversationKey,
      actorConversation,
      'conversation.read',
      actorConversation.updatedAt,
    );

    for (const participantId of participants) {
      if (participantId === actorUserId) {
        continue;
      }

      const recipientConversation =
        await this.conversationSummaryService.getConversationSummary(
          participantId,
          conversationKey,
        );

      if (!recipientConversation || recipientConversation.deletedAt) {
        continue;
      }

      const payload: ChatConversationReadEvent = {
        eventId,
        conversationId: this.toPublicConversationId(
          participantId,
          conversationKey,
        ),
        conversationKey,
        readByUserId: actorUserId,
        readAt: actorConversation.updatedAt,
      };

      this.chatRealtimeService.emitToUser(
        participantId,
        CHAT_SOCKET_EVENTS.CONVERSATION_READ,
        payload,
      );
    }
  }

  emitConversationSummaryUpdated(
    eventId: string,
    participantId: string,
    conversationKey: string,
    summary: StoredConversation,
    reason: ChatConversationUpdatedEvent['reason'],
    occurredAt: string,
  ): void {
    const payload: ChatConversationUpdatedEvent = {
      eventId,
      conversationId: this.toPublicConversationId(
        participantId,
        conversationKey,
      ),
      conversationKey,
      summary: this.serializeConversationSummary(participantId, summary),
      reason,
      occurredAt,
    };

    this.chatRealtimeService.emitToUser(
      participantId,
      CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED,
      payload,
    );
  }

  emitConversationRemoved(
    eventId: string,
    participantId: string,
    conversationKey: string,
    occurredAt: string,
    reason: ChatConversationRemovedEvent['reason'],
  ): void {
    const payload: ChatConversationRemovedEvent = {
      eventId,
      conversationId: this.toPublicConversationId(
        participantId,
        conversationKey,
      ),
      conversationKey,
      reason,
      occurredAt,
    };

    this.chatRealtimeService.emitToUser(
      participantId,
      CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED,
      payload,
    );
  }

  private serializeConversationSummary(
    actorId: string,
    conversation: StoredConversation,
  ) {
    return this.conversationStateService.serializeConversationSummary(
      actorId,
      conversation,
    );
  }

  private async serializeMessage(
    actorId: string,
    message: StoredMessage,
    deliveryContext?: MessageDeliveryContext,
  ) {
    const item = this.conversationStateService.serializeMessage(
      actorId,
      message,
      deliveryContext,
    );
    const senderAvatar = await this.mediaAssetService.resolveAssetWithLegacyUrl(
      item.senderAvatarAsset,
      item.senderAvatarUrl,
    );
    const attachment = await this.mediaAssetService.resolveAssetWithLegacyUrl(
      item.attachmentAsset,
      item.attachmentUrl,
    );

    return {
      ...item,
      senderAvatarAsset: senderAvatar.asset,
      senderAvatarUrl: senderAvatar.url,
      attachmentAsset: attachment.asset,
      attachmentUrl: attachment.url,
    };
  }

  private toPublicConversationId(actorId: string, conversationId: string) {
    return this.conversationStateService.toPublicConversationId(
      actorId,
      conversationId,
    );
  }
}
