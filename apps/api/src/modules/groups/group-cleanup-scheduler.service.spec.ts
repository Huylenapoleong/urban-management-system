import { GroupCleanupSchedulerService } from './group-cleanup-scheduler.service';

describe('GroupCleanupSchedulerService', () => {
  const groupCleanupService = {
    runPendingCleanupCycle: jest.fn(),
  };
  const realtimeRedisService = {
    enabled: false,
    connected: false,
    getClient: jest.fn(),
  };
  const config = {
    redisKeyPrefix: 'urban',
    groupDeleteCleanupEnabled: true,
    groupDeleteCleanupIntervalMs: 60_000,
    groupDeleteCleanupLockTtlMs: 30_000,
  };

  let service: GroupCleanupSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    realtimeRedisService.enabled = false;
    realtimeRedisService.connected = false;
    groupCleanupService.runPendingCleanupCycle.mockResolvedValue({
      processedCount: 2,
      remainingCount: 1,
    });
    service = new GroupCleanupSchedulerService(
      groupCleanupService as never,
      realtimeRedisService as never,
      config as never,
    );
  });

  it('runs cleanup when Redis is disabled', async () => {
    await service.runCleanupCycle();

    expect(groupCleanupService.runPendingCleanupCycle).toHaveBeenCalledTimes(1);
  });

  it('skips when Redis lock is not acquired', async () => {
    realtimeRedisService.enabled = true;
    realtimeRedisService.connected = true;
    realtimeRedisService.getClient.mockReturnValue({
      set: jest.fn().mockResolvedValue(null),
    });

    await service.runCleanupCycle();

    expect(groupCleanupService.runPendingCleanupCycle).not.toHaveBeenCalled();
  });
});
