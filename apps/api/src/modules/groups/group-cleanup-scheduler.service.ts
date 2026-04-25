import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { createUlid } from '@urban/shared-utils';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { RealtimeRedisService } from '../../infrastructure/realtime/realtime-redis.service';
import { GroupCleanupService } from './group-cleanup.service';

@Injectable()
export class GroupCleanupSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(GroupCleanupSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private runPromise?: Promise<void>;

  constructor(
    private readonly groupCleanupService: GroupCleanupService,
    private readonly realtimeRedisService: RealtimeRedisService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.groupDeleteCleanupEnabled) {
      return;
    }

    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return;
    }

    this.logger.log(
      `Group cleanup scheduler enabled (interval=${this.config.groupDeleteCleanupIntervalMs}ms).`,
    );
    this.timer = setInterval(() => {
      void this.runCleanupCycle();
    }, this.config.groupDeleteCleanupIntervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runCleanupCycle(): Promise<void> {
    if (this.runPromise) {
      await this.runPromise;
      return;
    }

    this.runPromise = this.runCleanupCycleInternal();

    try {
      await this.runPromise;
    } finally {
      this.runPromise = undefined;
    }
  }

  private async runCleanupCycleInternal(): Promise<void> {
    if (!(await this.acquireDistributedLock())) {
      return;
    }

    const result = await this.groupCleanupService.runPendingCleanupCycle();

    if (result.processedCount > 0) {
      this.logger.log(
        `Group cleanup processed ${result.processedCount} task(s). Remaining: ${result.remainingCount}.`,
      );
    }
  }

  private async acquireDistributedLock(): Promise<boolean> {
    if (!this.realtimeRedisService.enabled) {
      return true;
    }

    if (!this.realtimeRedisService.connected) {
      this.logger.warn(
        'Group cleanup skipped because Redis locking is enabled but Redis is not connected.',
      );
      return false;
    }

    const client = this.realtimeRedisService.getClient();

    if (!client) {
      this.logger.warn(
        'Group cleanup skipped because Redis client is unavailable.',
      );
      return false;
    }

    const result = await client.set(
      `${this.config.redisKeyPrefix}:maintenance:group-cleanup:lock`,
      createUlid(),
      {
        NX: true,
        PX: this.config.groupDeleteCleanupLockTtlMs,
      },
    );

    return result === 'OK';
  }
}
