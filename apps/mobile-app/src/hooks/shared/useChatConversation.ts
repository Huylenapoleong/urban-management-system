import { useEffect, useState, useCallback, useRef } from 'react';
import { socketClient } from '../../lib/socket-client';
import { ApiClient } from '../../lib/api-client';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import type {
  MessageItem,
  ChatMessageCreatedEvent,
  ChatTypingStateEvent,
  ChatMessageAccepted,
} from '@urban/shared-types';

export const useChatConversation = (conversationId: string) => {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, { fullName: string; isTyping: boolean }>>({});
  const conversationKeyRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // ── 1. Load message history from REST API ────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    setIsLoadingHistory(true);
    setMessages([]);
    ApiClient.get<MessageItem[]>(`/conversations/${encodeURIComponent(conversationId)}/messages`, { limit: 50 })
      .then((data) => {
        console.log('[useChatConversation] History loaded:', data?.length, 'messages');
        // Backend returns newest-first, we reverse it to oldest-first so the newest appears at the bottom
        setMessages(Array.isArray(data) ? [...data].reverse() : []);
      })
      .catch((err) => {
        console.error('[useChatConversation] Failed to load history:', err);
      })
      .finally(() => setIsLoadingHistory(false));
  }, [conversationId]);

  // ── 2. Socket: join room + real-time listeners ────────────────────────────
  useEffect(() => {
    if (!conversationId) {
      console.warn('[useChatConversation] No conversationId provided');
      return;
    }

    let mounted = true;
    console.log('[useChatConversation] Socket effect for conversationId:', conversationId);

    const fetchJoin = async () => {
      try {
        console.log('[useChatConversation] Connecting socket...');
        await socketClient.connect();
        console.log('[useChatConversation] Socket connected, joining:', conversationId);

        const response = await socketClient.emitWithAck<{ conversationKey: string }>(
          CHAT_SOCKET_EVENTS.CONVERSATION_JOIN,
          { conversationId }
        );
        console.log('[useChatConversation] Join ack:', response);

        if (mounted) {
          conversationKeyRef.current = response.conversationKey;
          setIsReady(true);
        }
      } catch (e) {
        console.error('[useChatConversation] Failed to join conversation:', e);
      }
    };

    fetchJoin();

    // Server emits CHAT_SOCKET_EVENTS.MESSAGE_CREATED = "message.created"
    // with payload: ChatMessageCreatedEvent { message: MessageItem, ... }
    const onMessageCreated = (event: ChatMessageCreatedEvent) => {
      console.log('[useChatConversation] message.created event:', event);
      if (mounted && event?.message) {
        setMessages(prev => {
          // Deduplicate by id (in case optimistic update already added it)
          if (prev.some(m => m.id === event.message.id)) return prev;
          return [...prev, event.message];
        });
      }
    };

    // Server emits CHAT_SOCKET_EVENTS.TYPING_STATE = "typing.state"
    const onTypingState = (payload: ChatTypingStateEvent) => {
      console.log('[useChatConversation] typing.state event:', payload);
      if (mounted) {
        setTypingUsers(prev => ({
          ...prev,
          [payload.userId]: { fullName: payload.fullName, isTyping: payload.isTyping }
        }));
      }
    };

    socketClient.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, onMessageCreated);
    socketClient.on(CHAT_SOCKET_EVENTS.TYPING_STATE, onTypingState);

    return () => {
      mounted = false;
      console.log('[useChatConversation] Cleanup for:', conversationId);
      if (conversationKeyRef.current) {
        socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE, { conversationId }).catch(() => {});
        conversationKeyRef.current = null;
      }
      setIsReady(false);
      socketClient.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, onMessageCreated);
      socketClient.off(CHAT_SOCKET_EVENTS.TYPING_STATE, onTypingState);
    };
  }, [conversationId]);

  // ── 3. Send message ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content: string, clientMessageId: string) => {
    if (!isReady || !conversationId) return;
    try {
      const ack = await socketClient.emitWithAck<ChatMessageAccepted>(
        CHAT_SOCKET_EVENTS.MESSAGE_SEND,
        { conversationId, content, clientMessageId }
      );
      console.log('[useChatConversation] Message send ack:', ack);
      // Note: server will broadcast MESSAGE_CREATED event to all room members
      // (including sender), so onMessageCreated will handle adding it to state.
    } catch (e) {
      console.error('[useChatConversation] Send message failed:', e);
    }
  }, [conversationId, isReady]);

  // ── 4. Typing indicator ───────────────────────────────────────────────────
  const sendTyping = useCallback((isTyping: boolean) => {
    if (!isReady) return;
    const event = isTyping ? CHAT_SOCKET_EVENTS.TYPING_START : CHAT_SOCKET_EVENTS.TYPING_STOP;
    socketClient.emitWithAck(event, { conversationId }).catch(() => {});
  }, [conversationId, isReady]);

  // ── 5. Mark read ──────────────────────────────────────────────────────────
  const markRead = useCallback(() => {
    if (!isReady) return;
    socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CONVERSATION_READ, { conversationId }).catch(() => {});
  }, [conversationId, isReady]);

  return {
    messages,
    isLoadingHistory,
    typingUsers,
    isReady,
    sendMessage,
    sendTyping,
    markRead,
  };
};
