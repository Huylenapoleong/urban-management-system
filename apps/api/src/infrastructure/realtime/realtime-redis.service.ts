import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { AppConfigService } from '../config/app-config.service';

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class RealtimeRedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeRedisService.name);
  private dataClient?: RedisClient;
  private pubClient?: RedisClient;
  private subClient?: RedisClient;
  private adapterFactory?: ReturnType<typeof createAdapter>;
  private connectPromise?: Promise<void>;
  private lastError?: string;

  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.redisUrl);
  }

  get connected(): boolean {
    return Boolean(
      this.dataClient?.isReady &&
      this.pubClient?.isReady &&
      this.subClient?.isReady,
    );
  }

  async connect(): Promise<void> {
    if (!this.enabled || this.connected) {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.connectInternal();
    }

    await this.connectPromise;
  }

  getAdapterFactory(): ReturnType<typeof createAdapter> | undefined {
    return this.adapterFactory;
  }

  getClient(): RedisClient | undefined {
    return this.dataClient;
  }

  getHealth(): {
    detail: string;
    enabled: boolean;
    status: 'ok' | 'error' | 'skipped';
  } {
    if (!this.enabled) {
      return {
        enabled: false,
        status: 'skipped',
        detail: 'Redis is not configured.',
      };
    }

    if (this.connected) {
      return {
        enabled: true,
        status: 'ok',
        detail: 'connected',
      };
    }

    return {
      enabled: true,
      status: 'error',
      detail: this.lastError ?? 'disconnected',
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([
      this.closeClient(this.dataClient),
      this.closeClient(this.pubClient),
      this.closeClient(this.subClient),
    ]);
  }

  private async connectInternal(): Promise<void> {
    const url = this.config.redisUrl;

    if (!url) {
      return;
    }

    const baseClient = createClient({ url });
    const pubClient = baseClient.duplicate();
    const subClient = baseClient.duplicate();

    for (const client of [baseClient, pubClient, subClient]) {
      client.on('error', (error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown Redis error.';
        this.lastError = message;
        this.logger.error(message);
      });
    }

    await Promise.all([
      baseClient.connect(),
      pubClient.connect(),
      subClient.connect(),
    ]);

    this.dataClient = baseClient;
    this.pubClient = pubClient;
    this.subClient = subClient;
    this.adapterFactory = createAdapter(pubClient, subClient, {
      key: `${this.config.redisKeyPrefix}:socket.io`,
    });
    this.lastError = undefined;
    this.logger.log(
      `Redis realtime adapter connected (${this.getSanitizedRedisTarget()}).`,
    );
  }

  private getSanitizedRedisTarget(): string {
    const rawUrl = this.config.redisUrl;

    if (!rawUrl) {
      return 'redis';
    }

    try {
      const parsed = new URL(rawUrl);
      return parsed.port
        ? `${parsed.hostname}:${parsed.port}`
        : parsed.hostname;
    } catch {
      return 'redis';
    }
  }

  private async closeClient(client: RedisClient | undefined): Promise<void> {
    if (!client?.isOpen) {
      return;
    }

    await client.quit();
  }
}
