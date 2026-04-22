import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@urban/shared-types';
import { ConversationsGateway } from './conversations.gateway';

type GatewayClient = Parameters<ConversationsGateway['deleteConversation']>[0];

describe('ConversationsGateway', () => {
  const chatSocketAuthService = {
    authenticate: jest.fn(),
  };
  const chatRealtimeService = {
    attachUserSocket: jest.fn(),
    bindServer: jest.fn(),
    emitToConversation: jest.fn(),
    emitToUser: jest.fn(),
    emitToUsers: jest.fn(),
    joinConversation: jest.fn(),
  };
  const chatPresenceService = {
    attachSocket: jest.fn(),
    detachSocket: jest.fn(),
    getPresence: jest.fn(),
    listPresence: jest.fn(),
  };
  const chatCallSessionService = {
    acceptCall: jest.fn(),
    endCall: jest.fn(),
    getDirectSessionAccess: jest.fn(),
    initiateCall: jest.fn(),
    rejectCall: jest.fn(),
    touchSignalingSession: jest.fn(),
  };
  const observabilityService = {
    recordRealtimeAck: jest.fn(),
  };
  const conversationsService = {
    deleteConversation: jest.fn(),
    resolveConversationAccess: jest.fn(),
    sendMessage: jest.fn(),
  };

  const actor: AuthenticatedUser = {
    id: 'user-1',
    email: 'citizen@example.com',
    fullName: 'Citizen One',
    role: 'CITIZEN',
    locationCode: 'VN-79-760-26734',
    status: 'ACTIVE',
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  };

  let gateway: ConversationsGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new ConversationsGateway(
      chatSocketAuthService as never,
      chatRealtimeService as never,
      chatPresenceService as never,
      conversationsService as never,
      chatCallSessionService as never,
      observabilityService as never,
    );
  });

  it('returns a success ack when deleting a conversation over socket', async () => {
    const { client, disconnect } = createSocketClient();
    const removedAt = '2026-03-18T15:30:00.000Z';

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {} as never,
    });
    conversationsService.deleteConversation.mockResolvedValue({
      conversationId: 'group:group-1',
      removedAt,
    });

    const result = await gateway.deleteConversation(client, {
      conversationId: 'group:group-1',
    });

    expect(result).toEqual({
      success: true,
      data: {
        conversationId: 'group:group-1',
        removedAt,
      },
    });
    expect(chatSocketAuthService.authenticate).toHaveBeenCalledWith(client);
    expect(conversationsService.deleteConversation).toHaveBeenCalledWith(
      actor,
      'group:group-1',
    );
    expect(observabilityService.recordRealtimeAck).toHaveBeenCalledWith(
      'conversation.delete',
      expect.any(Number),
      'success',
    );
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('reuses the cached socket auth context for hot-path events after connection', async () => {
    const { client, disconnect } = createSocketClient();
    const removedAt = '2026-03-18T15:30:00.000Z';

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    });
    conversationsService.deleteConversation.mockResolvedValue({
      conversationId: 'group:group-1',
      removedAt,
    });

    await gateway.handleConnection(client);
    const result = await gateway.deleteConversation(client, {
      conversationId: 'group:group-1',
    });

    expect(result).toEqual({
      success: true,
      data: {
        conversationId: 'group:group-1',
        removedAt,
      },
    });
    expect(chatSocketAuthService.authenticate).toHaveBeenCalledTimes(1);
    expect(chatRealtimeService.attachUserSocket).toHaveBeenCalledWith(
      client,
      actor.id,
      'session-1',
    );
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('revalidates stale cached socket auth context before handling an event', async () => {
    const { client, disconnect } = createSocketClient();
    const baseNow = Date.now();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {
        exp: Math.floor(baseNow / 1000) + 300,
      },
    });
    conversationsService.deleteConversation.mockResolvedValue({
      conversationId: 'group:group-1',
      removedAt: '2026-03-18T15:30:00.000Z',
    });

    await gateway.handleConnection(client);
    client.data.authenticatedAtMs = baseNow - 31_000;

    await gateway.deleteConversation(client, {
      conversationId: 'group:group-1',
    });

    expect(chatSocketAuthService.authenticate).toHaveBeenCalledTimes(2);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('returns a normalized error ack when deleteConversation fails', async () => {
    const { client, disconnect } = createSocketClient();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {} as never,
    });
    conversationsService.deleteConversation.mockRejectedValue(
      new BadRequestException('Conversation not found.'),
    );

    const result = await gateway.deleteConversation(client, {
      conversationId: 'group:missing-group',
    });

    expect(result).toEqual({
      success: false,
      error: {
        code: 'CHAT_CONVERSATION_DELETE_FAILED',
        message: 'Conversation not found.',
        statusCode: 400,
      },
    });
    expect(observabilityService.recordRealtimeAck).toHaveBeenCalledWith(
      'conversation.delete',
      expect.any(Number),
      'failed',
    );
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('returns a forbidden ack when a non-member tries to join a group conversation', async () => {
    const { client, disconnect } = createSocketClient();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {} as never,
    });
    conversationsService.resolveConversationAccess.mockRejectedValue(
      new ForbiddenException(
        'Only active members can access this group conversation.',
      ),
    );

    const result = await gateway.joinConversation(client, {
      conversationId: 'group:group-1',
    });

    expect(result).toEqual({
      success: false,
      error: {
        code: 'CHAT_CONVERSATION_JOIN_FAILED',
        message: 'Only active members can access this group conversation.',
        statusCode: 403,
      },
    });
    expect(chatRealtimeService.joinConversation).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('routes DM call-init signals directly to the target user room', async () => {
    const { client, disconnect } = createSocketClient();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    });
    conversationsService.resolveConversationAccess.mockResolvedValue({
      conversationId: 'dm:user-2',
      conversationKey: 'DM#user-1#user-2',
      participants: ['user-1', 'user-2'],
      isGroup: false,
    });
    chatCallSessionService.initiateCall.mockResolvedValue({
      shouldEmit: true,
    });

    const result = await gateway.handleCallInit(client, {
      conversationId: 'dm:user-2',
      isVideo: true,
    });

    expect(result).toEqual({
      success: true,
      data: { success: true },
    });
    expect(chatRealtimeService.emitToUsers).toHaveBeenCalledWith(
      ['user-2'],
      'call.init',
      {
        conversationId: 'dm:user-2',
        callerId: actor.id,
        callerName: actor.fullName,
        isVideo: true,
      },
    );
    expect(observabilityService.recordRealtimeAck).toHaveBeenCalledWith(
      'call.init',
      expect.any(Number),
      'success',
    );
    expect(chatRealtimeService.emitToConversation).not.toHaveBeenCalled();
    expect(conversationsService.sendMessage).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('deduplicates repeated call-init from the same caller without re-emitting the signal', async () => {
    const { client } = createSocketClient();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    });
    conversationsService.resolveConversationAccess.mockResolvedValue({
      conversationId: 'dm:user-2',
      conversationKey: 'DM#user-1#user-2',
      participants: ['user-1', 'user-2'],
      isGroup: false,
    });
    chatCallSessionService.initiateCall.mockResolvedValue({
      shouldEmit: false,
    });

    const result = await gateway.handleCallInit(client, {
      conversationId: 'dm:user-2',
      isVideo: true,
    });

    expect(result).toEqual({
      success: true,
      data: { success: true },
    });
    expect(chatRealtimeService.emitToUsers).not.toHaveBeenCalled();
  });

  it('keeps group call signals on the conversation room', async () => {
    const { client, disconnect } = createSocketClient();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    });
    conversationsService.resolveConversationAccess.mockResolvedValue({
      conversationId: 'group:group-1',
      conversationKey: 'GRP#group-1',
      participants: ['user-1', 'user-2', 'user-3'],
      isGroup: true,
    });
    chatCallSessionService.acceptCall.mockResolvedValue({
      shouldEmit: true,
    });

    const result = await gateway.handleCallAccept(client, {
      conversationId: 'group:group-1',
    });

    expect(result).toEqual({
      success: true,
      data: { success: true },
    });
    expect(chatRealtimeService.emitToConversation).toHaveBeenCalledWith(
      'GRP#group-1',
      'call.accept',
      {
        conversationId: 'group:group-1',
        calleeId: actor.id,
      },
      client.id,
    );
    expect(chatRealtimeService.emitToUsers).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('returns a failed ack when call-accept arrives without an active session', async () => {
    const { client } = createSocketClient();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    });
    conversationsService.resolveConversationAccess.mockResolvedValue({
      conversationId: 'dm:user-2',
      conversationKey: 'DM#user-1#user-2',
      participants: ['user-1', 'user-2'],
      isGroup: false,
    });
    chatCallSessionService.acceptCall.mockRejectedValue(
      new ConflictException('There is no active call for this conversation.'),
    );

    const result = await gateway.handleCallAccept(client, {
      conversationId: 'dm:user-2',
    });

    expect(result).toEqual({
      success: false,
      error: {
        code: 'CHAT_CALL_ACCEPT_FAILED',
        message: 'There is no active call for this conversation.',
        statusCode: 409,
      },
    });
    expect(chatRealtimeService.emitToUsers).not.toHaveBeenCalled();
  });

  it('returns success for call-end even when persisting the system message fails', async () => {
    const { client, disconnect } = createSocketClient();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    });
    conversationsService.resolveConversationAccess.mockResolvedValue({
      conversationId: 'dm:user-2',
      conversationKey: 'DM#user-1#user-2',
      participants: ['user-1', 'user-2'],
      isGroup: false,
    });
    chatCallSessionService.endCall.mockResolvedValue({
      shouldEmit: true,
    });
    conversationsService.sendMessage.mockRejectedValueOnce(
      new Error('Outbox unavailable.'),
    );

    const result = await gateway.handleCallEnd(client, {
      conversationId: 'dm:user-2',
    });

    expect(result).toEqual({
      success: true,
      data: { success: true },
    });
    expect(chatRealtimeService.emitToUsers).toHaveBeenCalledWith(
      ['user-2'],
      'call.end',
      {
        conversationId: 'dm:user-2',
        userId: actor.id,
        endedByUserId: actor.id,
      },
    );
    expect(conversationsService.sendMessage).toHaveBeenCalledWith(
      actor,
      'DM#user-1#user-2',
      expect.objectContaining({
        type: 'SYSTEM',
        content: 'Call ended.',
      }),
    );
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('skips a fresh conversation access lookup for DM WebRTC signals when an active call session is already cached', async () => {
    const { client } = createSocketClient();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    });
    chatCallSessionService.getDirectSessionAccess.mockResolvedValue({
      conversationId: 'dm:user-2',
      conversationKey: 'DM#user-1#user-2',
      participants: ['user-1', 'user-2'],
      isGroup: false,
    });
    chatCallSessionService.touchSignalingSession.mockResolvedValue({
      status: 'ACTIVE',
    });

    const result = await gateway.handleWebRTCOffer(client, {
      conversationId: 'dm:user-2',
      offer: { sdp: 'offer-sdp', type: 'offer' },
    });

    expect(result).toEqual({
      success: true,
      data: { success: true },
    });
    expect(chatCallSessionService.getDirectSessionAccess).toHaveBeenCalledWith(
      'DM#user-1#user-2',
      actor.id,
    );
    expect(
      conversationsService.resolveConversationAccess,
    ).not.toHaveBeenCalled();
    expect(chatRealtimeService.emitToUsers).toHaveBeenCalledWith(
      ['user-2'],
      'webrtc.offer',
      {
        conversationId: 'dm:user-2',
        offer: { sdp: 'offer-sdp', type: 'offer' },
      },
    );
  });

  it('refreshes active call sessions through call-heartbeat without reloading DM access from storage', async () => {
    const { client } = createSocketClient();

    chatSocketAuthService.authenticate.mockResolvedValue({
      user: actor,
      sessionId: 'session-1',
      token: 'access-token',
      claims: {
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    });
    chatCallSessionService.getDirectSessionAccess.mockResolvedValue({
      conversationId: 'dm:user-2',
      conversationKey: 'DM#user-1#user-2',
      participants: ['user-1', 'user-2'],
      isGroup: false,
    });
    chatCallSessionService.touchSignalingSession.mockResolvedValue({
      status: 'ACTIVE',
    });

    const result = await gateway.handleCallHeartbeat(client, {
      conversationId: 'dm:user-2',
    });

    expect(result).toEqual({
      success: true,
      data: { success: true },
    });
    expect(chatCallSessionService.getDirectSessionAccess).toHaveBeenCalledWith(
      'DM#user-1#user-2',
      actor.id,
    );
    expect(
      conversationsService.resolveConversationAccess,
    ).not.toHaveBeenCalled();
    expect(chatRealtimeService.emitToUsers).not.toHaveBeenCalledWith(
      ['user-2'],
      'call.heartbeat',
      expect.anything(),
    );
    expect(observabilityService.recordRealtimeAck).toHaveBeenCalledWith(
      'call.heartbeat',
      expect.any(Number),
      'success',
    );
  });
});

function createSocketClient(): {
  client: GatewayClient;
  disconnect: jest.Mock;
} {
  const disconnect = jest.fn();

  return {
    client: {
      id: 'socket-1',
      data: {},
      emit: jest.fn(),
      disconnect,
      handshake: {
        auth: {},
        headers: {},
        query: {},
      },
    } as unknown as GatewayClient,
    disconnect,
  };
}
