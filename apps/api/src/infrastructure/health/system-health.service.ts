import {
  BeforeApplicationShutdown,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { nowIso } from '@urban/shared-utils';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { RealtimeRedisService } from '../realtime/realtime-redis.service';
import {
  CircuitBreakerService,
  type CircuitBreakerSnapshot,
} from '../resilience/circuit-breaker.service';
import { S3StorageService } from '../storage/s3-storage.service';

export interface SystemHealthCheck {
  component: string;
  detail: string;
  status: 'ok' | 'error' | 'skipped' | 'shutting_down';
}

export interface SystemReadinessStatus {
  checks: SystemHealthCheck[];
  service: string;
  status: 'ok' | 'degraded';
  timestamp: string;
}

@Injectable()
export class SystemHealthService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private isBootstrapped = false;
  private isShuttingDown = false;

  constructor(
    private readonly dynamoDbService: DynamoDbService,
    private readonly s3StorageService: S3StorageService,
    private readonly realtimeRedisService: RealtimeRedisService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  onApplicationBootstrap(): void {
    this.isBootstrapped = true;
  }

  beforeApplicationShutdown(): void {
    this.isShuttingDown = true;
  }

  getLiveStatus(): { service: string; status: 'ok'; timestamp: string } {
    return {
      service: 'urban-management-api',
      status: 'ok',
      timestamp: nowIso(),
    };
  }

  async getReadinessStatus(): Promise<SystemReadinessStatus> {
    const checks: SystemHealthCheck[] = [
      {
        component: 'application',
        detail: this.isShuttingDown
          ? 'Application is shutting down.'
          : this.isBootstrapped
            ? 'Application bootstrapped.'
            : 'Application bootstrap is still in progress.',
        status: this.isShuttingDown
          ? 'shutting_down'
          : this.isBootstrapped
            ? 'ok'
            : 'error',
      },
    ];

    this.pushCircuitBreakerCheck(
      checks,
      'dynamodb-circuit-breaker',
      this.circuitBreakerService.getSnapshot('dynamodb'),
    );

    try {
      const connection = await this.dynamoDbService.checkConnection();
      checks.push({
        component: 'dynamodb',
        detail: `${connection.tableName}:${connection.tableStatus}`,
        status: connection.tableStatus === 'ACTIVE' ? 'ok' : 'error',
      });
    } catch (error) {
      checks.push({
        component: 'dynamodb',
        detail: error instanceof Error ? error.message : 'Unknown error.',
        status: 'error',
      });
    }

    const redisHealth = this.realtimeRedisService.getHealth();
    checks.push({
      component: 'redis',
      detail: redisHealth.detail,
      status: redisHealth.status,
    });

    const storageHealth = this.s3StorageService.getHealth();
    checks.push({
      component: 's3',
      detail: storageHealth.detail,
      status: storageHealth.configured ? 'ok' : 'skipped',
    });

    this.pushCircuitBreakerCheck(
      checks,
      's3-circuit-breaker',
      this.circuitBreakerService.getSnapshot('s3'),
      !storageHealth.configured,
    );

    const status = checks.every(
      (check) => check.status === 'ok' || check.status === 'skipped',
    )
      ? 'ok'
      : 'degraded';

    return {
      checks,
      service: 'urban-management-api',
      status,
      timestamp: nowIso(),
    };
  }

  private pushCircuitBreakerCheck(
    checks: SystemHealthCheck[],
    component: string,
    snapshot: CircuitBreakerSnapshot,
    skipped = false,
  ): void {
    if (skipped) {
      checks.push({
        component,
        detail: 'Skipped because the dependency is not configured.',
        status: 'skipped',
      });
      return;
    }

    const details = [
      `state=${snapshot.state}`,
      `failures=${snapshot.consecutiveFailures}`,
      snapshot.lastFailureAt
        ? `lastFailureAt=${snapshot.lastFailureAt}`
        : undefined,
      snapshot.lastFailureMessage
        ? `lastFailure=${snapshot.lastFailureMessage}`
        : undefined,
      snapshot.nextAttemptAt
        ? `nextAttemptAt=${snapshot.nextAttemptAt}`
        : undefined,
    ]
      .filter(Boolean)
      .join(', ');

    checks.push({
      component,
      detail: details,
      status: snapshot.state === 'open' ? 'error' : 'ok',
    });
  }
}
