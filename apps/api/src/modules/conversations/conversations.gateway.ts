import { HttpException, Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  CHAT_SOCKET_EVENTS,
  CHAT_SOCKET_NAMESPACE,
} from '@urban/shared-constants';
import type {
  AuthenticatedUser,
  ChatConversationCommandPayload,
  ChatConversationDeletedAccepted,
  ChatConversationSubscription,
  ChatConversationUnsubscription,
  ChatMessageAccepted,
  ChatMessageDeletedAccepted,
  ChatMessageDeletePayload,
  ChatMessageSendPayload,
  ChatMessageUpdatedAccepted,
  ChatMessageUpdatePayload,
  ChatPresenceSnapshotEvent,
  ChatPresenceUpdatedEvent,
  ChatReadAccepted,
  ChatSocketAck,
  ChatSocketError,
  ChatSocketReadyPayload,
  ChatTypingAccepted,
  ChatTypingCommandPayload,
  ChatTypingStateEvent,
} from '@urban/shared-types';
import { nowIso } from '@urban/shared-utils';
import type { Server, Socket } from 'socket.io';
import { Public } from '../../common/decorators/public.decorator';
import {
  ensureObject,
  optionalString,
  requiredString,
} from '../../common/validation';
import { ChatPresenceService } from '../../infrastructure/realtime/chat-presence.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatSocketAuthService } from './chat-socket-auth.service';
import { ConversationsService } from './conversations.service';

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  {
    user?: AuthenticatedUser;
    sessionId?: string;
  }
>;

@Public()
@WebSocketGateway({
  namespace: CHAT_SOCKET_NAMESPACE,
})
@Injectable()
export class ConversationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chatSocketAuthService: ChatSocketAuthService,
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly chatPresenceService: ChatPresenceService,
    private readonly conversationsService: ConversationsService,
  ) {}

  afterInit(server: Server): void {
    this.chatRealtimeService.bindServer(server);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const authContext = await this.chatSocketAuthService.authenticate(client);
      const { user, sessionId } = authContext;
      client.data.user = user;
      client.data.sessionId = sessionId;
      await this.chatRealtimeService.attachUserSocket(
        client,
        user.id,
        sessionId,
      );
      await this.chatPresenceService.attachSocket(user.id, client.id);

      const payload: ChatSocketReadyPayload = {
        user,
        connectedAt: nowIso(),
        namespace: CHAT_SOCKET_NAMESPACE,
      };

      this.emitClientEvent(client, CHAT_SOCKET_EVENTS.READY, payload);
    } catch (error) {
      this.emitClientEvent(
        client,
        CHAT_SOCKET_EVENTS.ERROR,
        this.toSocketError(error, 'CHAT_AUTH_FAILED'),
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const user = client.data.user;

    if (!user) {
      return;
    }

    const joinedConversationKeys =
      this.chatRealtimeService.getJoinedConversationKeys(client);

    await this.chatPresenceService.detachSocket(user.id, client.id);

    for (const conversationKey of joinedConversationKeys) {
      await this.broadcastPresenceUpdate(conversationKey, user.id);
    }
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CONVERSATION_JOIN)
  async joinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatConversationCommandPayload,
  ): Promise<ChatSocketAck<ChatConversationSubscription>> {
    return this.withAck(async () => {
      const user = await this.getSocketUser(client);
      const conversationId = this.extractConversationId(payload);
      const access = await this.conversationsService.resolveConversationAccess(
        user,
        conversationId,
      );

      await this.chatRealtimeService.joinConversation(
        client,
        access.conversationKey,
      );
      await this.emitPresenceSnapshot(
        client,
        access.conversationKey,
        access.participants,
      );
      await this.broadcastPresenceUpdate(
        access.conversationKey,
        user.id,
        client.id,
      );

      return {
        conversationId: access.conversationId,
        conversationKey: access.conversationKey,
        isGroup: access.isGroup,
        participantCount: access.participants.length,
        joinedAt: nowIso(),
      };
    }, 'CHAT_CONVERSATION_JOIN_FAILED');
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE)
  async leaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatConversationCommandPayload,
  ): Promise<ChatSocketAck<ChatConversationUnsubscription>> {
    return this.withAck(async () => {
      const user = await this.getSocketUser(client);
      const conversationId = this.extractConversationId(payload);
      const access = await this.conversationsService.resolveConversationAccess(
        user,
        conversationId,
      );

      await this.chatRealtimeService.leaveConversation(
        client,
        access.conversationKey,
      );

      return {
        conversationId: access.conversationId,
        conversationKey: access.conversationKey,
        leftAt: nowIso(),
      };
    }, 'CHAT_CONVERSATION_LEAVE_FAILED');
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CONVERSATION_DELETE)
  async deleteConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatConversationCommandPayload,
  ): Promise<ChatSocketAck<ChatConversationDeletedAccepted>> {
    return this.withAck(async () => {
      const user = await this.getSocketUser(client);
      const conversationId = this.extractConversationId(payload);
      const result = await this.conversationsService.deleteConversation(
        user,
        conversationId,
      );

      return {
        conversationId: result.conversationId,
        removedAt: result.removedAt,
      };
    }, 'CHAT_CONVERSATION_DELETE_FAILED');
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.MESSAGE_SEND)
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatMessageSendPayload,
  ): Promise<ChatSocketAck<ChatMessageAccepted>> {
    return this.withAck(async () => {
      const user = await this.getSocketUser(client);
      const body = ensureObject(payload as unknown);
      const conversationId = requiredString(body, 'conversationId', {
        minLength: 1,
        maxLength: 200,
      });
      const clientMessageId = optionalString(body, 'clientMessageId', {
        maxLength: 100,
      });
      const access = await this.conversationsService.resolveConversationAccess(
        user,
        conversationId,
        true,
      );

      await this.chatRealtimeService.joinConversation(
        client,
        access.conversationKey,
      );

      const message = await this.conversationsService.sendMessage(
        user,
        access.conversationKey,
        body,
      );

      return {
        conversationId: access.conversationId,
        conversationKey: access.conversationKey,
        messageId: message.id,
        clientMessageId,
        acceptedAt: message.sentAt,
      };
    }, 'CHAT_MESSAGE_SEND_FAILED');
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.MESSAGE_UPDATE)
  async updateMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatMessageUpdatePayload,
  ): Promise<ChatSocketAck<ChatMessageUpdatedAccepted>> {
    return this.withAck(async () => {
      const user = await this.getSocketUser(client);
      const body = ensureObject(payload as unknown);
      const conversationId = requiredString(body, 'conversationId', {
        minLength: 1,
        maxLength: 200,
      });
      const messageId = requiredString(body, 'messageId', {
        minLength: 5,
        maxLength: 50,
      });
      const access = await this.conversationsService.resolveConversationAccess(
        user,
        conversationId,
        true,
      );

      await this.chatRealtimeService.joinConversation(
        client,
        access.conversationKey,
      );

      const message = await this.conversationsService.updateMessage(
        user,
        access.conversationKey,
        messageId,
        body,
      );

      return {
        conversationId: access.conversationId,
        conversationKey: access.conversationKey,
        messageId: message.id,
        updatedAt: message.updatedAt,
      };
    }, 'CHAT_MESSAGE_UPDATE_FAILED');
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.MESSAGE_DELETE)
  async deleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatMessageDeletePayload,
  ): Promise<ChatSocketAck<ChatMessageDeletedAccepted>> {
    return this.withAck(async () => {
      const user = await this.getSocketUser(client);
      const body = ensureObject(payload as unknown);
      const conversationId = requiredString(body, 'conversationId', {
        minLength: 1,
        maxLength: 200,
      });
      const messageId = requiredString(body, 'messageId', {
        minLength: 5,
        maxLength: 50,
      });
      const access = await this.conversationsService.resolveConversationAccess(
        user,
        conversationId,
        true,
      );

      await this.chatRealtimeService.joinConversation(
        client,
        access.conversationKey,
      );

      const message = await this.conversationsService.deleteMessage(
        user,
        access.conversationKey,
        messageId,
      );

      return {
        conversationId: access.conversationId,
        conversationKey: access.conversationKey,
        messageId: message.id,
        deletedAt: message.deletedAt ?? message.updatedAt,
      };
    }, 'CHAT_MESSAGE_DELETE_FAILED');
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CONVERSATION_READ)
  async markConversationRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatConversationCommandPayload,
  ): Promise<ChatSocketAck<ChatReadAccepted>> {
    return this.withAck(async () => {
      const user = await this.getSocketUser(client);
      const conversationId = this.extractConversationId(payload);
      const access = await this.conversationsService.resolveConversationAccess(
        user,
        conversationId,
      );
      const summary = await this.conversationsService.markAsRead(
        user,
        access.conversationKey,
      );

      return {
        conversationId: summary.conversationId,
        conversationKey: access.conversationKey,
        readAt: summary.updatedAt,
      };
    }, 'CHAT_CONVERSATION_READ_FAILED');
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.TYPING_START)
  async typingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatTypingCommandPayload,
  ): Promise<ChatSocketAck<ChatTypingAccepted>> {
    return this.handleTypingState(client, payload, true);
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.TYPING_STOP)
  async typingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatTypingCommandPayload,
  ): Promise<ChatSocketAck<ChatTypingAccepted>> {
    return this.handleTypingState(client, payload, false);
  }

  private async handleTypingState(
    client: AuthenticatedSocket,
    payload: ChatTypingCommandPayload,
    isTyping: boolean,
  ): Promise<ChatSocketAck<ChatTypingAccepted>> {
    return this.withAck(async () => {
      const user = await this.getSocketUser(client);
      const body = ensureObject(payload as unknown);
      const conversationId = requiredString(body, 'conversationId', {
        minLength: 1,
        maxLength: 200,
      });
      const clientTimestamp = optionalString(body, 'clientTimestamp', {
        maxLength: 100,
      });
      const access = await this.conversationsService.resolveConversationAccess(
        user,
        conversationId,
        true,
      );

      await this.chatRealtimeService.joinConversation(
        client,
        access.conversationKey,
      );

      const typingPayload: ChatTypingStateEvent = {
        conversationKey: access.conversationKey,
        userId: user.id,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        isTyping,
        occurredAt: nowIso(),
        clientTimestamp,
      };

      this.chatRealtimeService.emitTypingState(
        access.conversationKey,
        typingPayload,
        client.id,
      );

      return {
        conversationId: access.conversationId,
        conversationKey: access.conversationKey,
        isTyping,
        acceptedAt: typingPayload.occurredAt,
      };
    }, 'CHAT_TYPING_STATE_FAILED');
  }

  private async emitPresenceSnapshot(
    client: AuthenticatedSocket,
    conversationKey: string,
    participants: string[],
  ): Promise<void> {
    const payload: ChatPresenceSnapshotEvent = {
      conversationKey,
      participants: await this.chatPresenceService.listPresence(participants),
      occurredAt: nowIso(),
    };

    this.emitClientEvent(client, CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, payload);
  }

  private async broadcastPresenceUpdate(
    conversationKey: string,
    userId: string,
    exceptSocketId?: string,
  ): Promise<void> {
    const payload: ChatPresenceUpdatedEvent = {
      conversationKey,
      presence: await this.chatPresenceService.getPresence(userId),
      occurredAt: nowIso(),
    };

    this.chatRealtimeService.emitToConversation(
      conversationKey,
      CHAT_SOCKET_EVENTS.PRESENCE_UPDATED,
      payload,
      exceptSocketId,
    );
  }

  private emitClientEvent<TPayload>(
    client: AuthenticatedSocket,
    event: string,
    payload: TPayload,
  ): void {
    (client.emit as (eventName: string, data: TPayload) => boolean)(
      event,
      payload,
    );
  }

  private async getSocketUser(
    client: AuthenticatedSocket,
  ): Promise<AuthenticatedUser> {
    try {
      const authContext = await this.chatSocketAuthService.authenticate(client);
      client.data.user = authContext.user;
      client.data.sessionId = authContext.sessionId;
      return authContext.user;
    } catch (error) {
      client.disconnect(true);
      throw error;
    }
  }

  private extractConversationId(payload: unknown): string {
    const body = ensureObject(payload);
    return requiredString(body, 'conversationId', {
      minLength: 1,
      maxLength: 200,
    });
  }

  private async withAck<TData>(
    action: () => Promise<TData>,
    code: string,
  ): Promise<ChatSocketAck<TData>> {
    try {
      return {
        success: true,
        data: await action(),
      };
    } catch (error) {
      return {
        success: false,
        error: this.toSocketError(error, code),
      };
    }
  }

  private toSocketError(error: unknown, code: string): ChatSocketError {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      let message = error.message;

      if (typeof response === 'string') {
        message = response;
      } else if (
        response &&
        typeof response === 'object' &&
        'message' in response
      ) {
        const responseMessage = (response as { message?: string | string[] })
          .message;
        message = Array.isArray(responseMessage)
          ? responseMessage.join(', ')
          : (responseMessage ?? message);
      }

      return {
        code,
        message,
        statusCode: error.getStatus(),
      };
    }

    if (error instanceof Error) {
      return {
        code,
        message: error.message,
      };
    }

    return {
      code,
      message: 'Unknown socket error.',
    };
  }
}
