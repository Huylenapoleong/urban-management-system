import { ConflictException } from '@nestjs/common';
import type { AppConfigService } from '../../infrastructure/config/app-config.service';
import { ChatCallSessionService } from './chat-call-session.service';
import type { ResolvedConversationAccess } from './conversations.service';

describe('ChatCallSessionService', () => {
  const realtimeRedisService = {
    enabled: false,
    getClient: jest.fn(),
  };
  const config = {
    chatCallActiveTtlSeconds: 4 * 60 * 60,
    chatCallInviteTtlSeconds: 90,
    redisKeyPrefix: 'urban',
  } as Pick<
    AppConfigService,
    'chatCallActiveTtlSeconds' | 'chatCallInviteTtlSeconds' | 'redisKeyPrefix'
  > as AppConfigService;

  const dmAccess: ResolvedConversationAccess = {
    conversationId: 'dm:user-2',
    conversationKey: 'DM#user-1#user-2',
    isGroup: false,
    participants: ['user-1', 'user-2'],
  };
  const groupAccess: ResolvedConversationAccess = {
    conversationId: 'group:group-1',
    conversationKey: 'GRP#group-1',
    isGroup: true,
    participants: ['user-1', 'user-2', 'user-3'],
  };

  let service: ChatCallSessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChatCallSessionService(config, realtimeRedisService as never);
  });

  it('deduplicates a repeated call-init from the same caller', async () => {
    const firstAttempt = await service.initiateCall(dmAccess, 'user-1', true);
    const secondAttempt = await service.initiateCall(dmAccess, 'user-1', true);

    expect(firstAttempt.shouldEmit).toBe(true);
    expect(secondAttempt.shouldEmit).toBe(false);
  });

  it('blocks a second caller from starting a concurrent DM call', async () => {
    await service.initiateCall(dmAccess, 'user-1', true);

    await expect(
      service.initiateCall(dmAccess, 'user-2', false),
    ).rejects.toThrow(ConflictException);
  });

  it('requires a call to be accepted before WebRTC signaling can proceed', async () => {
    await service.initiateCall(dmAccess, 'user-1', true);

    await expect(
      service.touchSignalingSession(dmAccess, 'user-1'),
    ).rejects.toThrow('The call has not been accepted yet.');

    const accepted = await service.acceptCall(dmAccess, 'user-2');

    expect(accepted.shouldEmit).toBe(true);
    expect(accepted.session?.acceptedAt).toEqual(expect.any(String));
    await expect(
      service.touchSignalingSession(dmAccess, 'user-1'),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('preserves the original acceptedAt when additional group participants join later', async () => {
    await service.initiateCall(groupAccess, 'user-1', true);

    const firstAccept = await service.acceptCall(groupAccess, 'user-2');
    const secondAccept = await service.acceptCall(groupAccess, 'user-3');

    expect(firstAccept.session?.acceptedAt).toEqual(expect.any(String));
    expect(secondAccept.session?.acceptedAt).toBe(
      firstAccept.session?.acceptedAt,
    );
  });

  it('treats duplicate direct call-end as idempotent once the session is gone', async () => {
    await service.initiateCall(dmAccess, 'user-1', false);
    await service.acceptCall(dmAccess, 'user-2');

    const firstEnd = await service.endCall(dmAccess, 'user-1');
    const secondEnd = await service.endCall(dmAccess, 'user-1');

    expect(firstEnd.shouldEmit).toBe(true);
    expect(secondEnd.shouldEmit).toBe(false);
  });

  it('keeps a group call active when one accepted participant leaves', async () => {
    await service.initiateCall(groupAccess, 'user-1', true);
    await service.acceptCall(groupAccess, 'user-2');
    await service.acceptCall(groupAccess, 'user-3');

    const endResult = await service.endCall(groupAccess, 'user-2');

    expect(endResult.shouldEmit).toBe(true);
    await expect(
      service.touchSignalingSession(groupAccess, 'user-1'),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    await expect(
      service.touchSignalingSession(groupAccess, 'user-3'),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    await expect(
      service.touchSignalingSession(groupAccess, 'user-2'),
    ).rejects.toThrow(
      'Only accepted participants can exchange media for this call.',
    );
  });
});
