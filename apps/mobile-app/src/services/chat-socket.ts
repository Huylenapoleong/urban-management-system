import type { Socket } from "socket.io-client";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type {
  ChatConversationCommandPayload,
  ChatConversationSubscription,
  ChatSocketAck,
} from "@urban/shared-types";
import { readAccessToken as readStoredAccessToken } from "./api/client";
import { socketClient } from "@/lib/socket-client";

type ChatSocketInstance = Socket;

async function requireAccessToken(): Promise<string> {
  const token = await readStoredAccessToken();

  if (!token) {
    throw new Error("Missing access token.");
  }

  return token;
}

export async function connectChatSocket(): Promise<ChatSocketInstance> {
  await requireAccessToken();
  await socketClient.connect();

  if (!socketClient.socket) {
    throw new Error("Socket is not initialized.");
  }

  return socketClient.socket;
}

export function getChatSocket(): ChatSocketInstance | undefined {
  return socketClient.socket ?? undefined;
}

export function disconnectChatSocket(): void {
  socketClient.disconnect();
}

export async function emitChatAck<TData>(
  event: string,
  payload: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<ChatSocketAck<TData>> {
  const socket = await connectChatSocket();

  return await new Promise<ChatSocketAck<TData>>((resolve, reject) => {
    socket.timeout(timeoutMs).emit(
      event,
      payload,
      (error: Error | null, response: ChatSocketAck<TData>) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(response);
      },
    );
  });
}

export async function joinConversation(
  conversationId: string,
): Promise<ChatSocketAck<ChatConversationSubscription>> {
  const payload: ChatConversationCommandPayload = { conversationId };
  return await emitChatAck<ChatConversationSubscription>(
    CHAT_SOCKET_EVENTS.CONVERSATION_JOIN,
    payload as unknown as Record<string, unknown>,
  );
}

export async function leaveConversation(
  conversationId: string,
): Promise<ChatSocketAck<{ conversationId: string }>> {
  const socket = getChatSocket();

  if (!socket || !socket.connected) {
    return {
      success: true,
      data: { conversationId },
    };
  }

  const payload: ChatConversationCommandPayload = { conversationId };
  return await emitChatAck<{ conversationId: string }>(
    CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE,
    payload as unknown as Record<string, unknown>,
  );
}
