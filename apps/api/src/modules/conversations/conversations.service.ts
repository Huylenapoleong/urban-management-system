import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CHAT_SOCKET_EVENTS, MESSAGE_TYPES } from '@urban/shared-constants';
import type {
  AuthenticatedUser,
  ChatConversationReadEvent,
  ChatConversationRemovedEvent,
  ChatConversationUpdatedEvent,
  ChatMessageCreatedEvent,
  ChatMessageDeletedEvent,
  ChatMessageUpdatedEvent,
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
import { toConversationSummary, toMessage } from '../../common/mappers';
import type {
  StoredConversation,
  StoredMessage,
  StoredMessageDedup,
  StoredMessageRef,
} from '../../common/storage-records';
import {
  ensureObject,
  optionalEnum,
  optionalString,
  parseLimit,
  requiredString,
} from '../../common/validation';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { ChatRateLimitService } from './chat-rate-limit.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';

interface StructuredMessageContent extends Record<string, unknown> {
  text: string;
  mention: unknown[];
}

type SupportedMessageType = (typeof MESSAGE_TYPES)[number];

export interface ResolvedConversationAccess {
  conversationId: string;
  conversationKey: string;
  participants: string[];
  isGroup: boolean;
}

interface ConversationSyncResult {
  latestMessage?: StoredMessage;
  participantIds: string[];
  removedUserIds: string[];
  summariesByUser: Map<string, StoredConversation>;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly chatRateLimitService: ChatRateLimitService,
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly config: AppConfigService,
  ) {}

  async listConversations(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ConversationSummary[]> {
    const limit = parseLimit(query.limit);
    const items = await this.repository.queryByPk<StoredConversation>(
      this.config.dynamodbConversationsTableName,
      makeInboxPk(actor.id),
      {
        beginsWith: 'CONV#',
        limit,
      },
    );

    return items
      .filter((item) => !item.deletedAt)
      .map((item) => this.serializeConversationSummary(actor.id, item));
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
  ): Promise<MessageItem[]> {
    const access = await this.resolveConversationAccess(actor, conversationId);
    const limit = parseLimit(query.limit);
    const items = await this.repository.queryByPk<StoredMessage>(
      this.config.dynamodbMessagesTableName,
      makeConversationPk(access.conversationKey),
      {
        beginsWith: 'MSG#',
        limit,
      },
    );

    return items
      .filter((item) => !item.deletedAt)
      .map((item) => this.serializeMessage(actor.id, item));
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
    const current = await this.getConversationSummary(
      actor.id,
      access.conversationKey,
    );

    if (!current) {
      throw new NotFoundException('Conversation not found.');
    }

    const nextConversation: StoredConversation = {
      ...current,
      unreadCount: 0,
      lastReadAt:
        this.getConversationLastMessageSentAt(current) ??
        current.lastReadAt ??
        nowIso(),
      updatedAt: nowIso(),
    };

    await this.repository.put(
      this.config.dynamodbConversationsTableName,
      nextConversation,
    );
    this.emitConversationRead(actor, access, nextConversation);
    return this.serializeConversationSummary(actor.id, nextConversation);
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

    await this.repository.put(
      this.config.dynamodbMessagesTableName,
      nextMessage,
    );
    const syncResult =
      await this.syncConversationSummariesAfterMessageMutation(access);
    this.emitMessageUpdated(actor, nextMessage, access, syncResult);
    return this.serializeMessage(actor.id, nextMessage);
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

    await this.repository.put(
      this.config.dynamodbMessagesTableName,
      nextMessage,
    );
    const syncResult =
      await this.syncConversationSummariesAfterMessageMutation(access);
    this.emitMessageDeleted(actor, nextMessage, access, syncResult);
    return this.serializeMessage(actor.id, nextMessage);
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
    const transactionItems: Array<{
      tableName: string;
      item: StoredMessage | StoredMessageRef | StoredMessageDedup;
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

    const summariesByUser = await this.upsertConversationSummaries(
      actor,
      conversationId,
      participants,
      message,
    );
    this.emitMessageCreated(
      actor,
      message,
      participants,
      summariesByUser,
      clientMessageId,
    );

    return this.serializeMessage(actor.id, message);
  }

  private async upsertConversationSummaries(
    actor: AuthenticatedUser,
    conversationId: string,
    participants: string[],
    message: StoredMessage,
  ): Promise<Map<string, StoredConversation>> {
    const kind = getConversationKind(conversationId);
    const labelMap = await this.buildConversationLabelMap(
      conversationId,
      participants,
    );
    const summariesByUser = new Map<string, StoredConversation>();

    for (const participantId of participants) {
      const existingConversation = await this.getConversationSummary(
        participantId,
        conversationId,
      );
      const previousUnreadCount = existingConversation?.unreadCount ?? 0;
      const lastReadAt =
        participantId === actor.id
          ? message.sentAt
          : this.resolveStoredLastReadAt(existingConversation, message.sentAt);
      const nextConversation: StoredConversation = {
        PK: makeInboxPk(participantId),
        SK: makeConversationSummarySk(conversationId, message.sentAt),
        entityType: 'CONVERSATION',
        GSI1PK: makeInboxStatsKey(participantId, kind),
        userId: participantId,
        conversationId,
        groupName:
          labelMap.get(participantId) ??
          existingConversation?.groupName ??
          participantId,
        lastMessagePreview: this.buildPreview(message),
        lastSenderName: actor.fullName,
        unreadCount: participantId === actor.id ? 0 : previousUnreadCount + 1,
        isGroup: kind === 'GRP',
        deletedAt: null,
        updatedAt: message.sentAt,
        lastReadAt,
      };

      if (
        existingConversation &&
        existingConversation.SK != nextConversation.SK
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

  private emitMessageCreated(
    actor: AuthenticatedUser,
    message: StoredMessage,
    participants: string[],
    summariesByUser: Map<string, StoredConversation>,
    clientMessageId?: string,
  ): void {
    for (const participantId of participants) {
      const summary = summariesByUser.get(participantId);

      if (!summary) {
        continue;
      }

      const payload: ChatMessageCreatedEvent = {
        conversationId: this.toPublicConversationId(
          participantId,
          message.conversationId,
        ),
        conversationKey: message.conversationId,
        message: this.serializeMessage(participantId, message),
        summary: this.serializeConversationSummary(participantId, summary),
        sentByUserId: actor.id,
        clientMessageId:
          participantId === actor.id ? clientMessageId : undefined,
        occurredAt: message.sentAt,
      };

      this.chatRealtimeService.emitToUser(
        participantId,
        CHAT_SOCKET_EVENTS.MESSAGE_CREATED,
        payload,
      );
      this.emitConversationSummaryUpdated(
        participantId,
        message.conversationId,
        summary,
        'message.created',
        payload.occurredAt,
      );
    }
  }

  private emitMessageUpdated(
    actor: AuthenticatedUser,
    message: StoredMessage,
    access: ResolvedConversationAccess,
    syncResult: ConversationSyncResult,
  ): void {
    for (const participantId of syncResult.participantIds) {
      const payload: ChatMessageUpdatedEvent = {
        conversationId: this.toPublicConversationId(
          participantId,
          access.conversationKey,
        ),
        conversationKey: access.conversationKey,
        message: this.serializeMessage(participantId, message),
        updatedByUserId: actor.id,
        occurredAt: message.updatedAt,
      };

      this.chatRealtimeService.emitToUser(
        participantId,
        CHAT_SOCKET_EVENTS.MESSAGE_UPDATED,
        payload,
      );
    }

    for (const [
      participantId,
      summary,
    ] of syncResult.summariesByUser.entries()) {
      this.emitConversationSummaryUpdated(
        participantId,
        access.conversationKey,
        summary,
        'message.updated',
        message.updatedAt,
      );
    }
  }

  private emitMessageDeleted(
    actor: AuthenticatedUser,
    message: StoredMessage,
    access: ResolvedConversationAccess,
    syncResult: ConversationSyncResult,
  ): void {
    const occurredAt = message.deletedAt ?? message.updatedAt;

    for (const participantId of syncResult.participantIds) {
      const payload: ChatMessageDeletedEvent = {
        conversationId: this.toPublicConversationId(
          participantId,
          access.conversationKey,
        ),
        conversationKey: access.conversationKey,
        messageId: message.messageId,
        deletedByUserId: actor.id,
        occurredAt,
      };

      this.chatRealtimeService.emitToUser(
        participantId,
        CHAT_SOCKET_EVENTS.MESSAGE_DELETED,
        payload,
      );
    }

    for (const [
      participantId,
      summary,
    ] of syncResult.summariesByUser.entries()) {
      this.emitConversationSummaryUpdated(
        participantId,
        access.conversationKey,
        summary,
        'message.deleted',
        occurredAt,
      );
    }

    for (const participantId of syncResult.removedUserIds) {
      this.emitConversationRemoved(
        participantId,
        access.conversationKey,
        occurredAt,
      );
    }
  }

  private emitConversationRead(
    actor: AuthenticatedUser,
    access: ResolvedConversationAccess,
    actorConversation: StoredConversation,
  ): void {
    this.emitConversationSummaryUpdated(
      actor.id,
      access.conversationKey,
      actorConversation,
      'conversation.read',
      actorConversation.updatedAt,
    );

    for (const participantId of access.participants) {
      const payload: ChatConversationReadEvent = {
        conversationId: this.toPublicConversationId(
          participantId,
          access.conversationKey,
        ),
        conversationKey: access.conversationKey,
        readByUserId: actor.id,
        readAt: actorConversation.updatedAt,
      };

      this.chatRealtimeService.emitToUser(
        participantId,
        CHAT_SOCKET_EVENTS.CONVERSATION_READ,
        payload,
      );
    }
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

  private async syncConversationSummariesAfterMessageMutation(
    access: ResolvedConversationAccess,
  ): Promise<ConversationSyncResult> {
    const participantIds =
      await this.resolveConversationSummaryParticipants(access);
    const activeMessages = await this.listActiveMessages(
      access.conversationKey,
    );

    if (activeMessages.length === 0) {
      const removedUserIds: string[] = [];

      for (const participantId of participantIds) {
        const existingConversation = await this.getConversationSummary(
          participantId,
          access.conversationKey,
        );

        if (!existingConversation) {
          continue;
        }

        await this.repository.delete(
          this.config.dynamodbConversationsTableName,
          existingConversation.PK,
          existingConversation.SK,
        );
        removedUserIds.push(participantId);
      }

      return {
        participantIds,
        removedUserIds,
        summariesByUser: new Map(),
      };
    }

    const latestMessage = activeMessages[0];
    const kind = getConversationKind(access.conversationKey);
    const labelMap = await this.buildConversationLabelMap(
      access.conversationKey,
      access.participants,
    );
    const summariesByUser = new Map<string, StoredConversation>();

    for (const participantId of participantIds) {
      const existingConversation = await this.getConversationSummary(
        participantId,
        access.conversationKey,
      );
      const lastReadAt = this.resolveStoredLastReadAt(
        existingConversation,
        latestMessage.sentAt,
      );
      const nextConversation: StoredConversation = {
        PK: makeInboxPk(participantId),
        SK: makeConversationSummarySk(
          access.conversationKey,
          latestMessage.sentAt,
        ),
        entityType: 'CONVERSATION',
        GSI1PK: makeInboxStatsKey(participantId, kind),
        userId: participantId,
        conversationId: access.conversationKey,
        groupName:
          existingConversation?.groupName ??
          labelMap.get(participantId) ??
          participantId,
        lastMessagePreview: this.buildPreview(latestMessage),
        lastSenderName: latestMessage.senderName,
        unreadCount: this.computeUnreadCount(
          participantId,
          activeMessages,
          lastReadAt,
        ),
        isGroup: kind === 'GRP',
        deletedAt: null,
        updatedAt: latestMessage.sentAt,
        lastReadAt,
      };

      if (
        !this.hasConversationSummaryChanged(
          existingConversation,
          nextConversation,
        )
      ) {
        continue;
      }

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

    return {
      latestMessage,
      participantIds,
      removedUserIds: [],
      summariesByUser,
    };
  }

  private async resolveConversationSummaryParticipants(
    access: ResolvedConversationAccess,
  ): Promise<string[]> {
    const storedSummaries = await this.repository.scanAll<StoredConversation>(
      this.config.dynamodbConversationsTableName,
    );
    const summaryUserIds = storedSummaries
      .filter((summary) => summary.conversationId === access.conversationKey)
      .map((summary) => summary.userId);

    return Array.from(new Set([...access.participants, ...summaryUserIds]));
  }

  private async buildConversationLabelMap(
    conversationId: string,
    participants: string[],
  ): Promise<Map<string, string>> {
    const userMap = new Map<
      string,
      Awaited<ReturnType<UsersService['getByIdOrThrow']>>
    >();
    const labelMap = new Map<string, string>();

    for (const userId of participants) {
      userMap.set(userId, await this.usersService.getByIdOrThrow(userId));
    }

    for (const participantId of participants) {
      labelMap.set(
        participantId,
        await this.getConversationLabel(
          participantId,
          conversationId,
          participants,
          userMap,
        ),
      );
    }

    return labelMap;
  }

  private async listActiveMessages(
    conversationId: string,
  ): Promise<StoredMessage[]> {
    const items = await this.repository.queryByPk<StoredMessage>(
      this.config.dynamodbMessagesTableName,
      makeConversationPk(conversationId),
      {
        beginsWith: 'MSG#',
      },
    );

    return items.filter((item) => !item.deletedAt);
  }

  private computeUnreadCount(
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

  private resolveStoredLastReadAt(
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

  private getConversationLastMessageSentAt(
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

  private hasConversationSummaryChanged(
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
      current.lastReadAt !== next.lastReadAt
    );
  }

  private hasMeaningfulMessageBody(
    type: SupportedMessageType,
    content: string,
    attachmentUrl?: string,
  ): boolean {
    if (attachmentUrl) {
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

  private asSupportedMessageType(type: unknown): SupportedMessageType {
    if (typeof type !== 'string') {
      throw new BadRequestException('message type is invalid.');
    }

    if (!MESSAGE_TYPES.includes(type as SupportedMessageType)) {
      throw new BadRequestException('message type is invalid.');
    }

    return type as SupportedMessageType;
  }

  private emitConversationSummaryUpdated(
    participantId: string,
    conversationKey: string,
    summary: StoredConversation,
    reason: ChatConversationUpdatedEvent['reason'],
    occurredAt: string,
  ): void {
    const payload: ChatConversationUpdatedEvent = {
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

  private emitConversationRemoved(
    participantId: string,
    conversationKey: string,
    occurredAt: string,
  ): void {
    const payload: ChatConversationRemovedEvent = {
      conversationId: this.toPublicConversationId(
        participantId,
        conversationKey,
      ),
      conversationKey,
      reason: 'message.deleted',
      occurredAt,
    };

    this.chatRealtimeService.emitToUser(
      participantId,
      CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED,
      payload,
    );
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

  private serializeConversationSummary(
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

  private serializeMessage(
    actorId: string,
    message: StoredMessage,
  ): MessageItem {
    const item = toMessage(message);

    return {
      ...item,
      conversationId: this.toPublicConversationId(actorId, item.conversationId),
    };
  }

  private toPublicConversationId(
    actorId: string,
    conversationId: string,
  ): string {
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

  private normalizeStoredContent(
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

  private usesStructuredContent(type: SupportedMessageType): boolean {
    return type === 'TEXT' || type === 'EMOJI' || type === 'SYSTEM';
  }

  private tryParseStructuredContent(
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

  private extractPreviewText(rawContent: string): string | undefined {
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

  private buildPreview(message: StoredMessage): string {
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

  private async getConversationLabel(
    participantId: string,
    conversationId: string,
    participants: string[],
    userMap: Map<string, Awaited<ReturnType<UsersService['getByIdOrThrow']>>>,
  ): Promise<string> {
    if (isGroupConversationId(conversationId)) {
      const user = userMap.get(participantId);

      if (!user) {
        throw new NotFoundException('Conversation participant not found.');
      }

      const group = await this.groupsService.getGroup(
        {
          id: participantId,
          phone: user.phone,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          locationCode: user.locationCode,
          unit: user.unit,
          avatarUrl: user.avatarUrl,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        conversationId.slice('GRP#'.length),
      );
      return group.groupName;
    }

    const otherParticipantId = participants.find(
      (userId) => userId !== participantId,
    );

    if (!otherParticipantId) {
      throw new NotFoundException('Conversation participant not found.');
    }

    return userMap.get(otherParticipantId)?.fullName ?? otherParticipantId;
  }

  private async getConversationSummary(
    userId: string,
    conversationId: string,
  ): Promise<StoredConversation | undefined> {
    const items = await this.repository.queryByPk<StoredConversation>(
      this.config.dynamodbConversationsTableName,
      makeInboxPk(userId),
      {
        beginsWith: `CONV#${conversationId}#LAST#`,
        limit: 1,
      },
    );

    return items[0];
  }
}
