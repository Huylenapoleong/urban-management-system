import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { makePushOutboxPk, nowIso } from '@urban/shared-utils';
import type {
  StoredChatOutboxEvent,
  StoredPushOutboxEvent,
} from '../../common/storage-records';
import { AppConfigService } from '../config/app-config.service';
import { UrbanTableRepository } from '../dynamodb/urban-table.repository';
import {
  CircuitBreakerService,
  type CircuitBreakerSnapshot,
  type CircuitBreakerState,
} from '../resilience/circuit-breaker.service';

const METRIC_PREFIX = 'urban_api';
const CIRCUIT_BREAKER_STATES: CircuitBreakerState[] = [
  'closed',
  'open',
  'half_open',
];
const CHAT_RECONCILIATION_MODES = ['preview', 'repair'] as const;

type ChatReconciliationMaintenanceMode =
  (typeof CHAT_RECONCILIATION_MODES)[number];

export type SessionRevocationReason =
  | 'logout'
  | 'logout_all'
  | 'refresh_rotation'
  | 'session_revoke'
  | 'session_scope_replace'
  | 'user_status'
  | 'legacy_refresh_migration'
  | 'password_change'
  | 'password_forgot_reset'
  | 'account_deactivate'
  | 'account_delete';

interface HttpRequestMetric {
  durationMs: number;
  method: string;
  request: Request;
  requestId: string;
  statusCode: number;
}

interface OutboxGauge {
  oldestAgeMs: number;
  oldestCreatedAt?: string;
  pendingCount: number;
}

export interface ObservabilitySnapshot {
  service: string;
  timestamp: string;
  counters: {
    httpRequestsTotal: number;
    httpResponses429Total: number;
    httpResponses503Total: number;
    httpResponsesByStatusCode: Record<string, number>;
    retentionCandidatesPurgedTotal: number;
    retentionCandidatesSeenTotal: number;
    retentionRunsTotal: number;
    chatReconciliationCandidatesDeletedTotal: number;
    chatReconciliationCandidatesSeenTotal: number;
    chatReconciliationCandidatesUpdatedTotal: number;
    chatReconciliationRunsTotal: number;
    sessionRevocationsTotal: number;
    sessionRevocationsByReason: Record<string, number>;
  };
  timings: {
    httpAverageDurationMs: number;
  };
  gauges: {
    chatOutbox: OutboxGauge;
    pushOutbox: OutboxGauge;
  };
  maintenance: {
    lastRetentionRunAt?: string;
    lastRetentionDeletedCount?: number;
    lastRetentionCandidateCount?: number;
    lastChatReconciliationRunAt?: string;
    lastChatReconciliationCandidateCount?: number;
    lastChatReconciliationUpdatedCount?: number;
    lastChatReconciliationDeletedCount?: number;
    lastChatReconciliationMode?: ChatReconciliationMaintenanceMode;
  };
  circuitBreakers: CircuitBreakerSnapshot[];
}

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  private readonly httpResponsesByStatusCode = new Map<number, number>();
  private readonly sessionRevocationsByReason = new Map<
    SessionRevocationReason,
    number
  >();
  private httpRequestsTotal = 0;
  private httpResponses429Total = 0;
  private httpResponses503Total = 0;
  private httpDurationTotalMs = 0;
  private retentionCandidatesPurgedTotal = 0;
  private retentionCandidatesSeenTotal = 0;
  private retentionRunsTotal = 0;
  private chatReconciliationCandidatesDeletedTotal = 0;
  private chatReconciliationCandidatesSeenTotal = 0;
  private chatReconciliationCandidatesUpdatedTotal = 0;
  private chatReconciliationRunsTotal = 0;
  private sessionRevocationsTotal = 0;
  private lastRetentionRunAt?: string;
  private lastRetentionDeletedCount?: number;
  private lastRetentionCandidateCount?: number;
  private lastChatReconciliationRunAt?: string;
  private lastChatReconciliationCandidateCount?: number;
  private lastChatReconciliationUpdatedCount?: number;
  private lastChatReconciliationDeletedCount?: number;
  private lastChatReconciliationMode?: ChatReconciliationMaintenanceMode;

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly config: AppConfigService,
  ) {}

  recordHttpRequest(metric: HttpRequestMetric): void {
    this.httpRequestsTotal += 1;
    this.httpDurationTotalMs += metric.durationMs;
    this.httpResponsesByStatusCode.set(
      metric.statusCode,
      (this.httpResponsesByStatusCode.get(metric.statusCode) ?? 0) + 1,
    );

    if (metric.statusCode === 429) {
      this.httpResponses429Total += 1;
    }

    if (metric.statusCode === 503) {
      this.httpResponses503Total += 1;
    }

    const payload = {
      durationMs: Number(metric.durationMs.toFixed(2)),
      method: metric.method,
      path: this.getNormalizedRoute(metric.request),
      requestId: metric.requestId,
      statusCode: metric.statusCode,
      timestamp: nowIso(),
      userId: this.extractUserId(metric.request),
    };

    this.logger.log(JSON.stringify(payload));
  }

  recordSessionRevocations(
    reason: SessionRevocationReason,
    count: number,
  ): void {
    if (count <= 0) {
      return;
    }

    this.sessionRevocationsTotal += count;
    this.sessionRevocationsByReason.set(
      reason,
      (this.sessionRevocationsByReason.get(reason) ?? 0) + count,
    );
  }

  recordRetentionRun(candidateCount: number, deletedCount: number): void {
    this.retentionRunsTotal += 1;
    this.retentionCandidatesSeenTotal += candidateCount;
    this.retentionCandidatesPurgedTotal += deletedCount;
    this.lastRetentionRunAt = nowIso();
    this.lastRetentionDeletedCount = deletedCount;
    this.lastRetentionCandidateCount = candidateCount;
  }

  recordChatReconciliationRun(
    candidateCount: number,
    updatedCount: number,
    deletedCount: number,
    mode: ChatReconciliationMaintenanceMode,
  ): void {
    this.chatReconciliationRunsTotal += 1;
    this.chatReconciliationCandidatesSeenTotal += candidateCount;
    this.chatReconciliationCandidatesUpdatedTotal += updatedCount;
    this.chatReconciliationCandidatesDeletedTotal += deletedCount;
    this.lastChatReconciliationRunAt = nowIso();
    this.lastChatReconciliationCandidateCount = candidateCount;
    this.lastChatReconciliationUpdatedCount = updatedCount;
    this.lastChatReconciliationDeletedCount = deletedCount;
    this.lastChatReconciliationMode = mode;
  }

  async getSnapshot(): Promise<ObservabilitySnapshot> {
    const [chatOutbox, pushOutbox] = await Promise.all([
      this.getChatOutboxGauge(),
      this.getPushOutboxGauge(),
    ]);

    return {
      service: 'urban-management-api',
      timestamp: nowIso(),
      counters: {
        httpRequestsTotal: this.httpRequestsTotal,
        httpResponses429Total: this.httpResponses429Total,
        httpResponses503Total: this.httpResponses503Total,
        httpResponsesByStatusCode: Object.fromEntries(
          Array.from(this.httpResponsesByStatusCode.entries()).map(
            ([statusCode, count]) => [String(statusCode), count],
          ),
        ),
        retentionCandidatesPurgedTotal: this.retentionCandidatesPurgedTotal,
        retentionCandidatesSeenTotal: this.retentionCandidatesSeenTotal,
        retentionRunsTotal: this.retentionRunsTotal,
        chatReconciliationCandidatesDeletedTotal:
          this.chatReconciliationCandidatesDeletedTotal,
        chatReconciliationCandidatesSeenTotal:
          this.chatReconciliationCandidatesSeenTotal,
        chatReconciliationCandidatesUpdatedTotal:
          this.chatReconciliationCandidatesUpdatedTotal,
        chatReconciliationRunsTotal: this.chatReconciliationRunsTotal,
        sessionRevocationsTotal: this.sessionRevocationsTotal,
        sessionRevocationsByReason: Object.fromEntries(
          Array.from(this.sessionRevocationsByReason.entries()),
        ),
      },
      timings: {
        httpAverageDurationMs:
          this.httpRequestsTotal > 0
            ? Number(
                (this.httpDurationTotalMs / this.httpRequestsTotal).toFixed(2),
              )
            : 0,
      },
      gauges: {
        chatOutbox,
        pushOutbox,
      },
      maintenance: {
        lastRetentionRunAt: this.lastRetentionRunAt,
        lastRetentionDeletedCount: this.lastRetentionDeletedCount,
        lastRetentionCandidateCount: this.lastRetentionCandidateCount,
        lastChatReconciliationRunAt: this.lastChatReconciliationRunAt,
        lastChatReconciliationCandidateCount:
          this.lastChatReconciliationCandidateCount,
        lastChatReconciliationUpdatedCount:
          this.lastChatReconciliationUpdatedCount,
        lastChatReconciliationDeletedCount:
          this.lastChatReconciliationDeletedCount,
        lastChatReconciliationMode: this.lastChatReconciliationMode,
      },
      circuitBreakers: [
        this.circuitBreakerService.getSnapshot('dynamodb'),
        this.circuitBreakerService.getSnapshot('s3'),
      ],
    };
  }

  async getPrometheusMetrics(): Promise<string> {
    const snapshot = await this.getSnapshot();
    const lines: string[] = [];

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_info`,
      'Static information about the API process.',
      'gauge',
    );
    this.appendMetricValue(lines, `${METRIC_PREFIX}_info`, 1, {
      service: snapshot.service,
    });

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_process_uptime_seconds`,
      'Node.js process uptime in seconds.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_process_uptime_seconds`,
      Number(process.uptime().toFixed(3)),
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_http_requests_total`,
      'Total HTTP requests handled by the API.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_http_requests_total`,
      snapshot.counters.httpRequestsTotal,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_http_responses_total`,
      'Total HTTP responses by status code.',
      'counter',
    );
    for (const [statusCode, count] of Object.entries(
      snapshot.counters.httpResponsesByStatusCode,
    ).sort(([left], [right]) => Number(left) - Number(right))) {
      this.appendMetricValue(
        lines,
        `${METRIC_PREFIX}_http_responses_total`,
        count,
        {
          status_code: statusCode,
        },
      );
    }

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_http_responses_429_total`,
      'Total HTTP 429 responses.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_http_responses_429_total`,
      snapshot.counters.httpResponses429Total,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_http_responses_503_total`,
      'Total HTTP 503 responses.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_http_responses_503_total`,
      snapshot.counters.httpResponses503Total,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_http_request_duration_average_milliseconds`,
      'Average HTTP request duration in milliseconds.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_http_request_duration_average_milliseconds`,
      snapshot.timings.httpAverageDurationMs,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_session_revocations_total`,
      'Total revoked sessions.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_session_revocations_total`,
      snapshot.counters.sessionRevocationsTotal,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_session_revocations_by_reason_total`,
      'Total revoked sessions grouped by reason.',
      'counter',
    );
    for (const [reason, count] of Object.entries(
      snapshot.counters.sessionRevocationsByReason,
    ).sort(([left], [right]) => left.localeCompare(right))) {
      this.appendMetricValue(
        lines,
        `${METRIC_PREFIX}_session_revocations_by_reason_total`,
        count,
        { reason },
      );
    }

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_retention_runs_total`,
      'Total retention maintenance runs.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_retention_runs_total`,
      snapshot.counters.retentionRunsTotal,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_retention_candidates_seen_total`,
      'Total retention candidates scanned.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_retention_candidates_seen_total`,
      snapshot.counters.retentionCandidatesSeenTotal,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_retention_candidates_purged_total`,
      'Total retention candidates deleted.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_retention_candidates_purged_total`,
      snapshot.counters.retentionCandidatesPurgedTotal,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_retention_last_run_timestamp_seconds`,
      'Unix timestamp of the most recent retention run.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_retention_last_run_timestamp_seconds`,
      this.toUnixSeconds(snapshot.maintenance.lastRetentionRunAt),
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_retention_last_candidate_count`,
      'Retention candidate count from the most recent run.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_retention_last_candidate_count`,
      snapshot.maintenance.lastRetentionCandidateCount ?? 0,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_retention_last_deleted_count`,
      'Retention deleted count from the most recent run.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_retention_last_deleted_count`,
      snapshot.maintenance.lastRetentionDeletedCount ?? 0,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_runs_total`,
      'Total chat reconciliation maintenance runs.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_runs_total`,
      snapshot.counters.chatReconciliationRunsTotal,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_candidates_seen_total`,
      'Total chat reconciliation candidates scanned.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_candidates_seen_total`,
      snapshot.counters.chatReconciliationCandidatesSeenTotal,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_candidates_updated_total`,
      'Total chat reconciliation candidates repaired with summary updates.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_candidates_updated_total`,
      snapshot.counters.chatReconciliationCandidatesUpdatedTotal,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_candidates_deleted_total`,
      'Total orphaned chat reconciliation summaries deleted.',
      'counter',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_candidates_deleted_total`,
      snapshot.counters.chatReconciliationCandidatesDeletedTotal,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_last_run_timestamp_seconds`,
      'Unix timestamp of the most recent chat reconciliation run.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_last_run_timestamp_seconds`,
      this.toUnixSeconds(snapshot.maintenance.lastChatReconciliationRunAt),
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_last_candidate_count`,
      'Chat reconciliation candidate count from the most recent run.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_last_candidate_count`,
      snapshot.maintenance.lastChatReconciliationCandidateCount ?? 0,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_last_updated_count`,
      'Chat reconciliation updated count from the most recent run.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_last_updated_count`,
      snapshot.maintenance.lastChatReconciliationUpdatedCount ?? 0,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_last_deleted_count`,
      'Chat reconciliation deleted count from the most recent run.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_last_deleted_count`,
      snapshot.maintenance.lastChatReconciliationDeletedCount ?? 0,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_reconciliation_mode`,
      'Current mode of the most recent chat reconciliation run (1 for active mode, 0 otherwise).',
      'gauge',
    );
    for (const mode of CHAT_RECONCILIATION_MODES) {
      this.appendMetricValue(
        lines,
        `${METRIC_PREFIX}_chat_reconciliation_mode`,
        snapshot.maintenance.lastChatReconciliationMode === mode ? 1 : 0,
        { mode },
      );
    }

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_outbox_pending_count`,
      'Pending chat outbox events.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_outbox_pending_count`,
      snapshot.gauges.chatOutbox.pendingCount,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_chat_outbox_oldest_age_seconds`,
      'Age in seconds of the oldest pending chat outbox event.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_chat_outbox_oldest_age_seconds`,
      Number((snapshot.gauges.chatOutbox.oldestAgeMs / 1000).toFixed(3)),
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_push_outbox_pending_count`,
      'Pending push outbox events.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_push_outbox_pending_count`,
      snapshot.gauges.pushOutbox.pendingCount,
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_push_outbox_oldest_age_seconds`,
      'Age in seconds of the oldest pending push outbox event.',
      'gauge',
    );
    this.appendMetricValue(
      lines,
      `${METRIC_PREFIX}_push_outbox_oldest_age_seconds`,
      Number((snapshot.gauges.pushOutbox.oldestAgeMs / 1000).toFixed(3)),
    );

    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_circuit_breaker_state`,
      'Current circuit breaker state (1 for the active state, 0 otherwise).',
      'gauge',
    );
    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_circuit_breaker_consecutive_failures`,
      'Current consecutive retryable failure count for each circuit breaker.',
      'gauge',
    );
    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_circuit_breaker_opened_timestamp_seconds`,
      'Unix timestamp when the circuit breaker last opened.',
      'gauge',
    );
    this.appendMetricHeader(
      lines,
      `${METRIC_PREFIX}_circuit_breaker_next_attempt_timestamp_seconds`,
      'Unix timestamp when the circuit breaker will next allow a trial request.',
      'gauge',
    );

    for (const breaker of snapshot.circuitBreakers) {
      for (const state of CIRCUIT_BREAKER_STATES) {
        this.appendMetricValue(
          lines,
          `${METRIC_PREFIX}_circuit_breaker_state`,
          breaker.state === state ? 1 : 0,
          {
            name: breaker.name,
            state,
          },
        );
      }

      this.appendMetricValue(
        lines,
        `${METRIC_PREFIX}_circuit_breaker_consecutive_failures`,
        breaker.consecutiveFailures,
        {
          name: breaker.name,
        },
      );
      this.appendMetricValue(
        lines,
        `${METRIC_PREFIX}_circuit_breaker_opened_timestamp_seconds`,
        this.toUnixSeconds(breaker.openedAt),
        {
          name: breaker.name,
        },
      );
      this.appendMetricValue(
        lines,
        `${METRIC_PREFIX}_circuit_breaker_next_attempt_timestamp_seconds`,
        this.toUnixSeconds(breaker.nextAttemptAt),
        {
          name: breaker.name,
        },
      );
    }

    return `${lines.join('\n')}\n`;
  }

  private extractUserId(request: Request): string | undefined {
    const user = request as Request & {
      user?: {
        id?: string;
      };
    };

    return user.user?.id;
  }

  private getNormalizedRoute(request: Request): string {
    const baseUrl = request.baseUrl ?? '';
    const path = request.path ?? '';
    const rawPath =
      `${baseUrl}${path}` ||
      ((request.originalUrl ?? request.url ?? '/').split('?')[0] ?? '/');

    return rawPath
      .replace(/\/01[0-9A-HJKMNP-TV-Z]{20,}(?=\/|$)/g, '/:id')
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  }

  private async getChatOutboxGauge(): Promise<OutboxGauge> {
    const shardCount = Math.max(this.config.chatOutboxShardCount, 1);
    const shardItems = await Promise.all(
      Array.from({ length: shardCount }, (_value, index) =>
        this.repository.queryByPk<StoredChatOutboxEvent>(
          this.config.dynamodbConversationsTableName,
          `OUTBOX#CHAT#${index}`,
          {
            beginsWith: 'EVENT#',
            scanForward: true,
          },
        ),
      ),
    );

    return this.buildOutboxGauge(
      shardItems
        .flat()
        .filter((item) => item.entityType === 'CHAT_OUTBOX_EVENT')
        .map((item) => item.createdAt),
    );
  }

  private async getPushOutboxGauge(): Promise<OutboxGauge> {
    const shardCount = Math.max(this.config.pushOutboxShardCount, 1);
    const shardItems = await Promise.all(
      Array.from({ length: shardCount }, (_value, index) =>
        this.repository.queryByPk<StoredPushOutboxEvent>(
          this.config.dynamodbUsersTableName,
          makePushOutboxPk(index),
          {
            beginsWith: 'EVENT#',
            scanForward: true,
          },
        ),
      ),
    );

    return this.buildOutboxGauge(
      shardItems
        .flat()
        .filter((item) => item.entityType === 'PUSH_OUTBOX_EVENT')
        .map((item) => item.createdAt),
    );
  }

  private buildOutboxGauge(createdAtValues: string[]): OutboxGauge {
    if (createdAtValues.length === 0) {
      return {
        pendingCount: 0,
        oldestAgeMs: 0,
      };
    }

    const oldestCreatedAt = createdAtValues.reduce((oldest, current) =>
      current < oldest ? current : oldest,
    );
    const oldestAgeMs = Math.max(Date.now() - Date.parse(oldestCreatedAt), 0);

    return {
      pendingCount: createdAtValues.length,
      oldestCreatedAt,
      oldestAgeMs,
    };
  }

  private appendMetricHeader(
    lines: string[],
    name: string,
    help: string,
    type: 'counter' | 'gauge',
  ): void {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
  }

  private appendMetricValue(
    lines: string[],
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const renderedValue = Number.isFinite(value) ? value : 0;
    const labelText = this.renderLabels(labels);
    lines.push(`${name}${labelText} ${renderedValue}`);
  }

  private renderLabels(labels: Record<string, string> | undefined): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    const rendered = Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}="${this.escapeLabelValue(value)}"`)
      .join(',');

    return `{${rendered}}`;
  }

  private escapeLabelValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"');
  }

  private toUnixSeconds(value: string | undefined): number {
    if (!value) {
      return 0;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? Number((timestamp / 1000).toFixed(3))
      : 0;
  }
}
