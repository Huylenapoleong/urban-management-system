import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  const repository = {
    queryByPk: jest.fn(),
  };
  const circuitBreakerService = {
    getSnapshot: jest.fn(),
  };
  const config = {
    chatOutboxShardCount: 2,
    pushOutboxShardCount: 2,
    dynamodbConversationsTableName: 'Conversations',
    dynamodbUsersTableName: 'Users',
  };

  let service: ObservabilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ObservabilityService(
      repository as never,
      circuitBreakerService as never,
      config as never,
    );
    circuitBreakerService.getSnapshot.mockImplementation((name: string) => ({
      name,
      state: 'closed',
      consecutiveFailures: 0,
    }));
  });

  it('tracks 429 and 503 responses plus session, retention, and reconciliation metrics', async () => {
    repository.queryByPk.mockResolvedValue([]);

    service.recordHttpRequest({
      durationMs: 32.5,
      method: 'GET',
      request: buildRequest('/api/reports') as never,
      requestId: 'req-1',
      statusCode: 429,
    });
    service.recordHttpRequest({
      durationMs: 12.25,
      method: 'POST',
      request: buildRequest('/api/auth/refresh') as never,
      requestId: 'req-2',
      statusCode: 503,
    });
    service.recordSessionRevocations('logout_all', 2);
    service.recordRetentionRun(5, 4);
    service.recordChatReconciliationRun(6, 3, 1, 'repair');

    const snapshot = await service.getSnapshot();

    expect(snapshot.counters.httpRequestsTotal).toBe(2);
    expect(snapshot.counters.httpResponses429Total).toBe(1);
    expect(snapshot.counters.httpResponses503Total).toBe(1);
    expect(snapshot.counters.httpResponsesByStatusCode).toEqual({
      '429': 1,
      '503': 1,
    });
    expect(snapshot.counters.sessionRevocationsTotal).toBe(2);
    expect(snapshot.counters.sessionRevocationsByReason).toEqual({
      logout_all: 2,
    });
    expect(snapshot.counters.retentionRunsTotal).toBe(1);
    expect(snapshot.counters.retentionCandidatesSeenTotal).toBe(5);
    expect(snapshot.counters.retentionCandidatesPurgedTotal).toBe(4);
    expect(snapshot.counters.chatReconciliationRunsTotal).toBe(1);
    expect(snapshot.counters.chatReconciliationCandidatesSeenTotal).toBe(6);
    expect(snapshot.counters.chatReconciliationCandidatesUpdatedTotal).toBe(3);
    expect(snapshot.counters.chatReconciliationCandidatesDeletedTotal).toBe(1);
    expect(snapshot.timings.httpAverageDurationMs).toBe(22.38);
    expect(snapshot.gauges.chatOutbox.pendingCount).toBe(0);
    expect(snapshot.gauges.pushOutbox.pendingCount).toBe(0);
    expect(snapshot.maintenance).toEqual(
      expect.objectContaining({
        lastRetentionCandidateCount: 5,
        lastRetentionDeletedCount: 4,
        lastRetentionRunAt: expect.any(String),
        lastChatReconciliationCandidateCount: 6,
        lastChatReconciliationUpdatedCount: 3,
        lastChatReconciliationDeletedCount: 1,
        lastChatReconciliationMode: 'repair',
        lastChatReconciliationRunAt: expect.any(String),
      }),
    );
  });

  it('calculates outbox backlog across shards', async () => {
    repository.queryByPk
      .mockResolvedValueOnce([
        {
          entityType: 'CHAT_OUTBOX_EVENT',
          createdAt: '2026-03-18T09:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          entityType: 'PUSH_OUTBOX_EVENT',
          createdAt: '2026-03-18T09:05:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          entityType: 'PUSH_OUTBOX_EVENT',
          createdAt: '2026-03-18T09:10:00.000Z',
        },
      ]);

    const snapshot = await service.getSnapshot();

    expect(snapshot.gauges.chatOutbox.pendingCount).toBe(1);
    expect(snapshot.gauges.chatOutbox.oldestCreatedAt).toBe(
      '2026-03-18T09:00:00.000Z',
    );
    expect(snapshot.gauges.pushOutbox.pendingCount).toBe(2);
    expect(snapshot.gauges.pushOutbox.oldestCreatedAt).toBe(
      '2026-03-18T09:05:00.000Z',
    );
    expect(circuitBreakerService.getSnapshot).toHaveBeenNthCalledWith(
      1,
      'dynamodb',
    );
    expect(circuitBreakerService.getSnapshot).toHaveBeenNthCalledWith(2, 's3');
  });

  it('renders Prometheus exposition text for scraping', async () => {
    repository.queryByPk.mockResolvedValue([]);

    service.recordHttpRequest({
      durationMs: 9,
      method: 'GET',
      request: buildRequest('/api/health/live') as never,
      requestId: 'req-prom-1',
      statusCode: 429,
    });
    service.recordSessionRevocations('logout', 1);
    service.recordRetentionRun(3, 2);
    service.recordChatReconciliationRun(4, 2, 1, 'preview');

    const metrics = await service.getPrometheusMetrics();

    expect(metrics).toContain(
      '# HELP urban_api_http_requests_total Total HTTP requests handled by the API.',
    );
    expect(metrics).toContain('urban_api_http_requests_total 1');
    expect(metrics).toContain(
      'urban_api_http_responses_total{status_code="429"} 1',
    );
    expect(metrics).toContain(
      'urban_api_session_revocations_by_reason_total{reason="logout"} 1',
    );
    expect(metrics).toContain('urban_api_retention_runs_total 1');
    expect(metrics).toContain('urban_api_chat_reconciliation_runs_total 1');
    expect(metrics).toContain(
      'urban_api_chat_reconciliation_mode{mode="preview"} 1',
    );
    expect(metrics).toContain(
      'urban_api_circuit_breaker_state{name="dynamodb",state="closed"} 1',
    );
    expect(metrics.endsWith('\n')).toBe(true);
  });
});

function buildRequest(originalUrl: string) {
  return {
    baseUrl: '/api',
    originalUrl,
    path: originalUrl.replace('/api', ''),
    url: originalUrl,
  };
}
