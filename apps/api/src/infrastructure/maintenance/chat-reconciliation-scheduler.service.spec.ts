import { ChatReconciliationSchedulerService } from './chat-reconciliation-scheduler.service';

describe('ChatReconciliationSchedulerService', () => {
  const chatReconciliationService = {
    previewSystem: jest.fn(),
    repairSystem: jest.fn(),
  };
  const realtimeRedisService = {
    enabled: false,
    connected: false,
    getClient: jest.fn(),
  };
  const observabilityService = {
    recordChatReconciliationRun: jest.fn(),
  };
  const config = {
    redisKeyPrefix: 'urban',
    chatReconciliationMaintenanceEnabled: true,
    chatReconciliationMaintenanceIntervalMs: 60_000,
    chatReconciliationMaintenanceLockTtlMs: 30_000,
    chatReconciliationMaintenanceMode: 'preview',
  };

  let service: ChatReconciliationSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    realtimeRedisService.enabled = false;
    realtimeRedisService.connected = false;
    config.chatReconciliationMaintenanceMode = 'preview';
    chatReconciliationService.previewSystem.mockResolvedValue({
      buckets: [],
      generatedAt: '2026-03-18T16:00:00.000Z',
      issues: [],
      totalCandidates: 4,
    });
    chatReconciliationService.repairSystem.mockResolvedValue({
      buckets: [],
      generatedAt: '2026-03-18T16:00:00.000Z',
      issues: [],
      repairedAt: '2026-03-18T16:00:02.000Z',
      totalCandidates: 4,
      totalDeleted: 1,
      totalUpdated: 3,
    });
    service = new ChatReconciliationSchedulerService(
      chatReconciliationService as never,
      realtimeRedisService as never,
      observabilityService as never,
      config as never,
    );
  });

  it('runs preview mode and records reconciliation metrics when Redis is disabled', async () => {
    await service.runMaintenanceCycle();

    expect(chatReconciliationService.previewSystem).toHaveBeenCalledTimes(1);
    expect(chatReconciliationService.repairSystem).not.toHaveBeenCalled();
    expect(
      observabilityService.recordChatReconciliationRun,
    ).toHaveBeenCalledWith(4, 0, 0, 'preview');
  });

  it('runs repair mode and records update/delete counts', async () => {
    config.chatReconciliationMaintenanceMode = 'repair';

    await service.runMaintenanceCycle();

    expect(chatReconciliationService.previewSystem).not.toHaveBeenCalled();
    expect(chatReconciliationService.repairSystem).toHaveBeenCalledTimes(1);
    expect(
      observabilityService.recordChatReconciliationRun,
    ).toHaveBeenCalledWith(4, 3, 1, 'repair');
  });

  it('skips when Redis lock is not acquired', async () => {
    realtimeRedisService.enabled = true;
    realtimeRedisService.connected = true;
    realtimeRedisService.getClient.mockReturnValue({
      set: jest.fn().mockResolvedValue(null),
    });

    await service.runMaintenanceCycle();

    expect(chatReconciliationService.previewSystem).not.toHaveBeenCalled();
    expect(chatReconciliationService.repairSystem).not.toHaveBeenCalled();
    expect(
      observabilityService.recordChatReconciliationRun,
    ).not.toHaveBeenCalled();
  });
});
