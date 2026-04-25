import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import type { ChatPresenceState } from '@urban/shared-types';
import { nowIso } from '@urban/shared-utils';
import { createClient } from 'redis';
import { AppConfigService } from '../config/app-config.service';
import { RealtimeRedisService } from './realtime-redis.service';

@Injectable()
export class ChatPresenceService implements OnApplicationShutdown {
  private readonly logger = new Logger(ChatPresenceService.name);
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly memorySocketsByUser = new Map<string, Set<string>>();
  private readonly memoryLastSeen = new Map<string, string>();
  private readonly memoryLastActivity = new Map<string, string>();
  private readonly memoryRecentActivityExpiresAt = new Map<string, number>();
  private readonly httpActivityThrottleMs = 10_000;
  private readonly lastHttpActivityWriteAt = new Map<string, number>();

  constructor(
    private readonly config: AppConfigService,
    private readonly realtimeRedisService: RealtimeRedisService,
  ) {}

  async attachSocket(userId: string, socketId: string): Promise<void> {
    await this.touchSocket(userId, socketId);
    this.startHeartbeat(userId, socketId);
  }

  async detachSocket(
    userId: string,
    socketId: string,
  ): Promise<ChatPresenceState> {
    this.stopHeartbeat(socketId);

    if (this.realtimeRedisService.enabled) {
      return this.detachRedisSocket(userId, socketId);
    }

    return this.detachMemorySocket(userId, socketId);
  }

  async touchSocket(userId: string, socketId: string): Promise<void> {
    if (this.realtimeRedisService.enabled) {
      await this.touchRedisSocket(userId, socketId);
      return;
    }

    const sockets = this.memorySocketsByUser.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.memorySocketsByUser.set(userId, sockets);
    this.touchMemoryActivity(userId);
  }

  async recordHttpActivity(userId: string): Promise<void> {
    const nowMs = Date.now();
    const lastWrittenAt = this.lastHttpActivityWriteAt.get(userId) ?? 0;

    if (nowMs - lastWrittenAt < this.httpActivityThrottleMs) {
      return;
    }

    this.lastHttpActivityWriteAt.set(userId, nowMs);

    if (this.realtimeRedisService.enabled) {
      await this.touchRedisActivity(userId);
      return;
    }

    this.touchMemoryActivity(userId);
  }

  async getPresence(userId: string): Promise<ChatPresenceState> {
    if (this.realtimeRedisService.enabled) {
      return this.getRedisPresence(userId);
    }

    return this.getMemoryPresence(userId);
  }

  async listPresence(userIds: string[]): Promise<ChatPresenceState[]> {
    return Promise.all(userIds.map((userId) => this.getPresence(userId)));
  }

  onApplicationShutdown(): void {
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }

    this.heartbeatTimers.clear();
  }

  private startHeartbeat(userId: string, socketId: string): void {
    this.stopHeartbeat(socketId);

    const heartbeatMs =
      Math.max(this.config.chatPresenceHeartbeatSeconds, 5) * 1000;
    const timer = setInterval(() => {
      void this.touchSocket(userId, socketId).catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          `Failed to refresh presence for ${userId}/${socketId}: ${message}`,
        );
      });
    }, heartbeatMs);

    this.heartbeatTimers.set(socketId, timer);
  }

  private stopHeartbeat(socketId: string): void {
    const timer = this.heartbeatTimers.get(socketId);

    if (!timer) {
      return;
    }

    clearInterval(timer);
    this.heartbeatTimers.delete(socketId);
  }

  private async touchRedisSocket(
    userId: string,
    socketId: string,
  ): Promise<void> {
    const client = this.requireRedisClient();
    const expiresAtMs = Date.now() + this.config.chatPresenceTtlSeconds * 1000;
    const ttlSeconds = Math.max(this.config.chatPresenceTtlSeconds * 2, 60);
    const occurredAt = nowIso();

    await client
      .multi()
      .zAdd(this.makeSocketsKey(userId), {
        score: expiresAtMs,
        value: socketId,
      })
      .expire(this.makeSocketsKey(userId), ttlSeconds)
      .set(this.makeRecentActivityKey(userId), occurredAt, {
        EX: this.config.chatPresenceTtlSeconds,
      })
      .set(this.makeLastActivityKey(userId), occurredAt, {
        EX: this.config.chatPresenceLastSeenTtlSeconds,
      })
      .exec();
  }

  private async touchRedisActivity(userId: string): Promise<void> {
    const client = this.requireRedisClient();
    const occurredAt = nowIso();

    await client
      .multi()
      .set(this.makeRecentActivityKey(userId), occurredAt, {
        EX: this.config.chatPresenceTtlSeconds,
      })
      .set(this.makeLastActivityKey(userId), occurredAt, {
        EX: this.config.chatPresenceLastSeenTtlSeconds,
      })
      .exec();
  }

  private async detachRedisSocket(
    userId: string,
    socketId: string,
  ): Promise<ChatPresenceState> {
    const client = this.requireRedisClient();
    const occurredAt = nowIso();

    await client
      .multi()
      .zRem(this.makeSocketsKey(userId), socketId)
      .del(this.makeRecentActivityKey(userId))
      .set(this.makeLastSeenKey(userId), occurredAt, {
        EX: this.config.chatPresenceLastSeenTtlSeconds,
      })
      .exec();

    return this.getRedisPresence(userId, occurredAt);
  }

  private async getRedisPresence(
    userId: string,
    occurredAt = nowIso(),
  ): Promise<ChatPresenceState> {
    const client = this.requireRedisClient();
    await client.zRemRangeByScore(this.makeSocketsKey(userId), 0, Date.now());

    const [activeSocketCount, recentActivityAt, lastSeenAt, lastActivityAt] =
      await Promise.all([
        client.zCard(this.makeSocketsKey(userId)),
        client.get(this.makeRecentActivityKey(userId)),
        client.get(this.makeLastSeenKey(userId)),
        client.get(this.makeLastActivityKey(userId)),
      ]);
    const isActive = activeSocketCount > 0 || Boolean(recentActivityAt);

    return {
      userId,
      isActive,
      activeSocketCount,
      lastSeenAt: isActive
        ? undefined
        : this.pickLatestTimestamp(lastSeenAt, lastActivityAt),
      occurredAt,
    };
  }

  private detachMemorySocket(
    userId: string,
    socketId: string,
  ): ChatPresenceState {
    const sockets = this.memorySocketsByUser.get(userId);

    if (sockets) {
      sockets.delete(socketId);

      if (sockets.size === 0) {
        this.memorySocketsByUser.delete(userId);
        this.memoryRecentActivityExpiresAt.delete(userId);
      }
    }

    const occurredAt = nowIso();
    this.memoryLastSeen.set(userId, occurredAt);
    return this.getMemoryPresence(userId, occurredAt);
  }

  private getMemoryPresence(
    userId: string,
    occurredAt = nowIso(),
  ): ChatPresenceState {
    const activeSocketCount = this.memorySocketsByUser.get(userId)?.size ?? 0;
    const nowMs = Date.now();
    const recentActivityExpiresAt =
      this.memoryRecentActivityExpiresAt.get(userId) ?? 0;
    const hasRecentActivity = recentActivityExpiresAt > nowMs;

    if (!hasRecentActivity && recentActivityExpiresAt > 0) {
      this.memoryRecentActivityExpiresAt.delete(userId);
    }

    const isActive = activeSocketCount > 0 || hasRecentActivity;

    return {
      userId,
      isActive,
      activeSocketCount,
      lastSeenAt: isActive
        ? undefined
        : this.pickLatestTimestamp(
            this.memoryLastSeen.get(userId),
            this.memoryLastActivity.get(userId),
          ),
      occurredAt,
    };
  }

  private touchMemoryActivity(userId: string, occurredAt = nowIso()): void {
    this.memoryRecentActivityExpiresAt.set(
      userId,
      Date.now() + this.config.chatPresenceTtlSeconds * 1000,
    );
    this.memoryLastActivity.set(userId, occurredAt);
  }

  private pickLatestTimestamp(
    ...values: Array<string | null | undefined>
  ): string | undefined {
    return values
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left))[0];
  }

  private requireRedisClient(): ReturnType<typeof createClient> {
    const client = this.realtimeRedisService.getClient();

    if (!client) {
      throw new Error('Redis client is not connected.');
    }

    return client;
  }

  private makeSocketsKey(userId: string): string {
    return `${this.config.redisKeyPrefix}:presence:user:${userId}:sockets`;
  }

  private makeLastSeenKey(userId: string): string {
    return `${this.config.redisKeyPrefix}:presence:user:${userId}:last-seen`;
  }

  private makeRecentActivityKey(userId: string): string {
    return `${this.config.redisKeyPrefix}:presence:user:${userId}:recent-activity`;
  }

  private makeLastActivityKey(userId: string): string {
    return `${this.config.redisKeyPrefix}:presence:user:${userId}:last-activity`;
  }
}
