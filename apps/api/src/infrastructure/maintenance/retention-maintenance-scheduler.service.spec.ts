import { RetentionMaintenanceSchedulerService } from './retention-maintenance-scheduler.service';

describe('RetentionMaintenanceSchedulerService', () => {
  const retentionMaintenanceService = {
    purgeSystem: jest.fn(),
  };
  const realtimeRedisService = {
    enabled: false,
    connected: false,
    getClient: jest.fn(),
  };
  const observabilityService = {
    recordRetentionRun: jest.fn(),
  };
  const config = {
    redisKeyPrefix: 'urban',
    retentionMaintenanceEnabled: true,
    retentionMaintenanceIntervalMs: 60_000,
    retentionMaintenanceLockTtlMs: 30_000,
  };

  let service: RetentionMaintenanceSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    realtimeRedisService.enabled = false;
    realtimeRedisService.connected = false;
    retentionMaintenanceService.purgeSystem.mockResolvedValue({
      buckets: [],
      generatedAt: '2026-03-18T15:00:00.000Z',
      purgedAt: '2026-03-18T15:00:01.000Z',
      totalCandidates: 3,
      totalDeleted: 2,
    });
    service = new RetentionMaintenanceSchedulerService(
      retentionMaintenanceService as never,
      realtimeRedisService as never,
      observabilityService as never,
      config as never,
    );
  });

  it('runs maintenance and records retention metrics when Redis is disabled', async () => {
    await service.runMaintenanceCycle();

    expect(retentionMaintenanceService.purgeSystem).toHaveBeenCalledTimes(1);
    expect(observabilityService.recordRetentionRun).toHaveBeenCalledWith(3, 2);
  });

  it('skips when Redis lock is not acquired', async () => {
    realtimeRedisService.enabled = true;
    realtimeRedisService.connected = true;
    realtimeRedisService.getClient.mockReturnValue({
      set: jest.fn().mockResolvedValue(null),
    });

    await service.runMaintenanceCycle();

    expect(retentionMaintenanceService.purgeSystem).not.toHaveBeenCalled();
    expect(observabilityService.recordRetentionRun).not.toHaveBeenCalled();
  });
});
