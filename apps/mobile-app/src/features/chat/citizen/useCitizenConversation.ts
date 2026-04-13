import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type {
  ChatMessageCreatedEvent,
  ChatMessageDeletedEvent,
  ChatMessageUpdatedEvent,
  ChatPresenceSnapshotEvent,
  ChatPresenceState,
  ChatPresenceUpdatedEvent,
  ChatTypingStateEvent,
  MessageItem,
  JwtClaims,
} from "@urban/shared-types";
import { jwtDecode } from "jwt-decode";
import { listMessages } from "@/services/api/conversation.api";
import { readAccessToken } from "@/services/api/client";
import {
  emitChatAck,
  connectChatSocket,
  disconnectChatSocket,
  joinConversation,
  leaveConversation,
} from "@/services/chat-socket";
import {
  buildTextMessagePayload,
  rememberEvent,
  sortMessages,
  upsertSortedMessage,
} from "./chat-utils";

function isMissingConversationError(error: unknown): boolean {
  const message = (error as Error | undefined)?.message?.toLowerCase() ?? "";
  return message.includes("conversation not found");
}

type UseCitizenConversationParams = {
  conversationId?: string;
  currentUserId?: string;
};

type SendMessageOptions = {
  type?: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOC" | "EMOJI" | "SYSTEM";
  attachmentUrl?: string;
  replyTo?: string;
  content?: string;
  clientMessageId?: string;
};

export function useCitizenConversation({
  conversationId,
  currentUserId,
}: UseCitizenConversationParams) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenceByUser, setPresenceByUser] = useState<Record<string, ChatPresenceState>>({});
  const [typingByUser, setTypingByUser] = useState<Record<string, ChatTypingStateEvent>>({});
  const [joinedConversationKey, setJoinedConversationKey] = useState<string | null>(null);

  const joinedConversationKeyRef = useRef<string | null>(null);
  const seenEventIds = useRef(new Set<string>());

  const ensureSessionMatchesCurrentUser = useCallback(async () => {
    if (!currentUserId) {
      return true;
    }

    const token = await readAccessToken();

    if (!token) {
      setError("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      disconnectChatSocket();
      return false;
    }

    try {
      const claims = jwtDecode<JwtClaims>(token);

      if (claims.sub !== currentUserId) {
        setError("Phiên đăng nhập chưa đồng bộ. Vui lòng đăng xuất và đăng nhập lại.");
        disconnectChatSocket();
        return false;
      }
    } catch {
      setError("Không thể xác thực phiên đăng nhập hiện tại.");
      disconnectChatSocket();
      return false;
    }

    return true;
  }, [currentUserId]);

  const fetchMessages = useCallback(async (showLoader = false) => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (showLoader) {
      setLoading(true);
    }

    try {
      const data = await listMessages(conversationId);
      setMessages(sortMessages(data));
      setError(null);
      await emitChatAck(CHAT_SOCKET_EVENTS.CONVERSATION_READ, { conversationId });
    } catch (err: unknown) {
      if (isMissingConversationError(err)) {
        setMessages([]);
        setError(null);
        return;
      }

      setError((err as Error)?.message ?? "Unable to load messages");
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [conversationId]);

  useEffect(() => {
    void fetchMessages(true);
  }, [fetchMessages]);

  useEffect(() => {
    if (!conversationId) {
      setJoinedConversationKey(null);
      joinedConversationKeyRef.current = null;
      return;
    }

    let active = true;
    let cleanupSocketListeners: (() => void) | undefined;

    const syncJoinState = async () => {
      const isMatchingSession = await ensureSessionMatchesCurrentUser();

      if (!isMatchingSession) {
        return;
      }

      const response = await joinConversation(conversationId);

      if (!active) {
        return;
      }

      if (!response.success) {
        setError((current) => current ?? response.error.message);
        return;
      }

      joinedConversationKeyRef.current = response.data.conversationKey;
      setJoinedConversationKey(response.data.conversationKey);
      setError(null);
      await emitChatAck(CHAT_SOCKET_EVENTS.CONVERSATION_READ, { conversationId });
    };

    void connectChatSocket()
      .then((socket) => {
        const chatSocket = socket as any;

        const handleConnect = () => {
          void syncJoinState();
        };

        const handleMessageCreated = (event: ChatMessageCreatedEvent) => {
          if (event.conversationId !== conversationId || !rememberEvent(seenEventIds, event.eventId)) {
            return;
          }

          setMessages((prev) => {
            const filtered = prev.filter(
              (item: any) =>
                item.id !== event.clientMessageId &&
                item.clientMessageId !== event.clientMessageId,
            );

            return upsertSortedMessage(filtered, event.message);
          });
          setError(null);
        };

        const handleMessageUpdated = (event: ChatMessageUpdatedEvent) => {
          if (event.conversationId !== conversationId || !rememberEvent(seenEventIds, event.eventId)) {
            return;
          }

          setMessages((prev) => upsertSortedMessage(prev, event.message));
        };

        const handleMessageDeleted = (event: ChatMessageDeletedEvent) => {
          if (event.conversationId !== conversationId || !rememberEvent(seenEventIds, event.eventId)) {
            return;
          }

          setMessages((prev) => prev.filter((item) => item.id !== event.messageId));
        };

        const handlePresenceSnapshot = (event: ChatPresenceSnapshotEvent) => {
          if (event.conversationKey !== joinedConversationKeyRef.current) {
            return;
          }

          setPresenceByUser(
            Object.fromEntries(event.participants.map((item) => [item.userId, item] as const)),
          );
        };

        const handlePresenceUpdated = (event: ChatPresenceUpdatedEvent) => {
          if (event.conversationKey !== joinedConversationKeyRef.current) {
            return;
          }

          setPresenceByUser((prev) => ({
            ...prev,
            [event.presence.userId]: event.presence,
          }));
        };

        const handleTypingState = (event: ChatTypingStateEvent) => {
          if (
            event.conversationKey !== joinedConversationKeyRef.current ||
            event.userId === currentUserId
          ) {
            return;
          }

          setTypingByUser((prev) => {
            if (!event.isTyping) {
              const next = { ...prev };
              delete next[event.userId];
              return next;
            }

            return {
              ...prev,
              [event.userId]: event,
            };
          });
        };

        chatSocket.on("connect", handleConnect);
        chatSocket.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);
        chatSocket.on(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
        chatSocket.on(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
        chatSocket.on(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
        chatSocket.on(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, handlePresenceUpdated);
        chatSocket.on(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);

        void syncJoinState();

        if (!active) {
          chatSocket.off("connect", handleConnect);
          chatSocket.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);
          chatSocket.off(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
          chatSocket.off(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
          chatSocket.off(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
          chatSocket.off(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, handlePresenceUpdated);
          chatSocket.off(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);
          return;
        }

        cleanupSocketListeners = () => {
          chatSocket.off("connect", handleConnect);
          chatSocket.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);
          chatSocket.off(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
          chatSocket.off(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
          chatSocket.off(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
          chatSocket.off(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, handlePresenceUpdated);
          chatSocket.off(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);
        };
      })
      .catch((err: unknown) => {
        if (active) {
          setError((current) => current ?? ((err as Error)?.message || "Unable to connect realtime chat"));
        }
      });

    return () => {
      active = false;
      cleanupSocketListeners?.();
      setPresenceByUser({});
      setTypingByUser({});
      setJoinedConversationKey(null);
      joinedConversationKeyRef.current = null;
      void leaveConversation(conversationId).catch(() => {});
    };
  }, [conversationId, currentUserId, ensureSessionMatchesCurrentUser]);

  const sendMessage = useCallback(async (text: string, options?: SendMessageOptions) => {
    const messageType = options?.type ?? "TEXT";
    const payloadContent =
      options?.content ??
      (messageType === "TEXT" || messageType === "EMOJI"
        ? buildTextMessagePayload(text)
        : text);

    if (!conversationId || (!payloadContent?.trim() && !options?.attachmentUrl) || sending) {
      return false;
    }

    const nextClientMessageId =
      options?.clientMessageId ||
      `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Optimistic insert for smoother UX while waiting socket ack.
    setMessages((prev) => [
      ...prev,
      {
        id: nextClientMessageId,
        conversationId,
        senderId: currentUserId || 'me',
        senderName: 'Bạn',
        type: messageType,
        content: payloadContent,
        attachmentUrl: options?.attachmentUrl,
        replyTo: options?.replyTo,
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        clientMessageId: nextClientMessageId,
        isOptimistic: true,
      } as any,
    ]);

    setSending(true);

    try {
      const isMatchingSession = await ensureSessionMatchesCurrentUser();

      if (!isMatchingSession) {
        return false;
      }

      const response = await emitChatAck(
        CHAT_SOCKET_EVENTS.MESSAGE_SEND,
        {
          conversationId,
          content: payloadContent,
          type: messageType,
          attachmentUrl: options?.attachmentUrl,
          replyTo: options?.replyTo,
          clientMessageId: nextClientMessageId,
        },
      );

      if (!response.success) {
        setMessages((prev) => prev.filter((item: any) => item.id !== nextClientMessageId));
        setError(response.error.message);
        return false;
      }

      setError(null);
      return true;
      setMessages((prev) => prev.filter((item: any) => item.id !== nextClientMessageId));
      throw error;
    } finally {
      setSending(false);
    }
  }, [conversationId, currentUserId, ensureSessionMatchesCurrentUser, sending]);

  const setTyping = useCallback((isTyping: boolean) => {
    if (!conversationId) {
      return;
    }

    void emitChatAck(
      isTyping ? CHAT_SOCKET_EVENTS.TYPING_START : CHAT_SOCKET_EVENTS.TYPING_STOP,
      {
        conversationId,
        clientTimestamp: new Date().toISOString(),
      },
    );
  }, [conversationId]);

  const updateMessage = useCallback(async (messageId: string, content: string) => {
    if (!conversationId || !messageId) {
      return false;
    }

    const response = await emitChatAck(
      CHAT_SOCKET_EVENTS.MESSAGE_UPDATE,
      {
        conversationId,
        messageId,
        content,
      },
    );

    if (!response.success) {
      setError(response.error.message);
      return false;
    }

    setError(null);
    return true;
  }, [conversationId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!conversationId || !messageId) {
      return false;
    }

    const response = await emitChatAck(
      CHAT_SOCKET_EVENTS.MESSAGE_DELETE,
      {
        conversationId,
        messageId,
      },
    );

    if (!response.success) {
      setError(response.error.message);
      return false;
    }

    setError(null);
    return true;
  }, [conversationId]);

  const typingUsers = useMemo(
    () => Object.values(typingByUser).map((item) => item.fullName).filter(Boolean),
    [typingByUser],
  );

  const activeParticipants = useMemo(
    () =>
      Object.values(presenceByUser).filter(
        (item) => item.isActive && item.userId !== currentUserId,
      ).length,
    [currentUserId, presenceByUser],
  );

  const subtitle = typingUsers.length
    ? `${typingUsers.join(", ")} đang gõ tin nhắn`
    : activeParticipants > 0
      ? `${activeParticipants} người đang online`
      : joinedConversationKey
        ? "Đang đồng bộ realtime"
        : "Đang kết nối phòng chat";

  return {
    messages,
    loading,
    sending,
    error,
    subtitle,
    sendMessage,
    setTyping,
    updateMessage,
    deleteMessage,
  };
}
