import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { createUlid } from '@urban/shared-utils';
import { AppConfigService } from '../config/app-config.service';
import { ObservabilityService } from '../observability/observability.service';
import { RealtimeRedisService } from '../realtime/realtime-redis.service';
import { RetentionMaintenanceService } from './retention-maintenance.service';

@Injectable()
export class RetentionMaintenanceSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(
    RetentionMaintenanceSchedulerService.name,
  );
  private timer?: NodeJS.Timeout;
  private runPromise?: Promise<void>;

  constructor(
    private readonly retentionMaintenanceService: RetentionMaintenanceService,
    private readonly realtimeRedisService: RealtimeRedisService,
    private readonly observabilityService: ObservabilityService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.retentionMaintenanceEnabled) {
      return;
    }

    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return;
    }

    this.logger.log(
      `Retention maintenance scheduler enabled (interval=${this.config.retentionMaintenanceIntervalMs}ms).`,
    );
    this.timer = setInterval(() => {
      void this.runMaintenanceCycle();
    }, this.config.retentionMaintenanceIntervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runMaintenanceCycle(): Promise<void> {
    if (this.runPromise) {
      await this.runPromise;
      return;
    }

    this.runPromise = this.runMaintenanceCycleInternal();

    try {
      await this.runPromise;
    } finally {
      this.runPromise = undefined;
    }
  }

  private async runMaintenanceCycleInternal(): Promise<void> {
    if (!(await this.acquireDistributedLock())) {
      return;
    }

    const result = await this.retentionMaintenanceService.purgeSystem();
    this.observabilityService.recordRetentionRun(
      result.totalCandidates,
      result.totalDeleted,
    );

    if (result.totalDeleted > 0) {
      this.logger.log(
        `Retention maintenance purged ${result.totalDeleted} records across ${result.buckets.length} categories.`,
      );
      return;
    }

    this.logger.log('Retention maintenance found no eligible records.');
  }

  private async acquireDistributedLock(): Promise<boolean> {
    if (!this.realtimeRedisService.enabled) {
      return true;
    }

    if (!this.realtimeRedisService.connected) {
      this.logger.warn(
        'Retention maintenance skipped because Redis locking is enabled but Redis is not connected.',
      );
      return false;
    }

    const client = this.realtimeRedisService.getClient();

    if (!client) {
      this.logger.warn(
        'Retention maintenance skipped because Redis client is unavailable.',
      );
      return false;
    }

    const token = createUlid();
    const result = await client.set(
      `${this.config.redisKeyPrefix}:maintenance:retention:lock`,
      token,
      {
        NX: true,
        PX: this.config.retentionMaintenanceLockTtlMs,
      },
    );

    return result === 'OK';
  }
}
