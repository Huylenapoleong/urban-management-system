import { HttpException, Injectable, Logger } from '@nestjs/common';
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
import {
  isDmConversationId,
  isGroupConversationId,
  makeDmConversationId,
  nowIso,
} from '@urban/shared-utils';
import type {
  AuthenticatedUser,
  ChatCallAcceptPayload,
  ChatCallEndPayload,
  ChatCallInitPayload,
  ChatCallRejectPayload,
  ChatConversationCommandPayload,
  ChatConversationDeletedAccepted,
  ChatConversationSubscription,
  ChatConversationUnsubscription,
  ChatMessageAccepted,
  ChatMessageDeletedAccepted,
  ChatMessageDeletePayload,
  ChatMessageRecallPayload,
  ChatMessageSendPayload,
  ChatMessageUpdatedAccepted,
  ChatMessageUpdatePayload,
  ChatPresenceSnapshotEvent,
  ChatPresenceUpdatedEvent,
  RecallMessageResult,
  ChatReadAccepted,
  ChatSocketAck,
  ChatSocketError,
  ChatSocketReadyPayload,
  ChatTypingAccepted,
  ChatTypingCommandPayload,
  ChatTypingStateEvent,
  ChatWebRTCAnswerPayload,
  ChatWebRTCIceCandidatePayload,
  ChatWebRTCOfferPayload,
} from '@urban/shared-types';
import type { Server, Socket } from 'socket.io';
import { Public } from '../../common/decorators/public.decorator';
import {
  ensureObject,
  requiredBoolean,
  optionalString,
  requiredString,
} from '../../common/validation';
import { ChatPresenceService } from '../../infrastructure/realtime/chat-presence.service';
import { ObservabilityService } from '../../infrastructure/observability/observability.service';
import { ChatCallSessionService } from './chat-call-session.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatSocketAuthService } from './chat-socket-auth.service';
import {
  ConversationsService,
  type ResolvedConversationAccess,
} from './conversations.service';

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  {
    user?: AuthenticatedUser;
    sessionId?: string;
    claims?: {
      exp: number;
    };
    authenticatedAtMs?: number;
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
  private readonly logger = new Logger(ConversationsGateway.name);
  private readonly socketAuthCacheWindowMs = 30_000;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chatSocketAuthService: ChatSocketAuthService,
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly chatPresenceService: ChatPresenceService,
    private readonly conversationsService: ConversationsService,
    private readonly chatCallSessionService: ChatCallSessionService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  afterInit(server: Server): void {
    this.chatRealtimeService.bindServer(server);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const authContext = await this.chatSocketAuthService.authenticate(client);
      const { user, sessionId } = authContext;
      this.cacheSocketAuthContext(client, authContext);
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
    return this.withAck(
      async () => {
        const user = await this.getSocketUser(client);
        const conversationId = this.extractConversationId(payload);
        const access =
          await this.conversationsService.resolveConversationAccess(
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
      },
      'CHAT_CONVERSATION_JOIN_FAILED',
      CHAT_SOCKET_EVENTS.CONVERSATION_JOIN,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE)
  async leaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatConversationCommandPayload,
  ): Promise<ChatSocketAck<ChatConversationUnsubscription>> {
    return this.withAck(
      async () => {
        const user = await this.getSocketUser(client);
        const conversationId = this.extractConversationId(payload);
        const access =
          await this.conversationsService.resolveConversationAccess(
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
      },
      'CHAT_CONVERSATION_LEAVE_FAILED',
      CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CONVERSATION_DELETE)
  async deleteConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatConversationCommandPayload,
  ): Promise<ChatSocketAck<ChatConversationDeletedAccepted>> {
    return this.withAck(
      async () => {
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
      },
      'CHAT_CONVERSATION_DELETE_FAILED',
      CHAT_SOCKET_EVENTS.CONVERSATION_DELETE,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.MESSAGE_SEND)
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatMessageSendPayload,
  ): Promise<ChatSocketAck<ChatMessageAccepted>> {
    return this.withAck(
      async () => {
        const user = await this.getSocketUser(client);
        const body = ensureObject(payload as unknown);
        const conversationId = requiredString(body, 'conversationId', {
          minLength: 1,
          maxLength: 200,
        });
        const clientMessageId = optionalString(body, 'clientMessageId', {
          maxLength: 100,
        });
        const access =
          await this.conversationsService.resolveConversationAccess(
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
      },
      'CHAT_MESSAGE_SEND_FAILED',
      CHAT_SOCKET_EVENTS.MESSAGE_SEND,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.MESSAGE_UPDATE)
  async updateMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatMessageUpdatePayload,
  ): Promise<ChatSocketAck<ChatMessageUpdatedAccepted>> {
    return this.withAck(
      async () => {
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
        const access =
          await this.conversationsService.resolveConversationAccess(
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
      },
      'CHAT_MESSAGE_UPDATE_FAILED',
      CHAT_SOCKET_EVENTS.MESSAGE_UPDATE,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.MESSAGE_DELETE)
  async deleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatMessageDeletePayload,
  ): Promise<ChatSocketAck<ChatMessageDeletedAccepted>> {
    return this.withAck(
      async () => {
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
        const access =
          await this.conversationsService.resolveConversationAccess(
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
      },
      'CHAT_MESSAGE_DELETE_FAILED',
      CHAT_SOCKET_EVENTS.MESSAGE_DELETE,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.MESSAGE_RECALL)
  async recallMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatMessageRecallPayload,
  ): Promise<ChatSocketAck<RecallMessageResult>> {
    return this.withAck(
      async () => {
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

        return this.conversationsService.recallMessage(
          user,
          conversationId,
          messageId,
          body,
        );
      },
      'CHAT_MESSAGE_RECALL_FAILED',
      CHAT_SOCKET_EVENTS.MESSAGE_RECALL,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CONVERSATION_READ)
  async markConversationRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChatConversationCommandPayload,
  ): Promise<ChatSocketAck<ChatReadAccepted>> {
    return this.withAck(
      async () => {
        const user = await this.getSocketUser(client);
        const conversationId = this.extractConversationId(payload);
        const access =
          await this.conversationsService.resolveConversationAccess(
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
      },
      'CHAT_CONVERSATION_READ_FAILED',
      CHAT_SOCKET_EVENTS.CONVERSATION_READ,
    );
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
    return this.withAck(
      async () => {
        const user = await this.getSocketUser(client);
        const body = ensureObject(payload as unknown);
        const conversationId = requiredString(body, 'conversationId', {
          minLength: 1,
          maxLength: 200,
        });
        const clientTimestamp = optionalString(body, 'clientTimestamp', {
          maxLength: 100,
        });
        const access =
          await this.conversationsService.resolveConversationAccess(
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
          avatarAsset: user.avatarAsset,
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
      },
      'CHAT_TYPING_STATE_FAILED',
      isTyping
        ? CHAT_SOCKET_EVENTS.TYPING_START
        : CHAT_SOCKET_EVENTS.TYPING_STOP,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CALL_INIT)
  async handleCallInit(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ success: true }>> {
    return this.withAck(
      async () => {
        const { access, body, user } = await this.resolveSignalAccess(
          client,
          payload,
        );
        const signalPayload = this.buildCallInitPayload(
          access.conversationId,
          body,
          user,
        );
        const result = await this.chatCallSessionService.initiateCall(
          access,
          user.id,
          signalPayload.isVideo,
        );

        if (result.shouldEmit) {
          this.emitSignal(
            access,
            CHAT_SOCKET_EVENTS.CALL_INIT,
            signalPayload,
            client.id,
            user.id,
          );
        }

        return { success: true };
      },
      'CHAT_CALL_INIT_FAILED',
      CHAT_SOCKET_EVENTS.CALL_INIT,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CALL_ACCEPT)
  async handleCallAccept(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ success: true }>> {
    return this.withAck(
      async () => {
        const { access, user } = await this.resolveSignalAccess(
          client,
          payload,
        );
        const signalPayload = this.buildCallAcceptPayload(
          access.conversationId,
          user,
        );
        const result = await this.chatCallSessionService.acceptCall(
          access,
          user.id,
        );

        if (result.shouldEmit) {
          this.emitSignal(
            access,
            CHAT_SOCKET_EVENTS.CALL_ACCEPT,
            signalPayload,
            client.id,
            user.id,
          );
        }

        return { success: true };
      },
      'CHAT_CALL_ACCEPT_FAILED',
      CHAT_SOCKET_EVENTS.CALL_ACCEPT,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CALL_REJECT)
  async handleCallReject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ success: true }>> {
    return this.withAck(
      async () => {
        const { access, user } = await this.resolveSignalAccess(
          client,
          payload,
        );
        const signalPayload = this.buildCallRejectPayload(
          access.conversationId,
          user,
        );
        const result = await this.chatCallSessionService.rejectCall(
          access,
          user.id,
        );

        if (result.shouldEmit) {
          this.emitSignal(
            access,
            CHAT_SOCKET_EVENTS.CALL_REJECT,
            signalPayload,
            client.id,
            user.id,
          );
          void this.persistBestEffortCallSystemMessage(
            user,
            access.conversationKey,
            'Call was rejected.',
            CHAT_SOCKET_EVENTS.CALL_REJECT,
          );
        }

        return { success: true };
      },
      'CHAT_CALL_REJECT_FAILED',
      CHAT_SOCKET_EVENTS.CALL_REJECT,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.CALL_END)
  async handleCallEnd(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ success: true }>> {
    return this.withAck(
      async () => {
        const { access, user } = await this.resolveSignalAccess(
          client,
          payload,
        );
        const signalPayload = this.buildCallEndPayload(
          access.conversationId,
          user,
        );
        const result = await this.chatCallSessionService.endCall(
          access,
          user.id,
        );

        if (result.shouldEmit) {
          this.emitSignal(
            access,
            CHAT_SOCKET_EVENTS.CALL_END,
            signalPayload,
            client.id,
            user.id,
          );
          void this.persistBestEffortCallSystemMessage(
            user,
            access.conversationKey,
            'Call ended.',
            CHAT_SOCKET_EVENTS.CALL_END,
          );
        }

        return { success: true };
      },
      'CHAT_CALL_END_FAILED',
      CHAT_SOCKET_EVENTS.CALL_END,
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.WEBRTC_OFFER)
  async handleWebRTCOffer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ success: true }>> {
    return this.forwardWebRtcSignal(
      client,
      payload,
      CHAT_SOCKET_EVENTS.WEBRTC_OFFER,
      'CHAT_WEBRTC_OFFER_FAILED',
      'offer',
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER)
  async handleWebRTCAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ success: true }>> {
    return this.forwardWebRtcSignal(
      client,
      payload,
      CHAT_SOCKET_EVENTS.WEBRTC_ANSWER,
      'CHAT_WEBRTC_ANSWER_FAILED',
      'answer',
    );
  }

  @SubscribeMessage(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE)
  async handleWebRTCIceCandidate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<ChatSocketAck<{ success: true }>> {
    return this.forwardWebRtcSignal(
      client,
      payload,
      CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE,
      'CHAT_WEBRTC_ICE_CANDIDATE_FAILED',
      'candidate',
    );
  }

  private async forwardWebRtcSignal(
    client: AuthenticatedSocket,
    payload: unknown,
    event: string,
    errorCode: string,
    field: 'offer' | 'answer' | 'candidate',
  ): Promise<ChatSocketAck<{ success: true }>> {
    return this.withAck(
      async () => {
        const { access, body, user } = await this.resolveSignalAccess(
          client,
          payload,
          true,
        );
        await this.chatCallSessionService.touchSignalingSession(
          access,
          user.id,
        );
        const signalPayload = this.buildWebRtcPayload(
          access.conversationId,
          body,
          field,
        );
        this.emitSignal(access, event, signalPayload, client.id, user.id);
        return { success: true };
      },
      errorCode,
      event,
    );
  }

  private async resolveSignalAccess(
    client: AuthenticatedSocket,
    payload: unknown,
    preferDirectCallSessionFastPath = false,
  ): Promise<{
    access: ResolvedConversationAccess;
    body: Record<string, unknown>;
    user: AuthenticatedUser;
  }> {
    const user = await this.getSocketUser(client);
    const body = ensureObject(payload);
    const conversationId = this.extractConversationId(body);

    if (preferDirectCallSessionFastPath) {
      const directConversationKey = this.tryDeriveDirectConversationKey(
        user.id,
        conversationId,
      );

      if (directConversationKey) {
        const directSessionAccess =
          await this.chatCallSessionService.getDirectSessionAccess(
            directConversationKey,
            user.id,
          );

        if (directSessionAccess) {
          return {
            access: directSessionAccess,
            body,
            user,
          };
        }
      }
    }

    const access = await this.conversationsService.resolveConversationAccess(
      user,
      conversationId,
      true,
    );

    return { access, body, user };
  }

  private tryDeriveDirectConversationKey(
    actorUserId: string,
    conversationId: string,
  ): string | undefined {
    const normalizedConversationId = conversationId.trim();

    if (isDmConversationId(normalizedConversationId)) {
      return normalizedConversationId;
    }

    if (normalizedConversationId.startsWith('dm:')) {
      const targetUserId = normalizedConversationId.slice('dm:'.length).trim();

      if (!targetUserId) {
        return undefined;
      }

      return makeDmConversationId(actorUserId, targetUserId);
    }

    if (isGroupConversationId(normalizedConversationId)) {
      return undefined;
    }

    if (normalizedConversationId.startsWith('group:')) {
      return undefined;
    }

    return undefined;
  }

  private buildCallInitPayload(
    conversationId: string,
    body: Record<string, unknown>,
    user: AuthenticatedUser,
  ): ChatCallInitPayload {
    return {
      conversationId,
      callerId: user.id,
      callerName: user.fullName,
      isVideo: requiredBoolean(body, 'isVideo'),
    };
  }

  private buildCallAcceptPayload(
    conversationId: string,
    user: AuthenticatedUser,
  ): ChatCallAcceptPayload {
    return {
      conversationId,
      calleeId: user.id,
    };
  }

  private buildCallRejectPayload(
    conversationId: string,
    user: AuthenticatedUser,
  ): ChatCallRejectPayload {
    return {
      conversationId,
      calleeId: user.id,
    };
  }

  private buildCallEndPayload(
    conversationId: string,
    user: AuthenticatedUser,
  ): ChatCallEndPayload {
    return {
      conversationId,
      userId: user.id,
      endedByUserId: user.id,
    };
  }

  private buildWebRtcPayload(
    conversationId: string,
    body: Record<string, unknown>,
    field: 'offer' | 'answer' | 'candidate',
  ):
    | ChatWebRTCOfferPayload
    | ChatWebRTCAnswerPayload
    | ChatWebRTCIceCandidatePayload {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      throw new HttpException(`${field} is required.`, 400);
    }

    return {
      conversationId,
      [field]: body[field],
    } as unknown as
      | ChatWebRTCOfferPayload
      | ChatWebRTCAnswerPayload
      | ChatWebRTCIceCandidatePayload;
  }

  private async persistBestEffortCallSystemMessage(
    user: AuthenticatedUser,
    conversationKey: string,
    content: string,
    event: string,
  ): Promise<void> {
    await this.conversationsService
      .sendMessage(user, conversationKey, {
        content,
        type: 'SYSTEM',
      })
      .catch(() => {
        this.logger.warn(
          `Failed to persist ${event} system message for ${conversationKey}.`,
        );
      });
  }

  private emitSignal(
    access: ResolvedConversationAccess,
    event: string,
    payload: object,
    exceptSocketId: string,
    actorUserId: string,
  ): void {
    if (!access.isGroup) {
      const recipientUserIds = access.participants.filter(
        (participantId) => participantId !== actorUserId,
      );

      this.chatRealtimeService.emitToUsers(recipientUserIds, event, payload);
      return;
    }

    this.chatRealtimeService.emitToConversation(
      access.conversationKey,
      event,
      payload,
      exceptSocketId,
    );
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
    const now = Date.now();
    const cachedUser = client.data.user;
    const authenticatedAtMs = client.data.authenticatedAtMs;
    const claims = client.data.claims;

    if (
      cachedUser &&
      typeof authenticatedAtMs === 'number' &&
      now - authenticatedAtMs <= this.socketAuthCacheWindowMs &&
      claims &&
      claims.exp * 1000 > now
    ) {
      return cachedUser;
    }

    try {
      const authContext = await this.chatSocketAuthService.authenticate(client);
      this.cacheSocketAuthContext(client, authContext);
      return authContext.user;
    } catch (error) {
      client.disconnect(true);
      throw error;
    }
  }

  private cacheSocketAuthContext(
    client: AuthenticatedSocket,
    authContext: Awaited<ReturnType<ChatSocketAuthService['authenticate']>>,
  ): void {
    client.data.user = authContext.user;
    client.data.sessionId = authContext.sessionId;
    client.data.claims = {
      exp: authContext.claims.exp,
    };
    client.data.authenticatedAtMs = Date.now();
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
    eventName: string,
  ): Promise<ChatSocketAck<TData>> {
    const startedAtMs = Date.now();
    try {
      const data = await action();
      this.observabilityService.recordRealtimeAck(
        eventName,
        Date.now() - startedAtMs,
        'success',
      );
      return {
        success: true,
        data,
      };
    } catch (error) {
      this.observabilityService.recordRealtimeAck(
        eventName,
        Date.now() - startedAtMs,
        'failed',
      );
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
