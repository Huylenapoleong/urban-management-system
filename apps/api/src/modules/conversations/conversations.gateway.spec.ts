import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '@urban/shared-types';
import { ConversationsGateway } from './conversations.gateway';

type GatewayClient = Parameters<ConversationsGateway['deleteConversation']>[0];

describe('ConversationsGateway', () => {
  const chatSocketAuthService = {
    authenticate: jest.fn(),
  };
  const chatRealtimeService = {
    bindServer: jest.fn(),
    joinConversation: jest.fn(),
  };
  const chatPresenceService = {
    attachSocket: jest.fn(),
    detachSocket: jest.fn(),
    getPresence: jest.fn(),
    listPresence: jest.fn(),
  };
  const conversationsService = {
    deleteConversation: jest.fn(),
    resolveConversationAccess: jest.fn(),
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
