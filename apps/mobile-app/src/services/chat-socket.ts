import { io, type Socket } from "socket.io-client";
import { CHAT_SOCKET_EVENTS, CHAT_SOCKET_NAMESPACE } from "@urban/shared-constants";
import type {
  ChatConversationCommandPayload,
  ChatConversationSubscription,
  ChatSocketAck,
} from "@urban/shared-types";
import { readAccessToken as readStoredAccessToken } from "./api/client";

type ChatSocketInstance = Socket;

let chatSocket: ChatSocketInstance | undefined;
let chatSocketToken: string | undefined;

function getApiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_API_URL ||
    process.env.API_BASE_URL ||
    "http://localhost:3001"
  );
}

function getSocketOrigin(): string {
  const apiBaseUrl = getApiBaseUrl().trim();
  return apiBaseUrl.replace(/\/api\/?$/i, "");
}

async function requireAccessToken(): Promise<string> {
  const token = await readStoredAccessToken();

  if (!token) {
    throw new Error("Missing access token.");
  }

  return token;
}

export async function connectChatSocket(): Promise<ChatSocketInstance> {
  const token = await requireAccessToken();
  const bearerToken = `Bearer ${token}`;

  if (!chatSocket) {
    chatSocket = io(`${getSocketOrigin()}${CHAT_SOCKET_NAMESPACE}`, {
      autoConnect: false,
      auth: {
        token: bearerToken,
      },
      transports: ["websocket"],
    });
    chatSocketToken = bearerToken;
  } else if (chatSocketToken !== bearerToken) {
    chatSocket.removeAllListeners();
    chatSocket.disconnect();
    chatSocket.auth = {
      token: bearerToken,
    };
    chatSocketToken = bearerToken;
  } else {
    chatSocket.auth = {
      token: bearerToken,
    };
  }

  if (!chatSocket.connected) {
    chatSocket.connect();
  }

  return chatSocket;
}

export function getChatSocket(): ChatSocketInstance | undefined {
  return chatSocket;
}

export function disconnectChatSocket(): void {
  if (!chatSocket) {
    return;
  }

  chatSocket.removeAllListeners();
  chatSocket.disconnect();
  chatSocket = undefined;
  chatSocketToken = undefined;
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
  if (!chatSocket || !chatSocket.connected) {
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
