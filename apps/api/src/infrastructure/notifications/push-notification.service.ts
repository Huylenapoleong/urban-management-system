import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PUSH_DEVICE_PROVIDERS } from '@urban/shared-constants';
import type {
  ApiResponseMeta,
  ApiSuccessResponse,
  PushDevice,
} from '@urban/shared-types';
import {
  createUlid,
  makeInboxPk,
  makePushOutboxPk,
  makePushOutboxSk,
  makeUserPk,
  makeUserPushDeviceSk,
  nowIso,
} from '@urban/shared-utils';
import { createHash } from 'crypto';
import { buildPaginatedResponse } from '../../common/pagination';
import { toPushDevice } from '../../common/mappers';

export function makePushTokenLookupPk(pushToken: string): string {
  const digest = createHash('sha256').update(pushToken).digest('hex');
  return `PUSH_TOKEN#${digest}`;
}

export function makePushTokenLookupSk(): string {
  return 'LOOKUP';
}
import type {
  StoredConversation,
  StoredPushDevice,
  StoredPushTokenLookup,
  StoredPushOutboxEvent,
} from '../../common/storage-records';
import {
  ensureObject,
  optionalString,
  requiredEnum,
  requiredString,
} from '../../common/validation';
import { UrbanTableRepository } from '../dynamodb/urban-table.repository';
import { ChatPresenceService } from '../realtime/chat-presence.service';
import { AppConfigService } from '../config/app-config.service';

interface PushOutboxInput {
  actorUserId: string;
  eventName: StoredPushOutboxEvent['eventName'];
  recipientUserIds: string[];
  title: string;
  body: string;
  conversationId?: string;
  messageId?: string;
  reportId?: string;
  skipIfActive?: boolean;
  data?: Record<string, string>;
  occurredAt?: string;
}

@Injectable()
export class PushNotificationService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PushNotificationService.name);
  private outboxTimer?: NodeJS.Timeout;
  private outboxDrainPromise?: Promise<void>;

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly chatPresenceService: ChatPresenceService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return;
    }

    this.outboxTimer = setInterval(() => {
      void this.drainOutbox();
    }, this.config.pushOutboxPollIntervalMs);
    this.outboxTimer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
      this.outboxTimer = undefined;
    }
  }

  async listDevices(
    userId: string,
  ): Promise<ApiSuccessResponse<PushDevice[], ApiResponseMeta>> {
    const devices = await this.listStoredDevices(userId);

    return buildPaginatedResponse(
      devices
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(toPushDevice),
    );
  }

  async registerDevice(userId: string, payload: unknown): Promise<PushDevice> {
    const body = ensureObject(payload);
    const deviceId = requiredString(body, 'deviceId', {
      minLength: 3,
      maxLength: 120,
    });
    const provider = requiredEnum(body, 'provider', PUSH_DEVICE_PROVIDERS);
    const platform = requiredString(body, 'platform', {
      minLength: 2,
      maxLength: 50,
    });
    const pushToken = requiredString(body, 'pushToken', {
      minLength: 10,
      maxLength: 5000,
    });
    const appVariant = optionalString(body, 'appVariant', { maxLength: 50 });
    const now = nowIso();
    const existing = await this.repository.get<StoredPushDevice>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      makeUserPushDeviceSk(deviceId),
    );
    const conflictingLookup = await this.getPushTokenLookup(pushToken);

    const nextDevice: StoredPushDevice = {
      PK: makeUserPk(userId),
      SK: makeUserPushDeviceSk(deviceId),
      entityType: 'USER_PUSH_DEVICE',
      userId,
      deviceId,
      provider,
      platform,
      appVariant,
      pushToken,
      disabledAt: null,
      lastSeenAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const nextLookup: StoredPushTokenLookup = {
      PK: makePushTokenLookupPk(pushToken),
      SK: makePushTokenLookupSk(),
      entityType: 'USER_PUSH_TOKEN_LOOKUP',
      userId,
      deviceId,
      createdAt:
        conflictingLookup?.userId === userId &&
        conflictingLookup.deviceId === deviceId
          ? conflictingLookup.createdAt
          : now,
      updatedAt: now,
    };
    const writes: Parameters<UrbanTableRepository['transactWrite']>[0] = [
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: nextDevice,
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: nextLookup,
      },
    ];

    if (existing && existing.pushToken !== pushToken) {
      writes.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makePushTokenLookupPk(existing.pushToken),
          SK: makePushTokenLookupSk(),
        },
        conditionExpression:
          'attribute_not_exists(PK) OR (userId = :userId AND deviceId = :deviceId)',
        expressionAttributeValues: {
          ':userId': userId,
          ':deviceId': deviceId,
        },
      });
    }

    if (
      conflictingLookup &&
      (conflictingLookup.userId !== userId ||
        conflictingLookup.deviceId !== deviceId)
    ) {
      writes.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makeUserPk(conflictingLookup.userId),
          SK: makeUserPushDeviceSk(conflictingLookup.deviceId),
        },
      });
    }

    await this.repository.transactWrite(writes);
    return toPushDevice(nextDevice);
  }

  async deleteDevice(
    userId: string,
    deviceId: string,
  ): Promise<{ deviceId: string; removedAt: string }> {
    const existing = await this.repository.get<StoredPushDevice>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      makeUserPushDeviceSk(deviceId),
    );

    if (!existing || existing.entityType !== 'USER_PUSH_DEVICE') {
      throw new NotFoundException('Push device not found.');
    }
    const lookup = await this.getPushTokenLookup(existing.pushToken);
    const writes: Parameters<UrbanTableRepository['transactWrite']>[0] = [
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: existing.PK,
          SK: existing.SK,
        },
      },
    ];

    if (lookup?.userId === userId && lookup.deviceId === deviceId) {
      writes.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: lookup.PK,
          SK: lookup.SK,
        },
      });
    }

    await this.repository.transactWrite(writes);

    return {
      deviceId,
      removedAt: nowIso(),
    };
  }

  buildPushOutboxEvent(input: PushOutboxInput): StoredPushOutboxEvent {
    const createdAt = input.occurredAt ?? nowIso();
    const eventId = createUlid();
    const shardSeed =
      input.conversationId ??
      input.reportId ??
      input.recipientUserIds[0] ??
      input.actorUserId ??
      eventId;

    return {
      PK: makePushOutboxPk(this.getPushOutboxShard(shardSeed)),
      SK: makePushOutboxSk(createdAt, eventId),
      entityType: 'PUSH_OUTBOX_EVENT',
      eventId,
      eventName: input.eventName,
      actorUserId: input.actorUserId,
      recipientUserIds: Array.from(
        new Set(input.recipientUserIds.filter(Boolean)),
      ),
      title: input.title,
      body: input.body,
      conversationId: input.conversationId,
      messageId: input.messageId,
      reportId: input.reportId,
      skipIfActive: input.skipIfActive ?? this.config.pushSkipActiveUsers,
      data: input.data,
      createdAt,
    };
  }

  async deletePushOutboxEvent(event: StoredPushOutboxEvent): Promise<void> {
    await this.repository.delete(
      this.config.dynamodbUsersTableName,
      event.PK,
      event.SK,
    );
  }

  private async listStoredDevices(userId: string): Promise<StoredPushDevice[]> {
    const items = await this.repository.queryByPk<StoredPushDevice>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      { beginsWith: 'PUSH_DEVICE#' },
    );

    return items.filter((item) => item.entityType === 'USER_PUSH_DEVICE');
  }

  private async getPushTokenLookup(
    pushToken: string,
  ): Promise<StoredPushTokenLookup | undefined> {
    const lookup = await this.repository.get<StoredPushTokenLookup>(
      this.config.dynamodbUsersTableName,
      makePushTokenLookupPk(pushToken),
      makePushTokenLookupSk(),
    );

    if (!lookup || lookup.entityType !== 'USER_PUSH_TOKEN_LOOKUP') {
      return undefined;
    }

    return lookup;
  }
  private getPushOutboxShard(seed: string): number {
    const size = Math.max(this.config.pushOutboxShardCount, 1);
    let hash = 0;

    for (const char of seed) {
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
    for (let shard = 0; shard < this.config.pushOutboxShardCount; shard += 1) {
      await this.processOutboxShard(shard);
    }
  }

  private async processOutboxShard(shard: number): Promise<void> {
    const items = await this.repository.queryByPk<StoredPushOutboxEvent>(
      this.config.dynamodbUsersTableName,
      makePushOutboxPk(shard),
      {
        beginsWith: 'EVENT#',
        limit: this.config.pushOutboxBatchSize,
        scanForward: true,
      },
    );

    for (const item of items.filter(
      (entry) => entry.entityType === 'PUSH_OUTBOX_EVENT',
    )) {
      try {
        await this.processPushOutboxEvent(item);
        await this.deletePushOutboxEvent(item);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          `Push outbox replay failed (${item.eventName}/${item.eventId}): ${message}`,
        );
      }
    }
  }

  private async processPushOutboxEvent(
    event: StoredPushOutboxEvent,
  ): Promise<void> {
    const recipients = Array.from(
      new Set(
        event.recipientUserIds.filter((userId) => userId !== event.actorUserId),
      ),
    );

    for (const userId of recipients) {
      if (event.skipIfActive) {
        const presence = await this.chatPresenceService.getPresence(userId);

        if (presence.isActive) {
          continue;
        }
      }

      if (
        event.conversationId &&
        (await this.isConversationMuted(userId, event.conversationId))
      ) {
        continue;
      }

      const devices = (await this.listStoredDevices(userId)).filter(
        (device) => !device.disabledAt,
      );

      if (devices.length === 0) {
        continue;
      }

      for (const device of devices) {
        await this.dispatchToDevice(userId, device, event);
      }
    }
  }

  private async isConversationMuted(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const summaries = await this.repository.queryByPk<StoredConversation>(
      this.config.dynamodbConversationsTableName,
      makeInboxPk(userId),
      {
        beginsWith: `CONV#${conversationId}#LAST#`,
        limit: 1,
        scanForward: false,
      },
    );
    const summary = summaries.find(
      (item) =>
        item.entityType === 'CONVERSATION' &&
        item.conversationId === conversationId &&
        !item.deletedAt,
    );

    return Boolean(summary?.mutedUntil && summary.mutedUntil > nowIso());
  }

  private async dispatchToDevice(
    userId: string,
    device: StoredPushDevice,
    event: StoredPushOutboxEvent,
  ): Promise<void> {
    switch (this.config.pushProvider) {
      case 'disabled':
        return;
      case 'webhook': {
        if (!this.config.pushWebhookUrl) {
          this.logger.warn(
            'PUSH_PROVIDER=webhook but PUSH_WEBHOOK_URL is missing.',
          );
          return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, this.config.pushWebhookTimeoutMs);
        let response: Response;

        try {
          response = await fetch(this.config.pushWebhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              userId,
              deviceId: device.deviceId,
              provider: device.provider,
              platform: device.platform,
              pushToken: device.pushToken,
              notification: {
                title: event.title,
                body: event.body,
              },
              data: event.data ?? {},
              eventName: event.eventName,
              eventId: event.eventId,
              createdAt: event.createdAt,
            }),
            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted) {
            throw new Error(
              `Push webhook timed out after ${this.config.pushWebhookTimeoutMs}ms.`,
            );
          }

          throw error;
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          throw new Error(
            `Push webhook failed with status ${response.status}.`,
          );
        }

        return;
      }
      case 'log':
      default:
        this.logger.log(
          `Push queued to ${userId}/${device.deviceId} (${event.eventName}): ${event.title} | ${event.body}`,
        );
    }
  }
}
