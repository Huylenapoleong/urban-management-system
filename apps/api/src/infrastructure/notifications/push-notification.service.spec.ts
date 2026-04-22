import type {
  StoredPushDevice,
  StoredPushOutboxEvent,
} from '../../common/storage-records';
import {
  makePushTokenLookupPk,
  makePushTokenLookupSk,
} from '@urban/shared-utils';
import { PushNotificationService } from './push-notification.service';

describe('PushNotificationService', () => {
  const repository = {
    delete: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    queryByPk: jest.fn(),
    scanAll: jest.fn(),
    transactWrite: jest.fn(),
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
    pushWebhookUrl: undefined as string | undefined,
    pushWebhookTimeoutMs: 5000,
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
    repository.transactWrite.mockResolvedValue(undefined);
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

    repository.get.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      PK: makePushTokenLookupPk('shared-token'),
      SK: makePushTokenLookupSk(),
      entityType: 'USER_PUSH_TOKEN_LOOKUP',
      userId: conflictingDevice.userId,
      deviceId: conflictingDevice.deviceId,
      createdAt: conflictingDevice.createdAt,
      updatedAt: conflictingDevice.updatedAt,
    });

    await service.registerDevice('user-1', {
      deviceId: 'device-new',
      provider: 'WEB',
      platform: 'chrome',
      pushToken: 'shared-token',
      appVariant: 'admin-web',
    });

    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'put',
          tableName: 'Users',
          item: expect.objectContaining({
            userId: 'user-1',
            deviceId: 'device-new',
            pushToken: 'shared-token',
          }),
        }),
        expect.objectContaining({
          kind: 'delete',
          tableName: 'Users',
          key: {
            PK: conflictingDevice.PK,
            SK: conflictingDevice.SK,
          },
        }),
      ]),
    );
  });

  it('looks up mute state through the latest summary prefix instead of scanning the whole inbox', async () => {
    repository.queryByPk.mockResolvedValue([
      {
        PK: 'USER#user-1',
        SK: 'CONV#DM#user-1#user-2#LAST#2026-04-22T08:00:00.000Z',
        entityType: 'CONVERSATION',
        conversationId: 'DM#user-1#user-2',
        mutedUntil: '9999-12-31T23:59:59.999Z',
        deletedAt: null,
      },
    ]);

    const presenceHarness = service as unknown as {
      isConversationMuted(
        userId: string,
        conversationId: string,
      ): Promise<boolean>;
    };

    await expect(
      presenceHarness.isConversationMuted('user-1', 'DM#user-1#user-2'),
    ).resolves.toBe(true);

    expect(repository.queryByPk).toHaveBeenCalledWith(
      'Conversations',
      'USER#user-1',
      expect.objectContaining({
        beginsWith: 'CONV#DM#user-1#user-2#LAST#',
        limit: 1,
        scanForward: false,
      }),
    );
  });

  it('passes an abort signal when dispatching push webhooks', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    config.pushProvider = 'webhook';
    config.pushWebhookUrl = 'https://push.test/webhook';
    service = new PushNotificationService(
      repository as never,
      chatPresenceService as never,
      config as never,
    );

    try {
      const dispatchHarness = service as unknown as {
        dispatchToDevice(
          userId: string,
          device: StoredPushDevice,
          event: StoredPushOutboxEvent,
        ): Promise<void>;
      };

      await dispatchHarness.dispatchToDevice(
        'user-1',
        {
          PK: 'USER#user-1',
          SK: 'PUSH_DEVICE#device-1',
          entityType: 'USER_PUSH_DEVICE',
          userId: 'user-1',
          deviceId: 'device-1',
          provider: 'WEB',
          platform: 'chrome',
          appVariant: 'web',
          pushToken: 'push-token-123456',
          disabledAt: null,
          lastSeenAt: '2026-04-22T08:00:00.000Z',
          createdAt: '2026-04-22T08:00:00.000Z',
          updatedAt: '2026-04-22T08:00:00.000Z',
        },
        {
          PK: 'PUSH_OUTBOX#0',
          SK: 'EVENT#2026-04-22T08:00:00.000Z#evt-1',
          entityType: 'PUSH_OUTBOX_EVENT',
          eventId: 'evt-1',
          eventName: 'chat.message.created',
          actorUserId: 'user-2',
          recipientUserIds: ['user-1'],
          title: 'Hello',
          body: 'World',
          createdAt: '2026-04-22T08:00:00.000Z',
          skipIfActive: true,
        },
      );
    } finally {
      global.fetch = originalFetch;
      config.pushProvider = 'disabled';
      config.pushWebhookUrl = undefined;
    }

    expect(fetchMock).toHaveBeenCalledWith(
      'https://push.test/webhook',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
