import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { isRetryableInfrastructureError } from '../errors/infrastructure-error.utils';

export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerRecord {
  consecutiveFailures: number;
  halfOpenInFlight: boolean;
  lastFailureAt?: string;
  lastFailureMessage?: string;
  nextAttemptAtMs?: number;
  openedAtMs?: number;
  state: CircuitBreakerState;
}

export interface CircuitBreakerSnapshot {
  consecutiveFailures: number;
  lastFailureAt?: string;
  lastFailureMessage?: string;
  name: string;
  nextAttemptAt?: string;
  openedAt?: string;
  state: CircuitBreakerState;
}

@Injectable()
export class CircuitBreakerService {
  private readonly records = new Map<string, CircuitBreakerRecord>();

  constructor(private readonly config: AppConfigService) {}

  async execute<T>(
    name: string,
    serviceLabel: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const record = this.getRecord(name);
    const now = Date.now();

    if (record.state === 'open') {
      if ((record.nextAttemptAtMs ?? 0) > now) {
        throw this.createOpenError(serviceLabel, record);
      }

      record.state = 'half_open';
      record.halfOpenInFlight = false;
    }

    if (record.state === 'half_open') {
      if (record.halfOpenInFlight) {
        throw this.createOpenError(serviceLabel, record);
      }

      record.halfOpenInFlight = true;
    }

    try {
      const result = await action();
      this.reset(record);
      return result;
    } catch (error) {
      if (record.state === 'half_open') {
        record.halfOpenInFlight = false;
      }

      if (!isRetryableInfrastructureError(error)) {
        if (record.state === 'half_open') {
          this.reset(record);
        }

        throw error;
      }

      this.recordRetryableFailure(record, error);
      throw error;
    }
  }

  getSnapshot(name: string): CircuitBreakerSnapshot {
    const record = this.getRecord(name);

    return {
      consecutiveFailures: record.consecutiveFailures,
      lastFailureAt: record.lastFailureAt,
      lastFailureMessage: record.lastFailureMessage,
      name,
      nextAttemptAt: this.toIso(record.nextAttemptAtMs),
      openedAt: this.toIso(record.openedAtMs),
      state: record.state,
    };
  }

  private createOpenError(
    serviceLabel: string,
    record: CircuitBreakerRecord,
  ): ServiceUnavailableException {
    const detail = [
      `${serviceLabel} circuit breaker is open.`,
      record.lastFailureMessage
        ? `lastFailure=${record.lastFailureMessage}`
        : undefined,
      record.lastFailureAt
        ? `lastFailureAt=${record.lastFailureAt}`
        : undefined,
      record.nextAttemptAtMs
        ? `retryAfter=${this.toIso(record.nextAttemptAtMs)}`
        : undefined,
    ]
      .filter(Boolean)
      .join(' ');

    const error = new ServiceUnavailableException(
      `${serviceLabel} is temporarily unavailable. Please retry.`,
    );

    (error as ServiceUnavailableException & { detail?: string }).detail =
      detail;
    return error;
  }

  private getRecord(name: string): CircuitBreakerRecord {
    const existing = this.records.get(name);

    if (existing) {
      return existing;
    }

    const record: CircuitBreakerRecord = {
      consecutiveFailures: 0,
      halfOpenInFlight: false,
      state: 'closed',
    };

    this.records.set(name, record);
    return record;
  }

  private recordRetryableFailure(
    record: CircuitBreakerRecord,
    error: unknown,
  ): void {
    record.lastFailureAt = new Date().toISOString();
    record.lastFailureMessage = this.extractMessage(error) || 'Unknown error.';

    if (record.state === 'half_open') {
      this.open(record, Math.max(record.consecutiveFailures, 1));
      return;
    }

    const nextFailureCount = record.consecutiveFailures + 1;

    if (nextFailureCount >= this.config.circuitBreakerFailureThreshold) {
      this.open(record, nextFailureCount);
      return;
    }

    record.consecutiveFailures = nextFailureCount;
    record.state = 'closed';
    record.halfOpenInFlight = false;
  }

  private open(record: CircuitBreakerRecord, failureCount: number): void {
    const openedAtMs = Date.now();

    record.consecutiveFailures = failureCount;
    record.halfOpenInFlight = false;
    record.openedAtMs = openedAtMs;
    record.nextAttemptAtMs =
      openedAtMs + this.config.circuitBreakerOpenDurationMs;
    record.state = 'open';
  }

  private reset(record: CircuitBreakerRecord): void {
    record.consecutiveFailures = 0;
    record.halfOpenInFlight = false;
    record.nextAttemptAtMs = undefined;
    record.openedAtMs = undefined;
    record.state = 'closed';
  }

  private extractMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return typeof error === 'string' ? error : '';
  }

  private toIso(value: number | undefined): string | undefined {
    return value ? new Date(value).toISOString() : undefined;
  }
}
