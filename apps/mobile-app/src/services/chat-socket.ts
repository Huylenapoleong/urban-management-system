import AsyncStorage from "@react-native-async-storage/async-storage";
import { io, type Socket } from "socket.io-client";
import { CHAT_SOCKET_EVENTS, CHAT_SOCKET_NAMESPACE } from "@urban/shared-constants";
import type {
  ChatConversationCommandPayload,
  ChatConversationSubscription,
  ChatSocketAck,
  ChatSocketReadyPayload,
} from "@urban/shared-types";
import { ACCESS_TOKEN_KEY } from "./api/client";

type ChatEventMap = {
  [CHAT_SOCKET_EVENTS.READY]: ChatSocketReadyPayload;
};

type ChatSocketInstance = Socket<ChatEventMap>;

let chatSocket: ChatSocketInstance | undefined;

function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || "http://localhost:3001/api";
}

function getSocketOrigin(): string {
  const apiBaseUrl = getApiBaseUrl().trim();
  return apiBaseUrl.replace(/\/api\/?$/i, "");
}

async function readAccessToken(): Promise<string> {
  const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);

  if (!token) {
    throw new Error("Missing access token.");
  }

  return token;
}

export async function connectChatSocket(): Promise<ChatSocketInstance> {
  const token = await readAccessToken();

  if (!chatSocket) {
    chatSocket = io(`${getSocketOrigin()}${CHAT_SOCKET_NAMESPACE}`, {
      autoConnect: false,
      auth: {
        token: `Bearer ${token}`,
      },
      transports: ["websocket"],
    });
  } else {
    chatSocket.auth = {
      token: `Bearer ${token}`,
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
    payload,
  );
}

export async function leaveConversation(
  conversationId: string,
): Promise<ChatSocketAck<{ conversationId: string }>> {
  const payload: ChatConversationCommandPayload = { conversationId };
  return await emitChatAck<{ conversationId: string }>(
    CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE,
    payload,
  );
}
