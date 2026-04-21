import { ChatPresenceService } from './chat-presence.service';

describe('ChatPresenceService', () => {
  const config = {
    chatPresenceTtlSeconds: 90,
    chatPresenceHeartbeatSeconds: 30,
    chatPresenceLastSeenTtlSeconds: 30 * 24 * 60 * 60,
    redisKeyPrefix: 'urban',
  };
  const realtimeRedisService = {
    enabled: false,
    getClient: jest.fn(),
  };

  let service: ChatPresenceService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
    service = new ChatPresenceService(
      config as never,
      realtimeRedisService as never,
    );
  });

  afterEach(() => {
    service.onApplicationShutdown();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('treats recent authenticated activity as active even without sockets', async () => {
    await service.recordHttpActivity('user-1');

    await expect(service.getPresence('user-1')).resolves.toEqual(
      expect.objectContaining({
        userId: 'user-1',
        isActive: true,
        activeSocketCount: 0,
        lastSeenAt: undefined,
      }),
    );

    jest.setSystemTime(new Date('2026-04-15T10:01:31.000Z'));

    await expect(service.getPresence('user-1')).resolves.toEqual(
      expect.objectContaining({
        userId: 'user-1',
        isActive: false,
        activeSocketCount: 0,
        lastSeenAt: '2026-04-15T10:00:00.000Z',
      }),
    );
  });

  it('clears recent activity when the last socket disconnects cleanly', async () => {
    await service.attachSocket('user-1', 'socket-1');

    jest.setSystemTime(new Date('2026-04-15T10:00:10.000Z'));

    await expect(service.detachSocket('user-1', 'socket-1')).resolves.toEqual(
      expect.objectContaining({
        userId: 'user-1',
        isActive: false,
        activeSocketCount: 0,
        lastSeenAt: '2026-04-15T10:00:10.000Z',
      }),
    );

    await expect(service.getPresence('user-1')).resolves.toEqual(
      expect.objectContaining({
        userId: 'user-1',
        isActive: false,
        activeSocketCount: 0,
        lastSeenAt: '2026-04-15T10:00:10.000Z',
      }),
    );
  });
});
