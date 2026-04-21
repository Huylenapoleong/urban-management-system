import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import type { ChatTypingStateEvent } from '@urban/shared-types';

@Injectable()
export class ChatRealtimeService {
  private server?: Server;
  private readonly conversationRoomPrefix = 'chat:conversation:';
  private readonly userRoomPrefix = 'chat:user:';
  private readonly sessionRoomPrefix = 'chat:session:';

  bindServer(server: Server): void {
    this.server = server;
  }

  async attachUserSocket(
    socket: Socket,
    userId: string,
    sessionId?: string,
  ): Promise<void> {
    await socket.join(this.makeUserRoom(userId));

    if (sessionId) {
      await socket.join(this.makeSessionRoom(sessionId));
    }
  }

  async joinConversation(
    socket: Socket,
    conversationKey: string,
  ): Promise<void> {
    await socket.join(this.makeConversationRoom(conversationKey));
  }

  async leaveConversation(
    socket: Socket,
    conversationKey: string,
  ): Promise<void> {
    await socket.leave(this.makeConversationRoom(conversationKey));
  }

  leaveConversationForUser(userId: string, conversationKey: string): void {
    this.server
      ?.in(this.makeUserRoom(userId))
      .socketsLeave(this.makeConversationRoom(conversationKey));
  }

  emitToUser<TPayload>(userId: string, event: string, payload: TPayload): void {
    this.server?.to(this.makeUserRoom(userId)).emit(event, payload);
  }

  emitToUsers<TPayload>(
    userIds: string[],
    event: string,
    payload: TPayload,
  ): void {
    const uniqueUserIds = Array.from(
      new Set(userIds.map((userId) => userId.trim()).filter(Boolean)),
    );

    for (const userId of uniqueUserIds) {
      this.emitToUser(userId, event, payload);
    }
  }

  emitToConversation<TPayload>(
    conversationKey: string,
    event: string,
    payload: TPayload,
    exceptSocketId?: string,
  ): void {
    if (!this.server) {
      return;
    }

    const room = this.makeConversationRoom(conversationKey);
    const emitter = exceptSocketId
      ? this.server.except(exceptSocketId).to(room)
      : this.server.to(room);

    emitter.emit(event, payload);
  }

  emitTypingState(
    conversationKey: string,
    payload: ChatTypingStateEvent,
    exceptSocketId?: string,
  ): void {
    this.emitToConversation(
      conversationKey,
      CHAT_SOCKET_EVENTS.TYPING_STATE,
      payload,
      exceptSocketId,
    );
  }

  disconnectUserSockets(userId: string): void {
    this.server?.in(this.makeUserRoom(userId)).disconnectSockets(true);
  }

  disconnectSessionSockets(sessionId: string): void {
    this.server?.in(this.makeSessionRoom(sessionId)).disconnectSockets(true);
  }

  getJoinedConversationKeys(socket: Socket): string[] {
    return Array.from(socket.rooms)
      .filter((room) => room.startsWith(this.conversationRoomPrefix))
      .map((room) => room.slice(this.conversationRoomPrefix.length));
  }

  private makeUserRoom(userId: string): string {
    return `${this.userRoomPrefix}${userId}`;
  }

  private makeSessionRoom(sessionId: string): string {
    return `${this.sessionRoomPrefix}${sessionId}`;
  }

  private makeConversationRoom(conversationKey: string): string {
    return `${this.conversationRoomPrefix}${conversationKey}`;
  }
}
