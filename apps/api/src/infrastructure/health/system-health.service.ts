import {
  BeforeApplicationShutdown,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { nowIso } from '@urban/shared-utils';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
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

    const storageHealth = this.s3StorageService.getHealth();
    checks.push({
      component: 's3',
      detail: storageHealth.detail,
      status: storageHealth.configured ? 'ok' : 'skipped',
    });

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
}
