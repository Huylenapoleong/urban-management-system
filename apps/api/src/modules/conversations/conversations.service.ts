import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MESSAGE_TYPES } from '@urban/shared-constants';
import type {
  ApiResponseMeta,
  ApiSuccessResponse,
  AuditEventItem,
  AuthenticatedUser,
  ConversationSummary,
  MessageItem,
} from '@urban/shared-types';
import {
  createUlid,
  getConversationKind,
  isDmConversationId,
  isGroupConversationId,
  makeConversationPk,
  makeConversationSummarySk,
  makeDmConversationId,
  makeInboxPk,
  makeInboxStatsKey,
  makeMessageSk,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import {
  buildPaginatedResponse,
  paginateSortedItems,
} from '../../common/pagination';
import type {
  StoredChatOutboxEvent,
  StoredConversation,
  StoredConversationAuditEvent,
  StoredMessage,
  StoredMessageDedup,
  StoredMessageRef,
  StoredPushOutboxEvent,
} from '../../common/storage-records';
import {
  ensureObject,
  optionalBoolean,
  optionalEnum,
  optionalQueryString,
  optionalString,
  parseBooleanQuery,
  parseEnumQuery,
  parseIsoDateQuery,
  parseLimit,
  requiredString,
} from '../../common/validation';
import { AuditTrailService } from '../../infrastructure/audit/audit-trail.service';
import {
  ConversationStateService,
  type MessageDeliveryContext,
  type SupportedMessageType,
} from '../../common/services/conversation-state.service';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { PushNotificationService } from '../../infrastructure/notifications/push-notification.service';
import { ChatRateLimitService } from './chat-rate-limit.service';
import { ConversationDispatchService } from './conversation-dispatch.service';
import { ChatOutboxService } from './chat-outbox.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';

export interface ResolvedConversationAccess {
  conversationId: string;
  conversationKey: string;
  participants: string[];
  isGroup: boolean;
}

export interface DeletedConversationResult {
  conversationId: string;
  removedAt: string;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly conversationStateService: ConversationStateService,
    private readonly conversationSummaryService: ConversationSummaryService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly chatRateLimitService: ChatRateLimitService,
    private readonly conversationDispatchService: ConversationDispatchService,
    private readonly chatOutboxService: ChatOutboxService,
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly auditTrailService: AuditTrailService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly config: AppConfigService,
  ) {}

  async listConversations(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<ConversationSummary[], ApiResponseMeta>> {
    const keyword = optionalQueryString(query.q, 'q')?.toLowerCase();
    const isGroup = parseBooleanQuery(query.isGroup, 'isGroup');
    const unreadOnly =
      parseBooleanQuery(query.unreadOnly, 'unreadOnly') ?? false;
    const includeArchived =
      parseBooleanQuery(query.includeArchived, 'includeArchived') ?? false;
    const limit = parseLimit(query.limit);
    const items = await this.repository.queryByPk<StoredConversation>(
      this.config.dynamodbConversationsTableName,
      makeInboxPk(actor.id),
      {
        beginsWith: 'CONV#',
      },
    );
    const filtered = items.filter((item) => {
      if (item.deletedAt) {
        return false;
      }

      if (isGroup !== undefined && item.isGroup !== isGroup) {
        return false;
      }

      if (unreadOnly && item.unreadCount <= 0) {
        return false;
      }

      if (!includeArchived && item.archivedAt) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [item.groupName, item.lastMessagePreview, item.lastSenderName]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
    const page = paginateSortedItems(
      filtered,
      limit,
      query.cursor,
      (item) => `${item.isPinned ? '1' : '0'}|${item.updatedAt}`,
      (item) => item.conversationId,
    );

    return buildPaginatedResponse(
      page.items.map((item) =>
        this.serializeConversationSummary(actor.id, item),
      ),
      page.nextCursor,
    );
  }

  async listAuditEvents(
    actor: AuthenticatedUser,
    conversationId: string,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<AuditEventItem[], ApiResponseMeta>> {
    const access = await this.resolveConversationAccess(actor, conversationId);
    return this.auditTrailService.listConversationEvents(
      access.conversationKey,
      query,
    );
  }

  async updateConversationPreferences(
    actor: AuthenticatedUser,
    conversationId: string,
    payload: unknown,
  ): Promise<ConversationSummary> {
    const access = await this.resolveConversationAccess(actor, conversationId);
    const current =
      await this.conversationSummaryService.getConversationSummary(
        actor.id,
        access.conversationKey,
      );

    if (!current || current.deletedAt) {
      throw new NotFoundException('Conversation not found in inbox.');
    }

    const body = ensureObject(payload);
    const archived = optionalBoolean(body, 'archived');
    const isPinned = optionalBoolean(body, 'isPinned');
    let mutedUntil = current.mutedUntil ?? null;

    if (Object.prototype.hasOwnProperty.call(body, 'mutedUntil')) {
      const rawMutedUntil = body.mutedUntil;

      if (rawMutedUntil === null || rawMutedUntil === '') {
        mutedUntil = null;
      } else if (
        typeof rawMutedUntil === 'string' &&
        !Number.isNaN(Date.parse(rawMutedUntil))
      ) {
        mutedUntil = rawMutedUntil.trim();
      } else {
        throw new BadRequestException(
          'mutedUntil must be null or a valid ISO date.',
        );
      }
    }

    if (
      archived === undefined &&
      isPinned === undefined &&
      !Object.prototype.hasOwnProperty.call(body, 'mutedUntil')
    ) {
      throw new BadRequestException(
        'archived, isPinned or mutedUntil must be provided.',
      );
    }

    const nextConversation: StoredConversation = {
      ...current,
      isPinned: isPinned ?? current.isPinned ?? false,
      archivedAt:
        archived === undefined
          ? (current.archivedAt ?? null)
          : archived
            ? nowIso()
            : null,
      mutedUntil,
      updatedAt: nowIso(),
    };

    await this.repository.put(
      this.config.dynamodbConversationsTableName,
      nextConversation,
    );
    this.conversationDispatchService.emitConversationSummaryUpdated(
      createUlid(),
      actor.id,
      access.conversationKey,
      nextConversation,
      'conversation.preferences.updated',
      nextConversation.updatedAt,
    );

    return this.serializeConversationSummary(actor.id, nextConversation);
  }

  async resolveConversationAccess(
    actor: AuthenticatedUser,
    conversationId: string,
    requireSendAccess = false,
  ): Promise<ResolvedConversationAccess> {
    const conversationKey = await this.normalizeConversationId(
      actor,
      conversationId,
    );
    const participants = await this.resolveConversationParticipants(
      actor,
      conversationKey,
      requireSendAccess,
    );

    return {
      conversationId: this.toPublicConversationId(actor.id, conversationKey),
      conversationKey,
      participants,
      isGroup: isGroupConversationId(conversationKey),
    };
  }

  async listMessages(
    actor: AuthenticatedUser,
    conversationId: string,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<MessageItem[], ApiResponseMeta>> {
    const access = await this.resolveConversationAccess(actor, conversationId);
    const keyword = optionalQueryString(query.q, 'q')?.toLowerCase();
    const type = parseEnumQuery(query.type, 'type', MESSAGE_TYPES);
    const fromUserId = optionalQueryString(query.fromUserId, 'fromUserId');
    const before = parseIsoDateQuery(query.before, 'before');
    const after = parseIsoDateQuery(query.after, 'after');
    const limit = parseLimit(query.limit);
    const items = await this.repository.queryByPk<StoredMessage>(
      this.config.dynamodbMessagesTableName,
      makeConversationPk(access.conversationKey),
      {
        beginsWith: 'MSG#',
      },
    );
    const filtered = items.filter((item) => {
      if (item.deletedAt) {
        return false;
      }

      if (type && item.type !== type) {
        return false;
      }

      if (fromUserId && item.senderId !== fromUserId) {
        return false;
      }

      if (before && item.sentAt >= before) {
        return false;
      }

      if (after && item.sentAt <= after) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        item.senderName,
        this.buildPreview(item),
        item.attachmentUrl ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
    const page = paginateSortedItems(
      filtered,
      limit,
      query.cursor,
      (item) => item.sentAt,
      (item) => item.messageId,
    );
    const deliveryContext = await this.buildMessageDeliveryContext(
      access.participants,
      access.conversationKey,
    );

    return buildPaginatedResponse(
      page.items.map((item) =>
        this.serializeMessage(actor.id, item, deliveryContext),
      ),
      page.nextCursor,
    );
  }

  async sendMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    payload: unknown,
  ): Promise<MessageItem> {
    const access = await this.resolveConversationAccess(
      actor,
      conversationId,
      true,
    );

    return this.createMessage(
      actor,
      access.conversationKey,
      access.participants,
      payload,
    );
  }

  async sendDirectMessage(
    actor: AuthenticatedUser,
    payload: unknown,
  ): Promise<MessageItem> {
    const body = ensureObject(payload);
    const targetUserId = requiredString(body, 'targetUserId', {
      minLength: 5,
      maxLength: 50,
    });
    const targetUser = await this.usersService.getByIdOrThrow(targetUserId);

    if (targetUser.userId === actor.id) {
      throw new BadRequestException('Cannot create DM with yourself.');
    }

    const conversationId = makeDmConversationId(actor.id, targetUser.userId);
    return this.createMessage(
      actor,
      conversationId,
      [actor.id, targetUser.userId],
      body,
    );
  }

  async markAsRead(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<ConversationSummary> {
    const access = await this.resolveConversationAccess(actor, conversationId);
    const existingConversation =
      await this.conversationSummaryService.getConversationSummary(
        actor.id,
        access.conversationKey,
      );
    const updatedAt = nowIso();
    let nextConversation = existingConversation;

    if (!nextConversation) {
      const activeMessages =
        await this.conversationSummaryService.listActiveMessages(
          access.conversationKey,
        );
      const latestMessage = activeMessages[0];

      if (!latestMessage) {
        throw new NotFoundException('Conversation not found.');
      }

      const labelMap =
        await this.conversationSummaryService.getConversationLabelMap(
          access.conversationKey,
          access.participants,
        );
      const kind = getConversationKind(access.conversationKey);

      nextConversation = {
        PK: makeInboxPk(actor.id),
        SK: makeConversationSummarySk(
          access.conversationKey,
          latestMessage.sentAt,
        ),
        entityType: 'CONVERSATION',
        GSI1PK: makeInboxStatsKey(actor.id, kind),
        userId: actor.id,
        conversationId: access.conversationKey,
        groupName: labelMap.get(actor.id) ?? actor.fullName,
        lastMessagePreview: this.buildPreview(latestMessage),
        lastSenderName: latestMessage.senderName,
        unreadCount: 0,
        isGroup: access.isGroup,
        isPinned: false,
        archivedAt: null,
        mutedUntil: null,
        deletedAt: null,
        updatedAt,
        lastReadAt: latestMessage.sentAt,
      } satisfies StoredConversation;
    } else {
      nextConversation = {
        ...nextConversation,
        unreadCount: 0,
        lastReadAt:
          this.getConversationLastMessageSentAt(nextConversation) ??
          nextConversation.lastReadAt ??
          updatedAt,
        updatedAt,
      };
    }

    const outboxRecord = this.chatOutboxService.buildChatOutboxEvent({
      actorUserId: actor.id,
      conversationId: access.conversationKey,
      eventName: 'conversation.read',
      occurredAt: nextConversation.updatedAt,
    });

    await this.repository.transactPut([
      {
        tableName: this.config.dynamodbConversationsTableName,
        item: nextConversation,
      },
      {
        tableName: this.config.dynamodbConversationsTableName,
        item: outboxRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);
    await this.conversationDispatchService.emitConversationRead(
      outboxRecord.eventId,
      actor.id,
      access.conversationKey,
      access.participants,
      nextConversation,
    );
    await this.chatOutboxService
      .deleteChatOutboxEvent(outboxRecord)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          'Failed to delete chat outbox event ' +
            outboxRecord.eventId +
            ': ' +
            message,
        );
      });
    return this.serializeConversationSummary(actor.id, nextConversation);
  }

  async deleteConversation(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<DeletedConversationResult> {
    const conversationKey = await this.normalizeConversationIdForInboxOperation(
      actor,
      conversationId,
    );
    const current =
      await this.conversationSummaryService.getConversationSummary(
        actor.id,
        conversationKey,
      );
    const removedAt = nowIso();

    if (current && !current.deletedAt) {
      await this.repository.delete(
        this.config.dynamodbConversationsTableName,
        current.PK,
        current.SK,
      );
    }

    this.chatRealtimeService.leaveConversationForUser(
      actor.id,
      conversationKey,
    );
    this.conversationDispatchService.emitConversationRemoved(
      createUlid(),
      actor.id,
      conversationKey,
      removedAt,
      'conversation.deleted',
    );

    return {
      conversationId: this.toPublicConversationId(actor.id, conversationKey),
      removedAt,
    };
  }
  async updateMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    payload: unknown,
  ): Promise<MessageItem> {
    const access = await this.resolveConversationAccess(actor, conversationId);
    const message = await this.getMessageOrThrow(
      access.conversationKey,
      messageId,
    );
    this.ensureCanMutateMessage(actor, message, 'edit');

    if (message.deletedAt) {
      throw new BadRequestException('Message has already been deleted.');
    }

    const body = ensureObject(payload);
    const hasContentField = Object.prototype.hasOwnProperty.call(
      body,
      'content',
    );
    const hasAttachmentField = Object.prototype.hasOwnProperty.call(
      body,
      'attachmentUrl',
    );

    if (!hasContentField && !hasAttachmentField) {
      throw new BadRequestException(
        'content or attachmentUrl must be provided.',
      );
    }

    const nextRawContent = hasContentField
      ? (optionalString(body, 'content', {
          allowEmpty: true,
          maxLength: 4000,
        }) ?? '')
      : message.content;
    const nextAttachmentUrlInput = hasAttachmentField
      ? optionalString(body, 'attachmentUrl', {
          allowEmpty: true,
          maxLength: 500,
        })
      : message.attachmentUrl;
    const nextAttachmentUrl = hasAttachmentField
      ? nextAttachmentUrlInput || undefined
      : message.attachmentUrl;
    const messageType = this.asSupportedMessageType(message.type);
    const nextContent = hasContentField
      ? this.normalizeStoredContent(messageType, nextRawContent)
      : message.content;

    if (
      !this.hasMeaningfulMessageBody(
        messageType,
        nextContent,
        nextAttachmentUrl,
      )
    ) {
      throw new BadRequestException('content or attachmentUrl is required.');
    }

    if (
      nextContent === message.content &&
      nextAttachmentUrl === message.attachmentUrl
    ) {
      return this.serializeMessage(actor.id, message);
    }

    const nextMessage: StoredMessage = {
      ...message,
      content: nextContent,
      attachmentUrl: nextAttachmentUrl,
      updatedAt: nowIso(),
    };
    const outboxRecord = this.chatOutboxService.buildChatOutboxEvent({
      actorUserId: actor.id,
      conversationId: access.conversationKey,
      eventName: 'message.updated',
      messageId,
      occurredAt: nextMessage.updatedAt,
    });
    const auditRecord = this.auditTrailService.buildConversationEvent({
      action: 'MESSAGE_UPDATED',
      actorUserId: actor.id,
      conversationId: access.conversationKey,
      messageId,
      occurredAt: nextMessage.updatedAt,
      summary: `${actor.fullName} updated a message.`,
      metadata: { type: nextMessage.type },
    });

    await this.repository.transactPut([
      {
        tableName: this.config.dynamodbMessagesTableName,
        item: nextMessage,
        conditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      },
      {
        tableName: this.config.dynamodbConversationsTableName,
        item: outboxRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        tableName: this.config.dynamodbConversationsTableName,
        item: auditRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);
    const syncResult =
      await this.conversationSummaryService.syncConversationSummariesAfterMessageMutation(
        access,
      );
    this.conversationDispatchService.emitMessageUpdated(
      outboxRecord.eventId,
      actor.id,
      nextMessage,
      access.conversationKey,
      syncResult,
    );
    await this.chatOutboxService
      .deleteChatOutboxEvent(outboxRecord)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          `Failed to delete chat outbox event ${outboxRecord.eventId}: ${message}`,
        );
      });
    return this.serializeMessage(actor.id, nextMessage, {
      participantIds: syncResult.participantIds,
      summariesByUser: syncResult.summariesByUser,
    });
  }

  async deleteMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ): Promise<MessageItem> {
    const access = await this.resolveConversationAccess(actor, conversationId);
    const message = await this.getMessageOrThrow(
      access.conversationKey,
      messageId,
    );
    this.ensureCanMutateMessage(actor, message, 'delete');

    if (message.deletedAt) {
      return this.serializeMessage(actor.id, message);
    }

    const deletedAt = nowIso();
    const nextMessage: StoredMessage = {
      ...message,
      deletedAt,
      updatedAt: deletedAt,
    };
    const outboxRecord = this.chatOutboxService.buildChatOutboxEvent({
      actorUserId: actor.id,
      conversationId: access.conversationKey,
      eventName: 'message.deleted',
      messageId,
      occurredAt: deletedAt,
    });
    const auditRecord = this.auditTrailService.buildConversationEvent({
      action: 'MESSAGE_DELETED',
      actorUserId: actor.id,
      conversationId: access.conversationKey,
      messageId,
      occurredAt: deletedAt,
      summary: `${actor.fullName} deleted a message.`,
      metadata: { type: nextMessage.type },
    });

    await this.repository.transactPut([
      {
        tableName: this.config.dynamodbMessagesTableName,
        item: nextMessage,
        conditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      },
      {
        tableName: this.config.dynamodbConversationsTableName,
        item: outboxRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        tableName: this.config.dynamodbConversationsTableName,
        item: auditRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);
    const syncResult =
      await this.conversationSummaryService.syncConversationSummariesAfterMessageMutation(
        access,
      );
    this.conversationDispatchService.emitMessageDeleted(
      outboxRecord.eventId,
      actor.id,
      nextMessage,
      access.conversationKey,
      syncResult,
    );
    await this.chatOutboxService
      .deleteChatOutboxEvent(outboxRecord)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          `Failed to delete chat outbox event ${outboxRecord.eventId}: ${message}`,
        );
      });
    return this.serializeMessage(actor.id, nextMessage, {
      participantIds: syncResult.participantIds,
      summariesByUser: syncResult.summariesByUser,
    });
  }

  private async createMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    participants: string[],
    payload: unknown,
  ): Promise<MessageItem> {
    const body = ensureObject(payload);
    const type: SupportedMessageType =
      optionalEnum(body, 'type', MESSAGE_TYPES) ?? 'TEXT';
    const rawContent =
      optionalString(body, 'content', { allowEmpty: true, maxLength: 4000 }) ??
      '';
    const attachmentUrl = optionalString(body, 'attachmentUrl', {
      maxLength: 500,
    });
    const replyTo = optionalString(body, 'replyTo', { maxLength: 50 });
    const clientMessageId = optionalString(body, 'clientMessageId', {
      maxLength: 100,
    });

    if (!rawContent && !attachmentUrl) {
      throw new BadRequestException('content or attachmentUrl is required.');
    }

    if (clientMessageId) {
      const existingMessage = await this.findMessageByClientMessageId(
        conversationId,
        actor.id,
        clientMessageId,
      );

      if (existingMessage) {
        return this.serializeMessage(actor.id, existingMessage);
      }
    }

    await this.ensureReplyTargetAvailable(conversationId, replyTo);
    this.chatRateLimitService.consumeMessageSend(actor.id);

    const content = this.normalizeStoredContent(type, rawContent);
    const sentAt = nowIso();
    const messageId = createUlid();
    const message: StoredMessage = {
      PK: makeConversationPk(conversationId),
      SK: makeMessageSk(sentAt, messageId),
      entityType: 'MESSAGE',
      messageId,
      conversationId,
      senderId: actor.id,
      senderName: actor.fullName,
      senderAvatarUrl: actor.avatarUrl,
      type,
      content,
      attachmentUrl,
      replyTo,
      deletedAt: null,
      sentAt,
      updatedAt: sentAt,
    };
    const messageRefRecord = this.buildMessageReferenceRecord(
      conversationId,
      message,
    );
    const dedupRecord = clientMessageId
      ? this.buildMessageDedupRecord(
          conversationId,
          actor.id,
          clientMessageId,
          message,
        )
      : undefined;
    const outboxRecord = this.chatOutboxService.buildChatOutboxEvent({
      actorUserId: actor.id,
      clientMessageId,
      conversationId,
      eventName: 'message.created',
      messageId,
      occurredAt: sentAt,
    });
    const auditRecord = this.auditTrailService.buildConversationEvent({
      action: 'MESSAGE_CREATED',
      actorUserId: actor.id,
      conversationId,
      messageId,
      occurredAt: sentAt,
      summary: `${actor.fullName} sent a ${type.toLowerCase()} message.`,
      metadata: { replyTo: replyTo ?? '', type },
    });
    const pushRecord = this.buildChatPushOutboxEvent(
      actor,
      conversationId,
      participants,
      message,
    );
    const transactionItems: Array<{
      tableName: string;
      item:
        | StoredChatOutboxEvent
        | StoredConversationAuditEvent
        | StoredMessage
        | StoredMessageRef
        | StoredMessageDedup
        | StoredPushOutboxEvent;
      conditionExpression: string;
    }> = [
      {
        tableName: this.config.dynamodbMessagesTableName,
        item: message,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        tableName: this.config.dynamodbMessagesTableName,
        item: messageRefRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        tableName: this.config.dynamodbConversationsTableName,
        item: outboxRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        tableName: this.config.dynamodbConversationsTableName,
        item: auditRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ];

    if (dedupRecord) {
      transactionItems.push({
        tableName: this.config.dynamodbMessagesTableName,
        item: dedupRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      });
    }

    if (pushRecord) {
      transactionItems.push({
        tableName: this.config.dynamodbUsersTableName,
        item: pushRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      });
    }

    try {
      await this.repository.transactPut(transactionItems);
    } catch (error) {
      if (clientMessageId && this.isDuplicateClientMessageError(error)) {
        const existingMessage = await this.findMessageByClientMessageId(
          conversationId,
          actor.id,
          clientMessageId,
        );

        if (existingMessage) {
          return this.serializeMessage(actor.id, existingMessage);
        }

        throw new ConflictException(
          'Message retry detected but the original message could not be resolved.',
        );
      }

      throw error;
    }

    const summariesByUser =
      await this.conversationSummaryService.upsertConversationSummaries(
        conversationId,
        participants,
        message,
      );
    this.conversationDispatchService.emitMessageCreated(
      outboxRecord.eventId,
      actor.id,
      message,
      participants,
      summariesByUser,
      clientMessageId,
    );
    await this.chatOutboxService
      .deleteChatOutboxEvent(outboxRecord)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          `Failed to delete chat outbox event ${outboxRecord.eventId}: ${message}`,
        );
      });

    return this.serializeMessage(actor.id, message, {
      participantIds: participants,
      summariesByUser,
    });
  }

  private async ensureReplyTargetAvailable(
    conversationId: string,
    replyTo?: string,
  ): Promise<void> {
    if (!replyTo) {
      return;
    }

    const normalizedReplyTo = replyTo.trim();

    if (
      this.isReplyTargetConversationReference(conversationId, normalizedReplyTo)
    ) {
      throw new BadRequestException(
        'replyTo must be the message id returned by the API, not groupId or conversationId.',
      );
    }

    const replyTarget = await this.findMessageById(
      conversationId,
      normalizedReplyTo,
    );

    if (!replyTarget || replyTarget.deletedAt) {
      throw new BadRequestException(
        'replyTo message does not exist in this conversation. Pass message.id from GET /messages or a previous send response.',
      );
    }
  }

  private buildMessageReferenceRecord(
    conversationId: string,
    message: StoredMessage,
  ): StoredMessageRef {
    return {
      PK: makeConversationPk(conversationId),
      SK: this.makeMessageReferenceSk(message.messageId),
      entityType: 'MESSAGE_REF',
      conversationId,
      messageId: message.messageId,
      messageSk: message.SK,
      senderId: message.senderId,
      sentAt: message.sentAt,
      updatedAt: message.updatedAt,
    };
  }

  private buildMessageDedupRecord(
    conversationId: string,
    senderId: string,
    clientMessageId: string,
    message: StoredMessage,
  ): StoredMessageDedup {
    return {
      PK: makeConversationPk(conversationId),
      SK: this.makeClientMessageDedupSk(senderId, clientMessageId),
      entityType: 'MESSAGE_DEDUP',
      conversationId,
      senderId,
      clientMessageId,
      messageId: message.messageId,
      messageSk: message.SK,
      sentAt: message.sentAt,
      updatedAt: message.updatedAt,
    };
  }

  private async findMessageById(
    conversationId: string,
    messageId: string,
  ): Promise<StoredMessage | undefined> {
    const normalizedMessageId = messageId.trim();
    const conversationPk = makeConversationPk(conversationId);
    const messageRef = await this.repository.get<StoredMessageRef>(
      this.config.dynamodbMessagesTableName,
      conversationPk,
      this.makeMessageReferenceSk(normalizedMessageId),
    );

    if (messageRef) {
      return this.repository.get<StoredMessage>(
        this.config.dynamodbMessagesTableName,
        conversationPk,
        messageRef.messageSk,
      );
    }

    const messages = await this.repository.queryByPk<StoredMessage>(
      this.config.dynamodbMessagesTableName,
      conversationPk,
      {
        beginsWith: 'MSG#',
      },
    );
    const matchedMessage = messages.find(
      (message) => message.messageId === normalizedMessageId,
    );

    if (!matchedMessage) {
      return undefined;
    }

    await this.repository.put(
      this.config.dynamodbMessagesTableName,
      this.buildMessageReferenceRecord(conversationId, matchedMessage),
    );

    return matchedMessage;
  }

  private async findMessageByClientMessageId(
    conversationId: string,
    senderId: string,
    clientMessageId: string,
  ): Promise<StoredMessage | undefined> {
    const dedupRecord = await this.repository.get<StoredMessageDedup>(
      this.config.dynamodbMessagesTableName,
      makeConversationPk(conversationId),
      this.makeClientMessageDedupSk(senderId, clientMessageId),
    );

    if (!dedupRecord) {
      return undefined;
    }

    return this.repository.get<StoredMessage>(
      this.config.dynamodbMessagesTableName,
      dedupRecord.PK,
      dedupRecord.messageSk,
    );
  }

  private async getMessageOrThrow(
    conversationId: string,
    messageId: string,
  ): Promise<StoredMessage> {
    const message = await this.findMessageById(conversationId, messageId);

    if (!message) {
      throw new NotFoundException('Message not found.');
    }

    return message;
  }

  private ensureCanMutateMessage(
    actor: AuthenticatedUser,
    message: StoredMessage,
    action: 'edit' | 'delete',
  ): void {
    if (
      actor.id === message.senderId ||
      this.authorizationService.isAdmin(actor)
    ) {
      return;
    }

    throw new ForbiddenException(`You cannot ${action} this message.`);
  }

  private computeUnreadCount(
    participantId: string,
    messages: StoredMessage[],
    lastReadAt: string | null,
  ): number {
    return this.conversationStateService.computeUnreadCount(
      participantId,
      messages,
      lastReadAt,
    );
  }

  private resolveStoredLastReadAt(
    conversation: StoredConversation | undefined,
    fallbackSentAt?: string,
  ): string | null {
    return this.conversationStateService.resolveStoredLastReadAt(
      conversation,
      fallbackSentAt,
    );
  }

  private getConversationLastMessageSentAt(
    conversation: StoredConversation,
  ): string | null {
    return this.conversationStateService.getConversationLastMessageSentAt(
      conversation,
    );
  }

  private hasConversationSummaryChanged(
    current: StoredConversation | undefined,
    next: StoredConversation,
  ): boolean {
    return this.conversationStateService.hasConversationSummaryChanged(
      current,
      next,
    );
  }

  private hasMeaningfulMessageBody(
    type: SupportedMessageType,
    content: string,
    attachmentUrl?: string,
  ): boolean {
    return this.conversationStateService.hasMeaningfulMessageBody(
      type,
      content,
      attachmentUrl,
    );
  }

  private asSupportedMessageType(type: unknown): SupportedMessageType {
    if (typeof type !== 'string') {
      throw new BadRequestException('message type is invalid.');
    }

    if (!MESSAGE_TYPES.includes(type as SupportedMessageType)) {
      throw new BadRequestException('message type is invalid.');
    }

    return type as SupportedMessageType;
  }

  private isReplyTargetConversationReference(
    conversationId: string,
    replyTo: string,
  ): boolean {
    if (
      replyTo === conversationId ||
      /^group:/i.test(replyTo) ||
      /^dm:/i.test(replyTo) ||
      /^user:/i.test(replyTo) ||
      /^grp#/i.test(replyTo) ||
      /^dm#/i.test(replyTo)
    ) {
      return true;
    }

    if (isGroupConversationId(conversationId)) {
      return replyTo === conversationId.slice('GRP#'.length);
    }

    if (isDmConversationId(conversationId)) {
      const participantIds = conversationId.slice('DM#'.length).split('#');
      return participantIds.includes(replyTo);
    }

    return false;
  }

  private makeMessageReferenceSk(messageId: string): string {
    return `MSGREF#${messageId}`;
  }

  private makeClientMessageDedupSk(
    senderId: string,
    clientMessageId: string,
  ): string {
    return `CLIENT#${senderId}#${clientMessageId}`;
  }

  private isDuplicateClientMessageError(error: unknown): boolean {
    const messages = [this.errorText(error)];
    const cause = error instanceof Error ? error.cause : undefined;

    messages.push(this.errorText(cause));

    if (cause && typeof cause === 'object' && 'name' in cause) {
      const causeName = (cause as { name?: unknown }).name;

      if (typeof causeName === 'string') {
        messages.push(causeName);
      }
    }

    return messages.some((message) =>
      /conditionalcheckfailed|transactioncanceledexception|transaction cancelled/i.test(
        message,
      ),
    );
  }

  private errorText(value: unknown): string {
    if (value instanceof Error) {
      return value.message;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    return '';
  }

  private async normalizeConversationIdForInboxOperation(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<string> {
    const rawConversationId = conversationId.trim();

    if (!rawConversationId) {
      throw new BadRequestException('Conversation id is required.');
    }

    if (/^grp#/i.test(rawConversationId)) {
      return `GRP#${rawConversationId.slice('GRP#'.length)}`;
    }

    if (/^dm#/i.test(rawConversationId)) {
      return `DM#${rawConversationId.slice('DM#'.length)}`;
    }

    if (rawConversationId === 'GRP' || rawConversationId === 'DM') {
      throw new BadRequestException(
        'Conversation id is incomplete. Use group:<groupId> or dm:<userId>, or URL-encode legacy ids.',
      );
    }

    const groupMatch = rawConversationId.match(/^(?:group|grp)[:/](.+)$/i);
    if (groupMatch) {
      const groupId = groupMatch[1]?.trim();

      if (!groupId) {
        throw new BadRequestException('Group conversation id is missing.');
      }

      return `GRP#${groupId}`;
    }

    const dmMatch = rawConversationId.match(/^(?:dm|user)[:/](.+)$/i);
    if (dmMatch) {
      const targetUserId = dmMatch[1]?.trim();

      if (!targetUserId) {
        throw new BadRequestException(
          'Direct conversation user id is missing.',
        );
      }

      if (targetUserId === actor.id) {
        throw new BadRequestException('Cannot create DM with yourself.');
      }

      return makeDmConversationId(actor.id, targetUserId);
    }

    return this.normalizeConversationId(actor, rawConversationId);
  }

  private async normalizeConversationId(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<string> {
    const rawConversationId = conversationId.trim();

    if (!rawConversationId) {
      throw new BadRequestException('Conversation id is required.');
    }

    if (/^grp#/i.test(rawConversationId)) {
      return `GRP#${rawConversationId.slice('GRP#'.length)}`;
    }

    if (/^dm#/i.test(rawConversationId)) {
      return `DM#${rawConversationId.slice('DM#'.length)}`;
    }

    if (rawConversationId === 'GRP' || rawConversationId === 'DM') {
      throw new BadRequestException(
        'Conversation id is incomplete. Use group:<groupId> or dm:<userId>, or URL-encode legacy ids.',
      );
    }

    const groupMatch = rawConversationId.match(/^(?:group|grp)[:/](.+)$/i);
    if (groupMatch) {
      return this.normalizeGroupConversationId(actor, groupMatch[1]?.trim());
    }

    const dmMatch = rawConversationId.match(/^(?:dm|user)[:/](.+)$/i);
    if (dmMatch) {
      return this.normalizeDmConversationId(actor, dmMatch[1]?.trim());
    }

    try {
      return await this.normalizeGroupConversationId(actor, rawConversationId);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }

    try {
      return await this.normalizeDmConversationId(actor, rawConversationId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException('Unsupported conversation id.');
      }

      throw error;
    }
  }

  private async normalizeGroupConversationId(
    actor: AuthenticatedUser,
    groupId: string | undefined,
  ): Promise<string> {
    if (!groupId) {
      throw new BadRequestException('Group conversation id is missing.');
    }

    await this.groupsService.getGroup(actor, groupId);
    return `GRP#${groupId}`;
  }

  private async normalizeDmConversationId(
    actor: AuthenticatedUser,
    targetUserId: string | undefined,
  ): Promise<string> {
    if (!targetUserId) {
      throw new BadRequestException('Direct conversation user id is missing.');
    }

    const targetUser = await this.usersService.getByIdOrThrow(targetUserId);

    if (targetUser.userId === actor.id) {
      throw new BadRequestException('Cannot create DM with yourself.');
    }

    return makeDmConversationId(actor.id, targetUser.userId);
  }

  private async buildMessageDeliveryContext(
    participantIds: string[],
    conversationId: string,
  ): Promise<MessageDeliveryContext> {
    const summariesByUser = new Map<string, StoredConversation>();

    for (const participantId of participantIds) {
      const summary =
        await this.conversationSummaryService.getConversationSummary(
          participantId,
          conversationId,
        );

      if (summary && !summary.deletedAt) {
        summariesByUser.set(participantId, summary);
      }
    }

    return {
      participantIds,
      summariesByUser,
    };
  }

  private getMessageDeliveryState(
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
    return this.conversationStateService.getMessageDeliveryState(
      message,
      context,
    );
  }

  private serializeConversationSummary(
    actorId: string,
    conversation: StoredConversation,
  ): ConversationSummary {
    return this.conversationStateService.serializeConversationSummary(
      actorId,
      conversation,
    );
  }

  private serializeMessage(
    actorId: string,
    message: StoredMessage,
    deliveryContext?: MessageDeliveryContext,
  ): MessageItem {
    return this.conversationStateService.serializeMessage(
      actorId,
      message,
      deliveryContext,
    );
  }

  private toPublicConversationId(
    actorId: string,
    conversationId: string,
  ): string {
    return this.conversationStateService.toPublicConversationId(
      actorId,
      conversationId,
    );
  }

  private normalizeStoredContent(
    type: SupportedMessageType,
    rawContent: string,
  ): string {
    return this.conversationStateService.normalizeStoredContent(
      type,
      rawContent,
    );
  }

  private usesStructuredContent(type: SupportedMessageType): boolean {
    return this.conversationStateService.usesStructuredContent(type);
  }

  private tryParseStructuredContent(
    rawContent: string,
  ):
    | (Record<string, unknown> & { text: string; mention: unknown[] })
    | undefined {
    return this.conversationStateService.tryParseStructuredContent(rawContent);
  }

  private buildChatPushOutboxEvent(
    actor: AuthenticatedUser,
    conversationId: string,
    participants: string[],
    message: StoredMessage,
  ): StoredPushOutboxEvent | undefined {
    const recipients = participants.filter(
      (participantId) => participantId !== actor.id,
    );

    if (recipients.length === 0) {
      return undefined;
    }

    const preview = this.buildPreview(message) || 'New message';

    return this.pushNotificationService.buildPushOutboxEvent({
      actorUserId: actor.id,
      eventName: 'chat.message.created',
      recipientUserIds: recipients,
      title: isGroupConversationId(conversationId)
        ? `New message from ${actor.fullName}`
        : actor.fullName,
      body: preview,
      conversationId,
      messageId: message.messageId,
      data: {
        conversationId,
        conversationKind: getConversationKind(conversationId),
        messageId: message.messageId,
        senderId: actor.id,
      },
      occurredAt: message.sentAt,
    });
  }

  private extractPreviewText(rawContent: string): string | undefined {
    return this.conversationStateService.extractPreviewText(rawContent);
  }

  private buildPreview(message: StoredMessage): string {
    return this.conversationStateService.buildPreview(message);
  }

  private async resolveConversationParticipants(
    actor: AuthenticatedUser,
    conversationId: string,
    requireSendAccess = false,
  ): Promise<string[]> {
    if (isGroupConversationId(conversationId)) {
      const groupId = conversationId.slice('GRP#'.length);
      await this.groupsService.getGroup(actor, groupId);
      const actorMembership = await this.groupsService.getMembership(
        groupId,
        actor.id,
      );

      if (
        requireSendAccess &&
        (!actorMembership || actorMembership.deletedAt) &&
        actor.role !== 'ADMIN'
      ) {
        throw new ForbiddenException(
          'Only active members can send messages to this group.',
        );
      }

      const members = await this.groupsService.listMembers(actor, groupId);
      return members.map((member) => member.userId);
    }

    if (!isDmConversationId(conversationId)) {
      throw new BadRequestException('Unsupported conversation id.');
    }

    const participantIds = conversationId.slice('DM#'.length).split('#');

    if (participantIds.length !== 2) {
      throw new BadRequestException('Invalid DM conversation id.');
    }

    if (
      !this.authorizationService.canAccessDirectConversation(
        actor,
        participantIds,
      )
    ) {
      throw new ForbiddenException('You cannot access this conversation.');
    }

    return participantIds;
  }
}
