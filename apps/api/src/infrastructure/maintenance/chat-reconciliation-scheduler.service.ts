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
import {
  ChatReconciliationService,
  type ChatReconciliationPreview,
  type ChatReconciliationRepairResult,
} from './chat-reconciliation.service';

@Injectable()
export class ChatReconciliationSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ChatReconciliationSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private runPromise?: Promise<void>;

  constructor(
    private readonly chatReconciliationService: ChatReconciliationService,
    private readonly realtimeRedisService: RealtimeRedisService,
    private readonly observabilityService: ObservabilityService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.chatReconciliationMaintenanceEnabled) {
      return;
    }

    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return;
    }

    this.logger.log(
      `Chat reconciliation scheduler enabled (mode=${this.config.chatReconciliationMaintenanceMode}, interval=${this.config.chatReconciliationMaintenanceIntervalMs}ms).`,
    );
    this.timer = setInterval(() => {
      void this.runMaintenanceCycle();
    }, this.config.chatReconciliationMaintenanceIntervalMs);
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

    if (this.config.chatReconciliationMaintenanceMode === 'repair') {
      const result: ChatReconciliationRepairResult =
        await this.chatReconciliationService.repairSystem();

      this.recordResult(
        result.totalCandidates,
        result.totalUpdated,
        result.totalDeleted,
        'repair',
      );

      if (result.totalCandidates === 0) {
        this.logger.log('Chat reconciliation found no drift candidates.');
        return;
      }

      this.logger.log(
        `Chat reconciliation repaired ${String(result.totalUpdated)} summaries and deleted ${String(result.totalDeleted)} orphaned summaries from ${String(result.totalCandidates)} candidates.`,
      );
      return;
    }

    const result: ChatReconciliationPreview =
      await this.chatReconciliationService.previewSystem();

    this.recordResult(result.totalCandidates, 0, 0, 'preview');

    if (result.totalCandidates === 0) {
      this.logger.log('Chat reconciliation found no drift candidates.');
      return;
    }

    this.logger.warn(
      `Chat reconciliation preview found ${String(result.totalCandidates)} drift candidates.`,
    );
  }

  private recordResult(
    totalCandidates: number,
    totalUpdated: number,
    totalDeleted: number,
    mode: 'preview' | 'repair',
  ): void {
    this.observabilityService.recordChatReconciliationRun(
      totalCandidates,
      totalUpdated,
      totalDeleted,
      mode,
    );
  }

  private async acquireDistributedLock(): Promise<boolean> {
    if (!this.realtimeRedisService.enabled) {
      return true;
    }

    if (!this.realtimeRedisService.connected) {
      this.logger.warn(
        'Chat reconciliation skipped because Redis locking is enabled but Redis is not connected.',
      );
      return false;
    }

    const client = this.realtimeRedisService.getClient();

    if (!client) {
      this.logger.warn(
        'Chat reconciliation skipped because Redis client is unavailable.',
      );
      return false;
    }

    const token = createUlid();
    const result = await client.set(
      `${this.config.redisKeyPrefix}:maintenance:chat-reconciliation:lock`,
      token,
      {
        NX: true,
        PX: this.config.chatReconciliationMaintenanceLockTtlMs,
      },
    );

    return result === 'OK';
  }
}
