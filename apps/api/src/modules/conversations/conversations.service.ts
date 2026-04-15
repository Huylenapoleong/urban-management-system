import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CHAT_SOCKET_EVENTS,
  MESSAGE_RECALL_SCOPES,
  MESSAGE_TYPES,
} from '@urban/shared-constants';
import type {
  ApiResponseMeta,
  ApiSuccessResponse,
  AuditEventItem,
  AuthenticatedUser,
  ConversationSummary,
  MediaAsset,
  MessageItem,
  MessageReplyReference,
  RecallMessageResult,
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
  StoredDirectMessageRequest,
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
import { MediaAssetService } from '../../infrastructure/storage/media-asset.service';
import { S3StorageService } from '../../infrastructure/storage/s3-storage.service';
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

type DirectMessageRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IGNORED'
  | 'REJECTED'
  | 'BLOCKED';

type DirectMessageRequestDirection = 'INCOMING' | 'OUTGOING';

const DIRECT_MESSAGE_REQUEST_STATUS_VALUES: DirectMessageRequestStatus[] = [
  'PENDING',
  'ACCEPTED',
  'IGNORED',
  'REJECTED',
  'BLOCKED',
];
const DIRECT_MESSAGE_REQUEST_DIRECTION_VALUES: DirectMessageRequestDirection[] =
  ['INCOMING', 'OUTGOING'];

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
    private readonly mediaAssetService: MediaAssetService,
    private readonly s3StorageService: S3StorageService,
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

    // Deduplicate by conversationId (to handle legacy data or race-condition duplicates)
    const uniqueItemsMap = new Map<string, StoredConversation>();
    for (const item of items) {
      const existing = uniqueItemsMap.get(item.conversationId);
      if (!existing || item.updatedAt > existing.updatedAt) {
        uniqueItemsMap.set(item.conversationId, item);
      }
    }
    const deduplicatedItems = Array.from(uniqueItemsMap.values());

    const filtered = deduplicatedItems.filter((item) => {
      if (item.deletedAt) {
        return false;
      }

      if (item.requestStatus) {
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

  async listDirectRequests(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<ConversationSummary[], ApiResponseMeta>> {
    const directionRaw = optionalQueryString(query.direction, 'direction');
    const statusRaw = optionalQueryString(
      query.status,
      'status',
    )?.toUpperCase();
    const direction = directionRaw
      ? this.parseDirectMessageRequestDirection(directionRaw)
      : undefined;
    const status = statusRaw
      ? this.parseDirectMessageRequestStatus(statusRaw)
      : 'PENDING';
    const limit = parseLimit(query.limit);
    const items = await this.repository.queryByPk<StoredConversation>(
      this.config.dynamodbConversationsTableName,
      makeInboxPk(actor.id),
      {
        beginsWith: 'CONV#',
      },
    );
    const filtered = items.filter((item) => {
      if (item.deletedAt || !item.requestStatus) {
        return false;
      }

      if (item.requestStatus !== status) {
        return false;
      }

      if (direction && item.requestDirection !== direction) {
        return false;
      }

      return true;
    });
    const page = paginateSortedItems(
      filtered,
      limit,
      query.cursor,
      (item) => item.updatedAt,
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

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbConversationsTableName,
          item: nextConversation,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': current.updatedAt,
          },
        },
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException(
          'Conversation preferences changed. Please retry.',
        );
      }

      throw error;
    }

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
      if (
        !this.conversationStateService.isMessageVisibleToUser(item, actor.id)
      ) {
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
        item.attachmentAsset?.key ?? '',
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
      await Promise.all(
        page.items.map((item) =>
          this.serializeMessage(actor.id, item, deliveryContext),
        ),
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
      access.conversationId,
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
    const targetUser =
      await this.usersService.getActiveByIdOrThrow(targetUserId);

    if (targetUser.userId === actor.id) {
      throw new BadRequestException('Cannot create DM with yourself.');
    }

    const conversationId = makeDmConversationId(actor.id, targetUser.userId);

    if (
      !(await this.canAccessDmConversation(actor, targetUser, conversationId))
    ) {
      throw new ForbiddenException('You cannot access this conversation.');
    }
    await this.ensureCanSendCitizenDirectMessage(
      actor,
      targetUser,
      conversationId,
    );

    return this.createMessage(
      actor,
      conversationId,
      this.toPublicConversationId(actor.id, conversationId),
      [actor.id, targetUser.userId],
      body,
    );
  }

  async createDirectMessageRequest(
    actor: AuthenticatedUser,
    payload: unknown,
  ): Promise<ConversationSummary> {
    const body = ensureObject(payload);
    const targetUserId = requiredString(body, 'targetUserId', {
      minLength: 5,
      maxLength: 50,
    });
    const targetUser =
      await this.usersService.getActiveByIdOrThrow(targetUserId);

    if (targetUser.userId === actor.id) {
      throw new BadRequestException('Cannot create DM with yourself.');
    }

    this.ensureDirectMessageRequestPair(actor, targetUser);

    const conversationId = makeDmConversationId(actor.id, targetUser.userId);
    await this.ensureCanCreateDirectMessageRequest(
      actor,
      targetUser,
      conversationId,
    );

    const clientMessageId = optionalString(body, 'clientMessageId', {
      maxLength: 100,
    });
    const rawContent =
      optionalString(body, 'content', { allowEmpty: false, maxLength: 4000 }) ??
      '';

    if (clientMessageId) {
      const existingMessage = await this.findMessageByClientMessageId(
        conversationId,
        actor.id,
        clientMessageId,
      );

      if (existingMessage) {
        const existingSummary =
          await this.conversationSummaryService.getConversationSummary(
            actor.id,
            conversationId,
          );

        if (existingSummary) {
          return this.serializeConversationSummary(actor.id, existingSummary);
        }
      }
    }

    this.chatRateLimitService.consumeMessageSend(actor.id);

    const content = this.normalizeStoredContent('TEXT', rawContent);
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
      senderAvatarAsset: actor.avatarAsset,
      senderAvatarUrl: actor.avatarUrl,
      type: 'TEXT',
      content,
      attachmentAsset: undefined,
      attachmentUrl: undefined,
      replyTo: undefined,
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
    const requestRecord = this.buildDirectMessageRequestRecord({
      conversationId,
      requesterUserId: actor.id,
      targetUserId: targetUser.userId,
      status: 'PENDING',
      occurredAt: sentAt,
    });
    const transactionItems: Array<{
      tableName: string;
      item:
        | StoredMessage
        | StoredMessageRef
        | StoredMessageDedup
        | StoredDirectMessageRequest;
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
        item: requestRecord,
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

    try {
      await this.repository.transactPut(transactionItems);
    } catch (error) {
      if (clientMessageId && this.isDuplicateClientMessageError(error)) {
        const existingSummary =
          await this.conversationSummaryService.getConversationSummary(
            actor.id,
            conversationId,
          );

        if (existingSummary) {
          return this.serializeConversationSummary(actor.id, existingSummary);
        }
      }

      throw error;
    }

    const summariesByUser = await this.upsertDirectRequestSummaries(
      conversationId,
      [actor.id, targetUser.userId],
      message,
      {
        [actor.id]: {
          requestStatus: 'PENDING',
          requestDirection: 'OUTGOING',
          requestRequestedAt: sentAt,
          requestRespondedAt: null,
          requestRespondedByUserId: null,
        },
        [targetUser.userId]: {
          requestStatus: 'PENDING',
          requestDirection: 'INCOMING',
          requestRequestedAt: sentAt,
          requestRespondedAt: null,
          requestRespondedByUserId: null,
        },
      },
    );
    this.emitRequestSummaryUpdates(
      conversationId,
      summariesByUser,
      sentAt,
      'conversation.request.updated',
    );

    return this.serializeConversationSummary(
      actor.id,
      summariesByUser.get(actor.id) ??
        (await this.conversationSummaryService.getConversationSummary(
          actor.id,
          conversationId,
        ))!,
    );
  }

  async acceptDirectMessageRequest(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<ConversationSummary> {
    return this.respondToDirectMessageRequest(
      actor,
      conversationId,
      'ACCEPTED',
    );
  }

  async ignoreDirectMessageRequest(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<ConversationSummary> {
    return this.respondToDirectMessageRequest(actor, conversationId, 'IGNORED');
  }

  async rejectDirectMessageRequest(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<ConversationSummary> {
    return this.respondToDirectMessageRequest(
      actor,
      conversationId,
      'REJECTED',
    );
  }

  async blockDirectMessageRequest(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<ConversationSummary> {
    return this.respondToDirectMessageRequest(actor, conversationId, 'BLOCKED');
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
      const visibleMessages =
        await this.conversationSummaryService.listVisibleMessagesForUser(
          access.conversationKey,
          actor.id,
        );
      const latestMessage = visibleMessages[0];

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
    await this.ensureCanMutateConversationMessage(
      actor,
      access.conversationKey,
      'edit',
    );
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
    const hasAttachmentField =
      Object.prototype.hasOwnProperty.call(body, 'attachmentUrl') ||
      Object.prototype.hasOwnProperty.call(body, 'attachmentKey');

    if (!hasContentField && !hasAttachmentField) {
      throw new BadRequestException(
        'content, attachmentKey or attachmentUrl must be provided.',
      );
    }

    const nextRawContent = hasContentField
      ? (optionalString(body, 'content', {
          allowEmpty: true,
          maxLength: 4000,
        }) ?? '')
      : message.content;
    const nextAttachment = hasAttachmentField
      ? this.resolveMessageAttachmentInput(
          body,
          actor.id,
          access.conversationId,
          {
            allowClear: true,
          },
        )
      : undefined;
    const nextAttachmentAsset = hasAttachmentField
      ? nextAttachment?.asset
      : message.attachmentAsset;
    const nextAttachmentUrl = hasAttachmentField
      ? nextAttachment?.url
      : message.attachmentUrl;
    const messageType = this.asSupportedMessageType(message.type);
    const nextContent = hasContentField
      ? this.normalizeStoredContent(messageType, nextRawContent)
      : message.content;

    if (
      !this.hasMeaningfulMessageBody(
        messageType,
        nextContent,
        nextAttachmentAsset,
        nextAttachmentUrl,
      )
    ) {
      throw new BadRequestException(
        'content, attachmentKey or attachmentUrl is required.',
      );
    }

    if (
      nextContent === message.content &&
      this.areMediaAssetsEqual(nextAttachmentAsset, message.attachmentAsset) &&
      nextAttachmentUrl === message.attachmentUrl
    ) {
      return this.serializeMessage(actor.id, message);
    }
    const nextMessage: StoredMessage = {
      ...message,
      content: nextContent,
      attachmentAsset: nextAttachmentAsset,
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

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbMessagesTableName,
          item: nextMessage,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': message.updatedAt,
            ':expectedDeletedAt': message.deletedAt,
          },
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
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Message changed. Please retry.');
      }

      throw error;
    }

    try {
      const syncResult =
        await this.conversationSummaryService.syncConversationSummariesAfterMessageMutation(
          access,
        );
      await this.conversationDispatchService.emitMessageUpdated(
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
    } catch (error) {
      this.logDeferredChatOutboxEvent(
        outboxRecord.eventId,
        outboxRecord.eventName,
        error,
      );
      return this.serializeMessage(actor.id, nextMessage, {
        participantIds: access.participants,
        summariesByUser: new Map<string, StoredConversation>(),
      });
    }
  }
  async deleteMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ): Promise<MessageItem> {
    if (!this.authorizationService.isAdmin(actor)) {
      throw new ForbiddenException(
        'Only administrators can permanently delete messages.',
      );
    }

    const access = await this.resolveConversationAccess(actor, conversationId);
    const message = await this.getMessageOrThrow(
      access.conversationKey,
      messageId,
    );

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
      summary: `${actor.fullName} permanently deleted a message.`,
      metadata: { type: nextMessage.type },
    });

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbMessagesTableName,
          item: nextMessage,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': message.updatedAt,
            ':expectedDeletedAt': message.deletedAt,
          },
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
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Message changed. Please retry.');
      }

      throw error;
    }

    try {
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
    } catch (error) {
      this.logDeferredChatOutboxEvent(
        outboxRecord.eventId,
        outboxRecord.eventName,
        error,
      );
      return this.serializeMessage(actor.id, nextMessage, {
        participantIds: access.participants,
        summariesByUser: new Map<string, StoredConversation>(),
      });
    }
  }

  async recallMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    payload: unknown,
  ): Promise<RecallMessageResult> {
    const access = await this.resolveConversationAccess(actor, conversationId);
    const body = ensureObject(payload);
    const scope =
      optionalEnum(body, 'scope', MESSAGE_RECALL_SCOPES) ?? 'EVERYONE';
    const message = await this.getMessageOrThrow(
      access.conversationKey,
      messageId,
    );

    await this.ensureCanMutateConversationMessage(
      actor,
      access.conversationKey,
      'recall',
    );
    if (scope === 'EVERYONE') {
      this.ensureCanMutateMessage(actor, message, 'delete');
    }

    if (message.deletedAt) {
      throw new BadRequestException('Message has already been deleted.');
    }

    if (scope === 'SELF') {
      return this.recallMessageForSender(actor, access, message);
    }

    return this.recallMessageForEveryone(actor, access, message);
  }

  async forwardMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    payload: unknown,
  ): Promise<MessageItem[]> {
    const body = ensureObject(payload);
    const rawConversationIds = body.conversationIds;

    if (!Array.isArray(rawConversationIds) || rawConversationIds.length === 0) {
      throw new BadRequestException('conversationIds is required.');
    }

    if (
      rawConversationIds.some(
        (value) => typeof value !== 'string' || value.trim().length === 0,
      )
    ) {
      throw new BadRequestException(
        'conversationIds must contain only non-empty strings.',
      );
    }
    const typedConversationIds = rawConversationIds as string[];

    const targetConversationIds = Array.from(
      new Set(typedConversationIds.map((value) => value.trim())),
    );

    if (targetConversationIds.length === 0) {
      throw new BadRequestException('conversationIds is required.');
    }

    if (targetConversationIds.length > 20) {
      throw new BadRequestException(
        'Forwarding supports up to 20 target conversations per request.',
      );
    }

    const sourceAccess = await this.resolveConversationAccess(
      actor,
      conversationId,
    );
    const sourceMessage = await this.getMessageOrThrow(
      sourceAccess.conversationKey,
      messageId,
    );

    if (sourceMessage.deletedAt) {
      throw new NotFoundException('Message not found.');
    }

    if (
      !this.conversationStateService.isMessageVisibleToUser(
        sourceMessage,
        actor.id,
      )
    ) {
      throw new NotFoundException('Message not found.');
    }

    if (sourceMessage.recalledAt) {
      throw new BadRequestException('Recalled messages cannot be forwarded.');
    }

    if (sourceMessage.type === 'SYSTEM') {
      throw new BadRequestException('System messages cannot be forwarded.');
    }

    const forwardedMessages: MessageItem[] = [];

    for (const targetConversationId of targetConversationIds) {
      const targetAccess = await this.resolveConversationAccess(
        actor,
        targetConversationId,
        true,
      );
      const forwardedAttachment = await this.prepareForwardedAttachment(
        actor,
        targetAccess.conversationId,
        sourceMessage,
      );
      const forwardedPayload: Record<string, unknown> = {
        type: sourceMessage.type,
        content: sourceMessage.content,
      };

      if (forwardedAttachment.attachmentKey) {
        forwardedPayload.attachmentKey = forwardedAttachment.attachmentKey;
      }

      if (forwardedAttachment.attachmentUrl) {
        forwardedPayload.attachmentUrl = forwardedAttachment.attachmentUrl;
      }

      const forwardedMessage = await this.createMessage(
        actor,
        targetAccess.conversationKey,
        targetAccess.conversationId,
        targetAccess.participants,
        forwardedPayload,
        {
          forwardedFrom: sourceMessage,
        },
      );

      forwardedMessages.push(forwardedMessage);
    }

    return forwardedMessages;
  }

  private async createMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    publicConversationId: string,
    participants: string[],
    payload: unknown,
    options: {
      forwardedFrom?: StoredMessage;
    } = {},
  ): Promise<MessageItem> {
    const body = ensureObject(payload);
    const type: SupportedMessageType =
      optionalEnum(body, 'type', MESSAGE_TYPES) ?? 'TEXT';
    const rawContent =
      optionalString(body, 'content', { allowEmpty: true, maxLength: 4000 }) ??
      '';
    const attachment = this.resolveMessageAttachmentInput(
      body,
      actor.id,
      publicConversationId,
    );
    const replyTo = optionalString(body, 'replyTo', { maxLength: 50 });
    const clientMessageId = optionalString(body, 'clientMessageId', {
      maxLength: 100,
    });

    if (!rawContent && !attachment.asset && !attachment.url) {
      throw new BadRequestException(
        'content, attachmentKey or attachmentUrl is required.',
      );
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
    const replyMessage = await this.buildReplyMessageReference(
      conversationId,
      replyTo,
    );
    const forwardedFrom =
      options.forwardedFrom &&
      this.buildForwardedMessageMetadata(options.forwardedFrom);

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
      senderAvatarAsset: actor.avatarAsset,
      senderAvatarUrl: actor.avatarUrl,
      type,
      content,
      attachmentAsset: attachment.asset,
      attachmentUrl: attachment.url,
      replyTo,
      replyMessage,
      forwardedFromMessageId: forwardedFrom?.messageId,
      forwardedFromConversationId: forwardedFrom?.conversationId,
      forwardedFromSenderId: forwardedFrom?.senderId,
      forwardedFromSenderName: forwardedFrom?.senderName,
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
      metadata: {
        replyTo: replyTo ?? '',
        type,
        forwardedFromMessageId: forwardedFrom?.messageId ?? '',
      },
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

    try {
      const summariesByUser =
        await this.conversationSummaryService.upsertConversationSummaries(
          conversationId,
          participants,
          message,
        );
      await this.conversationDispatchService.emitMessageCreated(
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
    } catch (error) {
      this.logDeferredChatOutboxEvent(
        outboxRecord.eventId,
        outboxRecord.eventName,
        error,
      );
      return this.serializeMessage(actor.id, message, {
        participantIds: participants,
        summariesByUser: new Map<string, StoredConversation>(),
      });
    }
  }

  private async respondToDirectMessageRequest(
    actor: AuthenticatedUser,
    conversationId: string,
    status: Exclude<DirectMessageRequestStatus, 'PENDING'>,
  ): Promise<ConversationSummary> {
    const conversationKey = await this.normalizeConversationId(
      actor,
      conversationId,
    );

    if (!isDmConversationId(conversationKey)) {
      throw new BadRequestException(
        'Direct message request actions are only supported for DM conversations.',
      );
    }

    const request = await this.getDirectMessageRequestOrThrow(conversationKey);

    if (request.targetUserId !== actor.id) {
      throw new ForbiddenException(
        'Only the request recipient can perform this action.',
      );
    }

    if (request.status !== 'PENDING') {
      throw new ConflictException(
        'This direct message request is no longer pending.',
      );
    }

    const activeMessages =
      await this.conversationSummaryService.listActiveMessages(conversationKey);
    const latestMessage = activeMessages[0];

    if (!latestMessage) {
      throw new NotFoundException('Direct message request not found.');
    }

    const occurredAt = nowIso();
    const nextRequest: StoredDirectMessageRequest = {
      ...request,
      status,
      updatedAt: occurredAt,
      respondedAt: occurredAt,
      respondedByUserId: actor.id,
    };

    await this.repository.put(
      this.config.dynamodbConversationsTableName,
      nextRequest,
    );

    const summaryStates =
      status === 'ACCEPTED'
        ? {
            [request.requesterUserId]: {
              requestStatus: null,
              requestDirection: null,
              requestRequestedAt: null,
              requestRespondedAt: null,
              requestRespondedByUserId: null,
            },
            [request.targetUserId]: {
              requestStatus: null,
              requestDirection: null,
              requestRequestedAt: null,
              requestRespondedAt: null,
              requestRespondedByUserId: null,
            },
          }
        : {
            [request.requesterUserId]: {
              requestStatus: status,
              requestDirection: 'OUTGOING' as const,
              requestRequestedAt: request.createdAt,
              requestRespondedAt: occurredAt,
              requestRespondedByUserId: actor.id,
            },
            [request.targetUserId]: {
              requestStatus: status,
              requestDirection: 'INCOMING' as const,
              requestRequestedAt: request.createdAt,
              requestRespondedAt: occurredAt,
              requestRespondedByUserId: actor.id,
            },
          };
    const summariesByUser = await this.upsertDirectRequestSummaries(
      conversationKey,
      [request.requesterUserId, request.targetUserId],
      latestMessage,
      summaryStates,
      occurredAt,
    );

    this.emitRequestSummaryUpdates(
      conversationKey,
      summariesByUser,
      occurredAt,
      'conversation.request.updated',
    );

    return this.serializeConversationSummary(
      actor.id,
      summariesByUser.get(actor.id) ??
        (await this.conversationSummaryService.getConversationSummary(
          actor.id,
          conversationKey,
        ))!,
    );
  }

  private async ensureCanCreateDirectMessageRequest(
    actor: AuthenticatedUser,
    targetUser: Awaited<ReturnType<UsersService['getActiveByIdOrThrow']>>,
    conversationId: string,
  ): Promise<void> {
    if (
      !this.authorizationService.canAccessDirectConversation(actor, targetUser)
    ) {
      throw new ForbiddenException(
        'Only same-scope citizens can send direct message requests.',
      );
    }

    if (await this.usersService.canStartCitizenDm(actor, targetUser)) {
      throw new BadRequestException('Users can already message directly.');
    }

    const existingRequest = await this.getDirectMessageRequest(conversationId);

    if (!existingRequest) {
      return;
    }

    switch (existingRequest.status) {
      case 'PENDING':
        throw new ConflictException(
          'A direct message request is already pending.',
        );
      case 'ACCEPTED':
        throw new BadRequestException('Users can already message directly.');
      case 'BLOCKED':
        throw new ForbiddenException(
          'Direct message requests are blocked for this conversation.',
        );
      case 'IGNORED':
      case 'REJECTED':
      default:
        throw new ConflictException(
          'A previous direct message request was already closed.',
        );
    }
  }

  private async ensureCanSendCitizenDirectMessage(
    actor: AuthenticatedUser,
    targetUser: Awaited<ReturnType<UsersService['getByIdOrThrow']>>,
    conversationId: string,
  ): Promise<void> {
    if (actor.role !== 'CITIZEN' || targetUser.role !== 'CITIZEN') {
      return;
    }

    if (await this.usersService.canStartCitizenDm(actor, targetUser)) {
      return;
    }

    const directRequest = await this.getDirectMessageRequest(conversationId);

    if (directRequest?.status === 'ACCEPTED') {
      return;
    }

    if (directRequest?.status === 'PENDING') {
      throw new ForbiddenException(
        'This direct message request has not been accepted yet.',
      );
    }

    if (directRequest?.status === 'BLOCKED') {
      throw new ForbiddenException(
        'Direct messaging is blocked for this conversation.',
      );
    }

    throw new ForbiddenException(
      'Citizens can only send direct messages to friends or accepted direct message requests.',
    );
  }

  private ensureDirectMessageRequestPair(
    actor: AuthenticatedUser,
    targetUser: Awaited<ReturnType<UsersService['getActiveByIdOrThrow']>>,
  ): void {
    if (actor.role !== 'CITIZEN' || targetUser.role !== 'CITIZEN') {
      throw new BadRequestException(
        'Direct message requests are only supported between citizen accounts.',
      );
    }
  }

  private async upsertDirectRequestSummaries(
    conversationId: string,
    participants: string[],
    latestMessage: StoredMessage,
    summaryStates: Record<
      string,
      {
        requestStatus: ConversationSummary['requestStatus'];
        requestDirection: ConversationSummary['requestDirection'];
        requestRequestedAt: ConversationSummary['requestRequestedAt'];
        requestRespondedAt: ConversationSummary['requestRespondedAt'];
        requestRespondedByUserId: ConversationSummary['requestRespondedByUserId'];
      }
    >,
    updatedAtOverride?: string,
  ): Promise<Map<string, StoredConversation>> {
    const activeMessages =
      await this.conversationSummaryService.listActiveMessages(conversationId);
    const effectiveMessages =
      activeMessages.length > 0 ? activeMessages : [latestMessage];
    const effectiveLatestMessage = effectiveMessages[0] ?? latestMessage;
    const labelMap =
      await this.conversationSummaryService.getConversationLabelMap(
        conversationId,
        participants,
      );
    const summariesByUser = new Map<string, StoredConversation>();

    for (const participantId of participants) {
      const existingConversation =
        await this.conversationSummaryService.getConversationSummary(
          participantId,
          conversationId,
        );
      const state = summaryStates[participantId];
      const lastReadAt =
        existingConversation?.lastReadAt !== undefined
          ? existingConversation.lastReadAt
          : participantId === effectiveLatestMessage.senderId
            ? effectiveLatestMessage.sentAt
            : null;
      const nextConversation: StoredConversation = {
        PK: makeInboxPk(participantId),
        SK: makeConversationSummarySk(
          conversationId,
          effectiveLatestMessage.sentAt,
        ),
        entityType: 'CONVERSATION',
        GSI1PK: makeInboxStatsKey(participantId, 'DM'),
        userId: participantId,
        conversationId,
        groupName:
          labelMap.get(participantId) ??
          existingConversation?.groupName ??
          participantId,
        lastMessagePreview: this.buildPreview(effectiveLatestMessage),
        lastSenderName: effectiveLatestMessage.senderName,
        unreadCount: this.computeUnreadCount(
          participantId,
          effectiveMessages,
          lastReadAt,
        ),
        isGroup: false,
        isPinned: existingConversation?.isPinned ?? false,
        archivedAt: existingConversation?.archivedAt ?? null,
        mutedUntil: existingConversation?.mutedUntil ?? null,
        requestStatus: state.requestStatus,
        requestDirection: state.requestDirection,
        requestRequestedAt: state.requestRequestedAt,
        requestRespondedAt: state.requestRespondedAt,
        requestRespondedByUserId: state.requestRespondedByUserId,
        deletedAt: null,
        updatedAt: updatedAtOverride ?? effectiveLatestMessage.sentAt,
        lastReadAt,
      };

      if (
        existingConversation &&
        existingConversation.SK !== nextConversation.SK
      ) {
        await this.repository.delete(
          this.config.dynamodbConversationsTableName,
          existingConversation.PK,
          existingConversation.SK,
        );
      }

      await this.repository.put(
        this.config.dynamodbConversationsTableName,
        nextConversation,
      );
      summariesByUser.set(participantId, nextConversation);
    }

    return summariesByUser;
  }

  private emitRequestSummaryUpdates(
    conversationId: string,
    summariesByUser: Map<string, StoredConversation>,
    occurredAt: string,
    reason: 'conversation.request.updated',
  ): void {
    const eventId = createUlid();

    for (const [participantId, summary] of summariesByUser.entries()) {
      this.conversationDispatchService.emitConversationSummaryUpdated(
        eventId,
        participantId,
        conversationId,
        summary,
        reason,
        occurredAt,
      );
    }
  }

  private buildDirectMessageRequestRecord(input: {
    conversationId: string;
    requesterUserId: string;
    targetUserId: string;
    status: DirectMessageRequestStatus;
    occurredAt: string;
    respondedAt?: string | null;
    respondedByUserId?: string | null;
  }): StoredDirectMessageRequest {
    return {
      PK: this.makeDirectMessageRequestPk(input.conversationId),
      SK: this.makeDirectMessageRequestSk(),
      entityType: 'DIRECT_MESSAGE_REQUEST',
      conversationId: input.conversationId,
      requesterUserId: input.requesterUserId,
      targetUserId: input.targetUserId,
      status: input.status,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      respondedAt: input.respondedAt ?? null,
      respondedByUserId: input.respondedByUserId ?? null,
    };
  }

  private async getDirectMessageRequest(
    conversationId: string,
  ): Promise<StoredDirectMessageRequest | undefined> {
    const request = await this.repository.get<StoredDirectMessageRequest>(
      this.config.dynamodbConversationsTableName,
      this.makeDirectMessageRequestPk(conversationId),
      this.makeDirectMessageRequestSk(),
    );

    if (!request || request.entityType !== 'DIRECT_MESSAGE_REQUEST') {
      return undefined;
    }

    return request;
  }

  private async getDirectMessageRequestOrThrow(
    conversationId: string,
  ): Promise<StoredDirectMessageRequest> {
    const request = await this.getDirectMessageRequest(conversationId);

    if (!request) {
      throw new NotFoundException('Direct message request not found.');
    }

    return request;
  }

  private makeDirectMessageRequestPk(conversationId: string): string {
    return `DMREQ#${conversationId}`;
  }

  private makeDirectMessageRequestSk(): string {
    return 'STATE';
  }

  private parseDirectMessageRequestStatus(
    value: string,
  ): Exclude<DirectMessageRequestStatus, 'ACCEPTED'> {
    if (
      DIRECT_MESSAGE_REQUEST_STATUS_VALUES.includes(
        value as DirectMessageRequestStatus,
      ) &&
      value !== 'ACCEPTED'
    ) {
      return value as Exclude<DirectMessageRequestStatus, 'ACCEPTED'>;
    }

    throw new BadRequestException('status is invalid.');
  }

  private parseDirectMessageRequestDirection(
    value: string,
  ): DirectMessageRequestDirection {
    if (
      DIRECT_MESSAGE_REQUEST_DIRECTION_VALUES.includes(
        value as DirectMessageRequestDirection,
      )
    ) {
      return value as DirectMessageRequestDirection;
    }

    throw new BadRequestException('direction is invalid.');
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

  private async buildReplyMessageReference(
    conversationId: string,
    replyTo?: string,
  ): Promise<MessageReplyReference | undefined> {
    if (!replyTo) {
      return undefined;
    }

    const replyTarget = await this.findMessageById(conversationId, replyTo);

    if (!replyTarget || replyTarget.deletedAt) {
      return undefined;
    }

    return {
      id: replyTarget.messageId,
      senderId: replyTarget.senderId,
      senderName: replyTarget.senderName,
      type: replyTarget.type,
      content: replyTarget.recalledAt
        ? this.getRecalledStructuredContent()
        : replyTarget.content,
      attachmentAsset: replyTarget.recalledAt
        ? undefined
        : replyTarget.attachmentAsset,
      attachmentUrl: replyTarget.recalledAt
        ? undefined
        : replyTarget.attachmentUrl,
      deletedAt: replyTarget.deletedAt,
      recalledAt: replyTarget.recalledAt ?? null,
      sentAt: replyTarget.sentAt,
    };
  }

  private buildForwardedMessageMetadata(sourceMessage: StoredMessage): {
    messageId: string;
    conversationId: string;
    senderId: string;
    senderName: string;
  } {
    return {
      messageId: sourceMessage.messageId,
      conversationId: sourceMessage.conversationId,
      senderId: sourceMessage.senderId,
      senderName: sourceMessage.senderName,
    };
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

  private async recallMessageForSender(
    actor: AuthenticatedUser,
    access: ResolvedConversationAccess,
    message: StoredMessage,
  ): Promise<RecallMessageResult> {
    const recalledAtForActor = message.deletedForUserAt?.[actor.id];
    if (recalledAtForActor) {
      return {
        conversationId: access.conversationId,
        messageId: message.messageId,
        scope: 'SELF',
        recalledAt: recalledAtForActor,
      };
    }

    if (message.deletedForSenderAt) {
      return {
        conversationId: access.conversationId,
        messageId: message.messageId,
        scope: 'SELF',
        recalledAt: message.deletedForSenderAt,
      };
    }

    const recalledAt = nowIso();
    const nextDeletedForUserAt = {
      ...(message.deletedForUserAt ?? {}),
      [actor.id]: recalledAt,
    };
    const nextMessage: StoredMessage = {
      ...message,
      deletedForSenderAt:
        actor.id === message.senderId
          ? recalledAt
          : message.deletedForSenderAt,
      deletedForUserAt: nextDeletedForUserAt,
      updatedAt: recalledAt,
    };

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbMessagesTableName,
          item: nextMessage,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': message.updatedAt,
            ':expectedDeletedAt': message.deletedAt,
          },
        },
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Message changed. Please retry.');
      }

      throw error;
    }

    const syncResult =
      await this.conversationSummaryService.syncConversationSummaryForUser(
        {
          conversationKey: access.conversationKey,
          participants: access.participants,
        },
        actor.id,
      );

    this.chatRealtimeService.emitToUser(
      actor.id,
      CHAT_SOCKET_EVENTS.MESSAGE_DELETED,
      {
        eventId: createUlid(),
        conversationId: access.conversationId,
        conversationKey: access.conversationKey,
        messageId: message.messageId,
        deletedByUserId: actor.id,
        occurredAt: recalledAt,
      },
    );

    if (syncResult.removed) {
      this.conversationDispatchService.emitConversationRemoved(
        createUlid(),
        actor.id,
        access.conversationKey,
        recalledAt,
        'message.deleted',
      );
    } else if (syncResult.changed && syncResult.summary) {
      this.conversationDispatchService.emitConversationSummaryUpdated(
        createUlid(),
        actor.id,
        access.conversationKey,
        syncResult.summary,
        'message.updated',
        recalledAt,
      );
    }

    return {
      conversationId: access.conversationId,
      messageId: message.messageId,
      scope: 'SELF',
      recalledAt,
    };
  }

  private async recallMessageForEveryone(
    actor: AuthenticatedUser,
    access: ResolvedConversationAccess,
    message: StoredMessage,
  ): Promise<RecallMessageResult> {
    if (message.recalledAt) {
      return {
        conversationId: access.conversationId,
        messageId: message.messageId,
        scope: 'EVERYONE',
        recalledAt: message.recalledAt,
      };
    }

    const recalledAt = nowIso();
    const nextMessage: StoredMessage = {
      ...message,
      recalledAt,
      recalledByUserId: actor.id,
      updatedAt: recalledAt,
    };
    const outboxRecord = this.chatOutboxService.buildChatOutboxEvent({
      actorUserId: actor.id,
      conversationId: access.conversationKey,
      eventName: 'message.updated',
      messageId: message.messageId,
      occurredAt: recalledAt,
    });
    const auditRecord = this.auditTrailService.buildConversationEvent({
      action: 'MESSAGE_RECALLED',
      actorUserId: actor.id,
      conversationId: access.conversationKey,
      messageId: message.messageId,
      occurredAt: recalledAt,
      summary: `${actor.fullName} recalled a message.`,
      metadata: {
        scope: 'EVERYONE',
        type: nextMessage.type,
      },
    });

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbMessagesTableName,
          item: nextMessage,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': message.updatedAt,
            ':expectedDeletedAt': message.deletedAt,
          },
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
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Message changed. Please retry.');
      }

      throw error;
    }

    try {
      const syncResult =
        await this.conversationSummaryService.syncConversationSummariesAfterMessageMutation(
          access,
        );
      await this.conversationDispatchService.emitMessageUpdated(
        outboxRecord.eventId,
        actor.id,
        nextMessage,
        access.conversationKey,
        syncResult,
      );
      await this.chatOutboxService
        .deleteChatOutboxEvent(outboxRecord)
        .catch((error: unknown) => {
          const messageText =
            error instanceof Error ? error.message : 'Unknown error.';
          this.logger.warn(
            `Failed to delete chat outbox event ${outboxRecord.eventId}: ${messageText}`,
          );
        });
    } catch (error) {
      this.logDeferredChatOutboxEvent(
        outboxRecord.eventId,
        outboxRecord.eventName,
        error,
      );
    }

    return {
      conversationId: access.conversationId,
      messageId: message.messageId,
      scope: 'EVERYONE',
      recalledAt,
    };
  }

  private async prepareForwardedAttachment(
    actor: AuthenticatedUser,
    targetConversationId: string,
    sourceMessage: StoredMessage,
  ): Promise<{
    attachmentKey?: string;
    attachmentUrl?: string;
  }> {
    if (sourceMessage.attachmentAsset?.key) {
      const sourceBucket =
        sourceMessage.attachmentAsset.bucket || this.config.s3BucketName;

      if (!sourceBucket || !this.config.s3BucketName) {
        throw new BadRequestException(
          'Forwarding this attachment is not available because S3 is not configured.',
        );
      }

      const normalizedTarget =
        this.mediaAssetService.normalizeSegment('message');
      const actorSegment = this.mediaAssetService.normalizeSegment(actor.id);
      const entitySegment =
        this.mediaAssetService.normalizeSegment(targetConversationId);
      const fileName =
        sourceMessage.attachmentAsset.fileName ??
        sourceMessage.attachmentAsset.originalFileName ??
        sourceMessage.attachmentAsset.key.split('/').pop() ??
        'file.bin';
      const nextKey = `${this.mediaAssetService.normalizeSegment(
        this.config.uploadKeyPrefix,
      )}/${normalizedTarget}/${actorSegment}/${entitySegment}/${createUlid()}-${fileName}`;

      await this.s3StorageService.copyObject({
        sourceBucket,
        sourceKey: sourceMessage.attachmentAsset.key,
        destinationBucket: this.config.s3BucketName,
        destinationKey: nextKey,
      });

      return {
        attachmentKey: nextKey,
      };
    }

    if (sourceMessage.attachmentUrl) {
      return {
        attachmentUrl: sourceMessage.attachmentUrl,
      };
    }

    return {};
  }

  private getRecalledStructuredContent(): string {
    return JSON.stringify({
      text: 'Message was recalled.',
      mention: [],
    });
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

  private async ensureCanMutateConversationMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    action: 'edit' | 'delete' | 'recall',
  ): Promise<void> {
    if (
      this.authorizationService.isAdmin(actor) ||
      !isGroupConversationId(conversationId)
    ) {
      return;
    }

    const groupId = conversationId.slice('GRP#'.length);
    const membership = await this.groupsService.getMembership(
      groupId,
      actor.id,
    );

    if (membership && !membership.deletedAt) {
      return;
    }

    throw new ForbiddenException(
      `Only active members can ${action} messages in this group.`,
    );
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
    attachmentAsset?: MediaAsset,
    attachmentUrl?: string,
  ): boolean {
    return this.conversationStateService.hasMeaningfulMessageBody(
      type,
      content,
      attachmentAsset,
      attachmentUrl,
    );
  }

  private resolveMessageAttachmentInput(
    body: Record<string, unknown>,
    ownerUserId: string,
    entityId?: string,
    options: { allowClear?: boolean } = {},
  ): { asset?: MediaAsset; url?: string } {
    const attachmentKey = optionalString(body, 'attachmentKey', {
      allowEmpty: options.allowClear,
      maxLength: 500,
    });
    const attachmentUrl = optionalString(body, 'attachmentUrl', {
      allowEmpty: options.allowClear,
      maxLength: 500,
    });

    if (attachmentKey !== undefined) {
      if (!attachmentKey) {
        return {
          asset: undefined,
          url: undefined,
        };
      }

      return {
        asset: this.mediaAssetService.createOwnedAssetReference({
          key: attachmentKey,
          target: 'MESSAGE',
          ownerUserId,
          entityId,
        }),
        url: undefined,
      };
    }

    if (attachmentUrl !== undefined) {
      return {
        asset: undefined,
        url: attachmentUrl || undefined,
      };
    }

    return {};
  }

  private areMediaAssetsEqual(left?: MediaAsset, right?: MediaAsset): boolean {
    if (!left && !right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return (
      left.key === right.key &&
      left.target === right.target &&
      (left.entityId ?? '') === (right.entityId ?? '')
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

  private isConditionalWriteConflict(error: unknown): boolean {
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
      /ConditionalCheckFailed|TransactionCanceled/i.test(message),
    );
  }

  private logDeferredChatOutboxEvent(
    eventId: string,
    eventName: StoredChatOutboxEvent['eventName'],
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    this.logger.warn(
      `Deferred ${eventName} replay to chat outbox for ${eventId}: ${message}`,
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

    const conversationId = makeDmConversationId(actor.id, targetUser.userId);

    if (
      !(await this.canAccessDmConversation(actor, targetUser, conversationId))
    ) {
      throw new ForbiddenException('You cannot access this conversation.');
    }

    if (targetUser.userId === actor.id) {
      throw new BadRequestException('Cannot create DM with yourself.');
    }

    return conversationId;
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

  private async serializeMessage(
    actorId: string,
    message: StoredMessage,
    deliveryContext?: MessageDeliveryContext,
  ): Promise<MessageItem> {
    const item = this.conversationStateService.serializeMessage(
      actorId,
      message,
      deliveryContext,
    );
    const isRecalled = Boolean(item.recalledAt);
    const senderAvatar = await this.mediaAssetService.resolveAssetWithLegacyUrl(
      item.senderAvatarAsset,
      item.senderAvatarUrl,
    );
    const attachment = isRecalled
      ? { asset: undefined, url: undefined }
      : await this.mediaAssetService.resolveAssetWithLegacyUrl(
          item.attachmentAsset,
          item.attachmentUrl,
        );

    return {
      ...item,
      content: isRecalled ? this.getRecalledStructuredContent() : item.content,
      senderAvatarAsset: senderAvatar.asset,
      senderAvatarUrl: senderAvatar.url,
      attachmentAsset: attachment.asset,
      attachmentUrl: attachment.url,
      replyMessage: isRecalled ? undefined : item.replyMessage,
    };
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

      if (!actorMembership || actorMembership.deletedAt) {
        if (actor.role !== 'ADMIN') {
          throw new ForbiddenException(
            requireSendAccess
              ? 'Only active members can send messages to this group.'
              : 'Only active members can access this group conversation.',
          );
        }
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

    if (!participantIds.includes(actor.id)) {
      throw new ForbiddenException('You cannot access this conversation.');
    }

    const otherParticipantId =
      participantIds.find((participantId) => participantId !== actor.id) ??
      participantIds[0];
    const targetUser = requireSendAccess
      ? await this.usersService.getActiveByIdOrThrow(otherParticipantId)
      : await this.usersService.getByIdOrThrow(otherParticipantId);

    if (
      !(await this.canAccessDmConversation(actor, targetUser, conversationId))
    ) {
      throw new ForbiddenException('You cannot access this conversation.');
    }

    if (requireSendAccess) {
      await this.ensureCanSendCitizenDirectMessage(
        actor,
        targetUser,
        conversationId,
      );
    }

    return participantIds;
  }

  private async canAccessDmConversation(
    actor: AuthenticatedUser,
    targetUser: Awaited<ReturnType<UsersService['getByIdOrThrow']>>,
    conversationId: string,
  ): Promise<boolean> {
    if (
      this.authorizationService.canAccessDirectConversation(actor, targetUser)
    ) {
      return true;
    }

    if (actor.role !== 'CITIZEN' || targetUser.role !== 'CITIZEN') {
      return false;
    }

    if (await this.usersService.canStartCitizenDm(actor, targetUser)) {
      return true;
    }

    const directRequest = await this.getDirectMessageRequest(conversationId);
    return directRequest?.status === 'ACCEPTED';
  }
}
