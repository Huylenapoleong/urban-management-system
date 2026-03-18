import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  createUlid,
  isDmConversationId,
  isGroupConversationId,
  makeConversationPk,
  makeGroupPk,
  nowIso,
} from '@urban/shared-utils';
import type {
  StoredChatOutboxEvent,
  StoredMembership,
  StoredMessage,
  StoredMessageRef,
} from '../../common/storage-records';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { RealtimeRedisService } from '../../infrastructure/realtime/realtime-redis.service';
import {
  ConversationSummaryService,
  type ConversationSummaryAccess,
} from './conversation-summary.service';
import { ConversationDispatchService } from './conversation-dispatch.service';

export interface ChatOutboxBuildInput {
  actorUserId: string;
  clientMessageId?: string;
  conversationId: string;
  eventName: StoredChatOutboxEvent['eventName'];
  messageId?: string;
  occurredAt?: string;
}

@Injectable()
export class ChatOutboxService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ChatOutboxService.name);
  private outboxTimer?: NodeJS.Timeout;
  private outboxDrainPromise?: Promise<void>;

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly conversationSummaryService: ConversationSummaryService,
    private readonly conversationDispatchService: ConversationDispatchService,
    private readonly realtimeRedisService: RealtimeRedisService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return;
    }

    this.outboxTimer = setInterval(() => {
      void this.drainOutbox();
    }, this.config.chatOutboxPollIntervalMs);
    this.outboxTimer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
      this.outboxTimer = undefined;
    }
  }

  buildChatOutboxEvent(input: ChatOutboxBuildInput): StoredChatOutboxEvent {
    const createdAt = input.occurredAt ?? nowIso();
    const eventId = createUlid();

    return {
      PK: this.makeChatOutboxPk(input.conversationId),
      SK: this.makeChatOutboxSk(createdAt, eventId),
      entityType: 'CHAT_OUTBOX_EVENT',
      eventId,
      eventName: input.eventName,
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
      messageId: input.messageId,
      clientMessageId: input.clientMessageId,
      createdAt,
    };
  }

  async deleteChatOutboxEvent(event: StoredChatOutboxEvent): Promise<void> {
    await this.repository.delete(
      this.config.dynamodbConversationsTableName,
      event.PK,
      event.SK,
    );
  }

  private makeChatOutboxPk(conversationId: string): string {
    return `OUTBOX#CHAT#${this.getChatOutboxShard(conversationId)}`;
  }

  private makeChatOutboxSk(createdAt: string, eventId: string): string {
    return `EVENT#${createdAt}#${eventId}`;
  }

  private getChatOutboxShard(conversationId: string): number {
    const size = Math.max(this.config.chatOutboxShardCount, 1);
    let hash = 0;

    for (const char of conversationId) {
      hash = (hash + char.charCodeAt(0)) % size;
    }

    return hash;
  }

  private async drainOutbox(): Promise<void> {
    if (this.outboxDrainPromise) {
      await this.outboxDrainPromise;
      return;
    }

    this.outboxDrainPromise = this.runOutboxDrain();

    try {
      await this.outboxDrainPromise;
    } finally {
      this.outboxDrainPromise = undefined;
    }
  }

  private async runOutboxDrain(): Promise<void> {
    const lockToken = await this.acquireOutboxDrainLock();

    if (!lockToken) {
      return;
    }

    try {
      for (
        let shard = 0;
        shard < this.config.chatOutboxShardCount;
        shard += 1
      ) {
        await this.processOutboxShard(shard);
      }
    } finally {
      await this.releaseOutboxDrainLock(lockToken);
    }
  }

  private async processOutboxShard(shard: number): Promise<void> {
    const items = await this.repository.queryByPk<StoredChatOutboxEvent>(
      this.config.dynamodbConversationsTableName,
      `OUTBOX#CHAT#${shard}`,
      {
        beginsWith: 'EVENT#',
        limit: this.config.chatOutboxBatchSize,
        scanForward: true,
      },
    );

    for (const item of items.filter(
      (entry) => entry.entityType === 'CHAT_OUTBOX_EVENT',
    )) {
      try {
        await this.processChatOutboxEvent(item);
        await this.deleteChatOutboxEvent(item);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          `Chat outbox replay failed (${item.eventName}/${item.eventId}): ${message}`,
        );
      }
    }
  }

  private async processChatOutboxEvent(
    event: StoredChatOutboxEvent,
  ): Promise<void> {
    switch (event.eventName) {
      case 'message.created': {
        if (!event.messageId) {
          return;
        }

        const message = await this.getMessageOrThrow(
          event.conversationId,
          event.messageId,
        );
        const participants =
          await this.resolveConversationParticipantsForDispatch(
            event.conversationId,
          );
        const summariesByUser =
          await this.conversationSummaryService.upsertConversationSummaries(
            event.conversationId,
            participants,
            message,
          );

        this.conversationDispatchService.emitMessageCreated(
          event.eventId,
          event.actorUserId,
          message,
          participants,
          summariesByUser,
          event.clientMessageId,
        );
        return;
      }
      case 'message.updated': {
        if (!event.messageId) {
          return;
        }

        const message = await this.getMessageOrThrow(
          event.conversationId,
          event.messageId,
        );
        const access = await this.buildDispatchAccess(event.conversationId);
        const syncResult =
          await this.conversationSummaryService.syncConversationSummariesAfterMessageMutation(
            access,
          );

        this.conversationDispatchService.emitMessageUpdated(
          event.eventId,
          event.actorUserId,
          message,
          access.conversationKey,
          syncResult,
        );
        return;
      }
      case 'message.deleted': {
        if (!event.messageId) {
          return;
        }

        const message = await this.getMessageOrThrow(
          event.conversationId,
          event.messageId,
        );
        const access = await this.buildDispatchAccess(event.conversationId);
        const syncResult =
          await this.conversationSummaryService.syncConversationSummariesAfterMessageMutation(
            access,
          );

        this.conversationDispatchService.emitMessageDeleted(
          event.eventId,
          event.actorUserId,
          message,
          access.conversationKey,
          syncResult,
        );
        return;
      }
      case 'conversation.read': {
        const access = await this.buildDispatchAccess(event.conversationId);
        const actorConversation =
          await this.conversationSummaryService.getConversationSummary(
            event.actorUserId,
            event.conversationId,
          );

        if (!actorConversation) {
          return;
        }

        await this.conversationDispatchService.emitConversationRead(
          event.eventId,
          event.actorUserId,
          access.conversationKey,
          access.participants,
          actorConversation,
        );
        return;
      }
    }
  }

  private async buildDispatchAccess(
    conversationKey: string,
  ): Promise<ConversationSummaryAccess> {
    const participants =
      await this.resolveConversationParticipantsForDispatch(conversationKey);

    return {
      conversationKey,
      participants,
    };
  }

  private async resolveConversationParticipantsForDispatch(
    conversationId: string,
  ): Promise<string[]> {
    if (isGroupConversationId(conversationId)) {
      const groupId = conversationId.slice('GRP#'.length);
      const memberships = await this.repository.queryByPk<StoredMembership>(
        this.config.dynamodbMembershipsTableName,
        makeGroupPk(groupId),
        {
          beginsWith: 'MEMBER#',
        },
      );

      return memberships
        .filter((membership) => !membership.deletedAt)
        .map((membership) => membership.userId);
    }

    if (!isDmConversationId(conversationId)) {
      throw new BadRequestException('Unsupported conversation id.');
    }

    const participantIds = conversationId.slice('DM#'.length).split('#');

    if (participantIds.length !== 2) {
      throw new BadRequestException('Invalid DM conversation id.');
    }

    return participantIds;
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

    return matchedMessage;
  }

  private makeMessageReferenceSk(messageId: string): string {
    return `MSGREF#${messageId}`;
  }

  private async acquireOutboxDrainLock(): Promise<string | undefined> {
    const redisClient = this.realtimeRedisService.getClient();

    if (!redisClient) {
      return 'local';
    }

    const token = createUlid();
    const result = await redisClient.set(
      `${this.config.redisKeyPrefix}:chat:outbox:lock`,
      token,
      {
        NX: true,
        PX: Math.max(this.config.chatOutboxPollIntervalMs * 2, 5_000),
      },
    );

    return result === 'OK' ? token : undefined;
  }

  private async releaseOutboxDrainLock(token: string): Promise<void> {
    const redisClient = this.realtimeRedisService.getClient();

    if (!redisClient || token === 'local') {
      return;
    }

    const key = `${this.config.redisKeyPrefix}:chat:outbox:lock`;
    const currentToken = await redisClient.get(key);

    if (currentToken === token) {
      await redisClient.del(key);
    }
  }
}
