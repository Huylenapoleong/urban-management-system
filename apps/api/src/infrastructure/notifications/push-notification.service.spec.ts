import type { StoredPushDevice } from '../../common/storage-records';
import { PushNotificationService } from './push-notification.service';

describe('PushNotificationService', () => {
  const repository = {
    delete: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    queryByPk: jest.fn(),
    scanAll: jest.fn(),
  };
  const chatPresenceService = {
    getPresence: jest.fn(),
  };
  const config = {
    dynamodbUsersTableName: 'Users',
    dynamodbConversationsTableName: 'Conversations',
    pushOutboxBatchSize: 10,
    pushOutboxPollIntervalMs: 1000,
    pushOutboxShardCount: 2,
    pushProvider: 'disabled',
    pushSkipActiveUsers: true,
  };

  let service: PushNotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PushNotificationService(
      repository as never,
      chatPresenceService as never,
      config as never,
    );
    repository.get.mockResolvedValue(undefined);
    repository.put.mockResolvedValue(undefined);
    repository.delete.mockResolvedValue(undefined);
    repository.scanAll.mockResolvedValue([]);
  });

  it('removes conflicting registrations that reuse the same push token', async () => {
    const conflictingDevice: StoredPushDevice = {
      PK: 'USER#user-2',
      SK: 'PUSH_DEVICE#device-old',
      entityType: 'USER_PUSH_DEVICE',
      userId: 'user-2',
      deviceId: 'device-old',
      provider: 'WEB',
      platform: 'chrome',
      appVariant: 'admin-web',
      pushToken: 'shared-token',
      disabledAt: null,
      lastSeenAt: '2026-03-20T00:00:00.000Z',
      createdAt: '2026-03-20T00:00:00.000Z',
      updatedAt: '2026-03-20T00:00:00.000Z',
    };

    repository.scanAll.mockResolvedValue([conflictingDevice]);

    await service.registerDevice('user-1', {
      deviceId: 'device-new',
      provider: 'WEB',
      platform: 'chrome',
      pushToken: 'shared-token',
      appVariant: 'admin-web',
    });

    expect(repository.delete).toHaveBeenCalledWith(
      'Users',
      conflictingDevice.PK,
      conflictingDevice.SK,
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        userId: 'user-1',
        deviceId: 'device-new',
        pushToken: 'shared-token',
      }),
    );
  });
});
