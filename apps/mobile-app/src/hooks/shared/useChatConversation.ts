import { useEffect, useState, useCallback, useRef } from 'react';
import { socketClient } from '../../lib/socket-client';
import { ApiClient } from '../../lib/api-client';
import { Platform } from 'react-native';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import type {
  MessageItem,
  ChatMessageCreatedEvent,
  ChatTypingStateEvent,
  ChatMessageAccepted,
  ChatMessageUpdatedEvent,
  ChatMessageDeletedEvent,
  ChatMessageDeletedAccepted,
  ChatMessageUpdatedAccepted,
} from '@urban/shared-types';
import { MESSAGE_TYPES, UPLOAD_TARGETS } from '@urban/shared-constants';

export const useChatConversation = (conversationId: string, currentUser?: any) => {
  const [messages, setMessages] = useState<any[]>([]);
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

    const fetchJoin = async () => {
      try {
        await socketClient.connect();

        const response = await socketClient.emitWithAck<{ conversationKey: string }>(
          CHAT_SOCKET_EVENTS.CONVERSATION_JOIN,
          { conversationId }
        );

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
      if (mounted && event?.message) {
        setMessages(prev => {
          // Xóa tin nhắn optimistic (trùng id/clientMessageId) và chèn lại tin thật để không bị trùng
          const filtered = prev.filter(m => m.id !== event.clientMessageId && m.clientMessageId !== event.clientMessageId && m.id !== event.message.id);
          return [...filtered, event.message];
        });
      }
    };

    // Server emits CHAT_SOCKET_EVENTS.TYPING_STATE = "typing.state"
    const onTypingState = (payload: ChatTypingStateEvent) => {
      if (mounted) {
        setTypingUsers(prev => ({
          ...prev,
          [payload.userId]: { fullName: payload.fullName, isTyping: payload.isTyping }
        }));
      }
    };

    // Server emits CHAT_SOCKET_EVENTS.MESSAGE_UPDATED = "message.updated"
    const onMessageUpdated = (event: ChatMessageUpdatedEvent) => {
      if (mounted && event?.message) {
        setMessages(prev => prev.map(m => m.id === event.message.id ? event.message : m));
      }
    };

    // Server emits CHAT_SOCKET_EVENTS.MESSAGE_DELETED = "message.deleted"
    const onMessageDeleted = (event: ChatMessageDeletedEvent) => {
      if (mounted && event?.messageId) {
        setMessages(prev => prev.map(m => 
          m.id === event.messageId ? { ...m, deletedAt: event.occurredAt } : m
        ));
      }
    };

    socketClient.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, onMessageCreated);
    socketClient.on(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, onMessageUpdated);
    socketClient.on(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, onMessageDeleted);
    socketClient.on(CHAT_SOCKET_EVENTS.TYPING_STATE, onTypingState);

    return () => {
      mounted = false;
      if (conversationKeyRef.current) {
        socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE, { conversationId }).catch(() => {});
        conversationKeyRef.current = null;
      }
      setIsReady(false);
      socketClient.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, onMessageCreated);
      socketClient.off(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, onMessageUpdated);
      socketClient.off(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, onMessageDeleted);
      socketClient.off(CHAT_SOCKET_EVENTS.TYPING_STATE, onTypingState);
    };
  }, [conversationId]);

  // ── 3. Send message ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    content: string,
    clientMessageId: string,
    type: string = 'TEXT',
    attachmentUrl?: string,
    replyTo?: string,
  ) => {
    if (!isReady || !conversationId) return;

    // Optimistic UI Update: Hiển thị ngay lên màn hình
    if (currentUser) {
      const optimisticMsg = {
        id: clientMessageId,
        messageId: clientMessageId,
        senderId: currentUser.id || currentUser.sub,
        senderName: currentUser.name || currentUser.fullName || 'Tôi',
        type: type,
        content,
        attachmentUrl,
        replyTo,
        sentAt: new Date().toISOString(),
        deletedAt: null,
        clientMessageId,
        isOptimistic: true // Cờ đánh dấu để tùy biến UI nếu muốn
      };
      setMessages(prev => [...prev, optimisticMsg]);
    }

    try {
      const ack = await socketClient.emitWithAck<ChatMessageAccepted>(
        CHAT_SOCKET_EVENTS.MESSAGE_SEND,
        { 
          conversationId, 
          content, 
          clientMessageId,
          type,
          attachmentUrl,
          replyTo,
        }
      );
    } catch (e) {
      console.error('[useChatConversation] Send message failed:', e);
      // Nếu gửi lỗi có thể xóa optimistic message
      setMessages(prev => prev.filter(m => m.id !== clientMessageId));
    }
  }, [conversationId, isReady, currentUser]);

  // ── 3.1 Upload and Send Media ─────────────────────────────────────────────
  const sendMedia = useCallback(async (
    fileUri: string,
    fileName: string,
    mimeType: string,
    type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOC',
    replyTo?: string,
  ) => {
    if (!isReady || !conversationId) return;
    
    try {
      const formData = new FormData();
      
      // IMPORTANT: Append non-file fields BEFORE the file field for some backends (like Multer)
      formData.append('target', 'MESSAGE');
      formData.append('entityId', conversationId);

      if (Platform.OS === 'web') {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        formData.append('file', blob, fileName);
      } else {
        // @ts-ignore
        formData.append('file', {
          uri: fileUri,
          name: fileName,
          type: mimeType,
        });
      }

      // 2. Upload to API
      const uploadResponse = await ApiClient.upload<any>('/uploads/media', formData);

      if (!uploadResponse?.url) {
        throw new Error('Upload failed: No URL returned');
      }

      // 3. Send message with attachment
      await sendMessage(fileName, Date.now().toString(), type, uploadResponse.url, replyTo);
      
    } catch (e) {
      console.error('[useChatConversation] Media send failed:', e);
      throw e;
    }
  }, [conversationId, isReady, sendMessage]);

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

  // ── 6. Update/Delete Message ──────────────────────────────────────────────
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!isReady || !conversationId) return;
    try {
      const ack = await socketClient.emitWithAck<ChatMessageDeletedAccepted>(
        CHAT_SOCKET_EVENTS.MESSAGE_DELETE,
        { conversationId, messageId }
      );
    } catch (e) {
      console.error('[useChatConversation] Delete message failed:', e);
    }
  }, [conversationId, isReady]);

  const updateMessage = useCallback(async (messageId: string, content?: string, attachmentUrl?: string) => {
    if (!isReady || !conversationId) return;
    try {
      const ack = await socketClient.emitWithAck<ChatMessageUpdatedAccepted>(
        CHAT_SOCKET_EVENTS.MESSAGE_UPDATE,
        { conversationId, messageId, content, attachmentUrl }
      );
      console.log('[useChatConversation] Message update ack:', ack);
    } catch (e) {
      console.error('[useChatConversation] Update message failed:', e);
    }
  }, [conversationId, isReady]);

  return {
    messages,
    isLoadingHistory,
    typingUsers,
    isReady,
    sendMessage,
    sendMedia,
    sendTyping,
    markRead,
    deleteMessage,
    updateMessage,
  };
};
