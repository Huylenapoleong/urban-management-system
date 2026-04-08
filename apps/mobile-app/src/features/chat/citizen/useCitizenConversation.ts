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
      setError("Phien dang nhap khong hop le. Vui long dang nhap lai.");
      disconnectChatSocket();
      return false;
    }

    try {
      const claims = jwtDecode<JwtClaims>(token);

      if (claims.sub !== currentUserId) {
        setError("Phien dang nhap chua dong bo. Vui long dang xuat va dang nhap lai.");
        disconnectChatSocket();
        return false;
      }
    } catch {
      setError("Khong the xac thuc phien dang nhap hien tai.");
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

          setMessages((prev) => upsertSortedMessage(prev, event.message));
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

  const sendMessage = useCallback(async (text: string) => {
    if (!conversationId || !text.trim() || sending) {
      return false;
    }

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
          content: buildTextMessagePayload(text),
          type: "TEXT",
          clientMessageId: `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
      );

      if (!response.success) {
        setError(response.error.message);
        return false;
      }

      setError(null);
      return true;
    } finally {
      setSending(false);
    }
  }, [conversationId, ensureSessionMatchesCurrentUser, sending]);

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
    ? `${typingUsers.join(", ")} dang go tin nhan`
    : activeParticipants > 0
      ? `${activeParticipants} nguoi dang online`
      : joinedConversationKey
        ? "Dang dong bo realtime"
        : "Dang ket noi phong chat";

  return {
    messages,
    loading,
    sending,
    error,
    subtitle,
    sendMessage,
    setTyping,
  };
}
