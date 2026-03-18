import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import type { ChatTypingStateEvent } from '@urban/shared-types';

@Injectable()
export class ChatRealtimeService {
  private server?: Server;

  bindServer(server: Server): void {
    this.server = server;
  }

  async attachUserSocket(socket: Socket, userId: string): Promise<void> {
    await socket.join(this.makeUserRoom(userId));
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

  emitToUser<TPayload>(userId: string, event: string, payload: TPayload): void {
    this.server?.to(this.makeUserRoom(userId)).emit(event, payload);
  }

  emitTypingState(
    conversationKey: string,
    payload: ChatTypingStateEvent,
    exceptSocketId?: string,
  ): void {
    if (!this.server) {
      return;
    }

    const room = this.makeConversationRoom(conversationKey);
    const emitter = exceptSocketId
      ? this.server.except(exceptSocketId).to(room)
      : this.server.to(room);

    emitter.emit(CHAT_SOCKET_EVENTS.TYPING_STATE, payload);
  }

  private makeUserRoom(userId: string): string {
    return `chat:user:${userId}`;
  }

  private makeConversationRoom(conversationKey: string): string {
    return `chat:conversation:${conversationKey}`;
  }
}
