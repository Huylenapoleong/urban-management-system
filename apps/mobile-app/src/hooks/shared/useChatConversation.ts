import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { socketClient } from '../../lib/socket-client';
import { ApiClient } from '../../lib/api-client';
import { uploadMedia } from '../../services/api/upload.api';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import { queryKeys } from '@/services/query-keys';
import { useSkeletonQuery } from '@/components/skeleton/Skeleton';
import type {
  MessageItem,
  ChatMessageCreatedEvent,
  ChatTypingStateEvent,
  ChatPresenceSnapshotEvent,
  ChatPresenceUpdatedEvent,
  ChatPresenceState,
  ChatMessageAccepted,
  ChatMessageUpdatedEvent,
  ChatMessageDeletedEvent,
  ChatMessageDeletedAccepted,
  ChatMessageUpdatedAccepted,
  RecallMessageResult,
} from '@urban/shared-types';

const PRESENCE_OFFLINE_GRACE_MS = 120000;
const INITIAL_MESSAGES_LIMIT = 7;
const OLDER_MESSAGES_BATCH_LIMIT = 7;
const RECALL_FALLBACK_TEXT = 'Tin nhắn đã bị thu hồi';
const QUICK_REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '😡']);

type UseChatConversationOptions = {
  onConversationAccessDenied?: (payload: {
    conversationId: string;
    error: unknown;
  }) => void;
};

export type ChatMessageViewModel = {
  id: string;
  senderId: string;
  senderName: string;
  sentAt: string;
  sentAtMs: number;
  type: string;
  contentText: string;
  isDeletedOrRecalled: boolean;
  isOptimistic: boolean;
  reaction: { emoji: string; targetMessageId: string } | null;
} & Record<string, any>;

const parseMessageContent = (raw: unknown): string => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return '';
  }

  const normalizedRaw = raw.trim();
  if (normalizedRaw.startsWith('{') || normalizedRaw.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalizedRaw);
      const candidate =
        typeof parsed?.text === 'string'
          ? parsed.text
          : typeof parsed?.content === 'string'
            ? parsed.content
            : '';

      if (candidate) {
        if (/^message was recalled\.?$/i.test(candidate.trim())) {
          return RECALL_FALLBACK_TEXT;
        }
        return candidate;
      }
    } catch {
      // Ignore malformed payload and fallback to raw message.
    }
  }

  if (/^message was recalled\.?$/i.test(normalizedRaw)) {
    return RECALL_FALLBACK_TEXT;
  }

  return raw;
};

const parseReactionPayload = (item: any): { emoji: string; targetMessageId: string } | null => {
  if (!item || item.type !== 'TEXT' || item.deletedAt || item.recalledAt) {
    return null;
  }

  const rawContent = typeof item.content === 'string' ? item.content.trim() : '';
  const replyTarget = typeof item.replyTo === 'string' ? item.replyTo : undefined;

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed?.kind === 'REACTION' && typeof parsed?.emoji === 'string') {
      const targetMessageId =
        typeof parsed?.targetMessageId === 'string' && parsed.targetMessageId.trim()
          ? parsed.targetMessageId.trim()
          : replyTarget;

      if (targetMessageId) {
        return {
          emoji: parsed.emoji,
          targetMessageId,
        };
      }
    }
  } catch {
    if (replyTarget && QUICK_REACTION_EMOJIS.has(rawContent)) {
      return {
        emoji: rawContent,
        targetMessageId: replyTarget,
      };
    }
  }

  return null;
};

export const useChatConversation = (
  conversationId: string,
  currentUser?: any,
  options?: UseChatConversationOptions,
) => {
  const queryClient = useQueryClient();
  const messagesQueryKey = useMemo(() => queryKeys.messages(conversationId), [conversationId]);

  const looksLikeRecallText = useCallback((value: unknown) => {
    if (typeof value !== 'string') {
      return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === 'message was recalled.' || normalized === 'message was recalled' || normalized === RECALL_FALLBACK_TEXT.toLowerCase();
  }, [RECALL_FALLBACK_TEXT]);

  const normalizeRecalledMessage = useCallback((incoming: any, previous?: any) => {
    if (!incoming || typeof incoming !== 'object') {
      return incoming;
    }

    const incomingContent = typeof incoming.content === 'string' ? incoming.content : '';
    const previousContent = typeof previous?.content === 'string' ? previous.content : '';
    const wasAlreadyRecalled = Boolean(previous?.deletedAt || previous?.recalledAt || looksLikeRecallText(previousContent));
    const isIncomingRecalled = Boolean(incoming.deletedAt || incoming.recalledAt || looksLikeRecallText(incomingContent));

    const shouldForceRecall = isIncomingRecalled || wasAlreadyRecalled;

    if (!shouldForceRecall) {
      return {
        ...previous,
        ...incoming,
      };
    }

    const occurredAt = incoming.recalledAt || incoming.deletedAt || previous?.recalledAt || previous?.deletedAt || incoming.updatedAt || new Date().toISOString();
    const resolvedContent = incomingContent.trim() || previousContent.trim() || RECALL_FALLBACK_TEXT;

    return {
      ...previous,
      ...incoming,
      deletedAt: incoming.deletedAt || previous?.deletedAt || occurredAt,
      recalledAt: incoming.recalledAt || previous?.recalledAt || occurredAt,
      content: resolvedContent,
    };
  }, [looksLikeRecallText, RECALL_FALLBACK_TEXT]);

  const logRecallDebug = useCallback((stage: string, payload: Record<string, unknown>) => {
    if (!__DEV__) {
      return;
    }

    try {
      console.log('[ChatRecallDebug]', {
        stage,
        conversationId,
        ...payload,
      });
    } catch {
      // Keep debug logging fully safe.
    }
  }, [conversationId]);

  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Record<string, { fullName: string; isTyping: boolean }>>({});
  const [presenceByUser, setPresenceByUser] = useState<Record<string, any>>({});
    const normalizePresenceState = useCallback((presence?: ChatPresenceState): ChatPresenceState | null => {
      if (!presence || !presence.userId) {
        return null;
      }

      if (presence.isActive) {
        return {
          ...presence,
          lastSeenAt: undefined,
        };
      }

      return {
        ...presence,
        lastSeenAt: presence.lastSeenAt || (presence as any).occurredAt,
      };
    }, []);

  const mergePresenceWithGrace = useCallback((previous: any, incoming: ChatPresenceState) => {
    const normalizedIncoming = normalizePresenceState(incoming);
    if (!normalizedIncoming) {
      return previous || null;
    }

    if (normalizedIncoming.isActive === true) {
      return {
        ...normalizedIncoming,
        lastSeenAt: undefined,
        _pendingOfflineSinceMs: undefined,
        _pendingOfflinePresence: undefined,
      };
    }

    if (normalizedIncoming.isActive === false && previous?.isActive === true) {
      return {
        ...previous,
        _pendingOfflineSinceMs:
          typeof previous?._pendingOfflineSinceMs === 'number'
            ? previous._pendingOfflineSinceMs
            : Date.now(),
        _pendingOfflinePresence: {
          ...normalizedIncoming,
          lastSeenAt: normalizedIncoming.lastSeenAt || (normalizedIncoming as any).occurredAt,
        },
      };
    }

    return {
      ...normalizedIncoming,
      lastSeenAt: normalizedIncoming.lastSeenAt || (normalizedIncoming as any).occurredAt,
      _pendingOfflineSinceMs: undefined,
      _pendingOfflinePresence: undefined,
    };
  }, [normalizePresenceState]);

  const resolvePresenceWithGrace = useCallback((presence: any, nowMs = Date.now()) => {
    if (!presence) {
      return null;
    }

    if (
      presence.isActive === true &&
      typeof presence._pendingOfflineSinceMs === 'number' &&
      nowMs - presence._pendingOfflineSinceMs >= PRESENCE_OFFLINE_GRACE_MS
    ) {
      const pending = normalizePresenceState(presence._pendingOfflinePresence as ChatPresenceState);
      if (pending) {
        return {
          ...pending,
          isActive: false,
          lastSeenAt: pending.lastSeenAt || (pending as any).occurredAt,
        };
      }
    }

    return presence;
  }, [normalizePresenceState]);

  const conversationKeyRef = useRef<string | null>(null);
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typingEmitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef<any[]>([]);
  const [isReady, setIsReady] = useState(false);
  const currentUserId = currentUser?.id || currentUser?.sub;
  const accessDeniedHandledRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const isDmConversation = useCallback((value: string) => /^dm:|^DM#/i.test(value), []);

  const shouldRetryDmForbidden = useCallback(
    (error: unknown) => {
      if (!isDmConversation(conversationId)) {
        return false;
      }

      const payload = error as any;
      const statusCode = payload?.statusCode ?? payload?.status ?? payload?.error?.statusCode;
      const code = String(payload?.code ?? payload?.error?.code ?? '').toUpperCase();
      const message = String(payload?.message ?? payload?.error?.message ?? '').toLowerCase();

      return (
        Number(statusCode) === 403 ||
        code.includes('CONVERSATION_JOIN_FAILED') ||
        message.includes('cannot access this conversation')
      );
    },
    [conversationId, isDmConversation],
  );

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    accessDeniedHandledRef.current = false;
  }, [conversationId]);

  const notifyAccessDenied = useCallback((error: unknown) => {
    if (accessDeniedHandledRef.current) {
      return;
    }

    if (!shouldRetryDmForbidden(error)) {
      return;
    }

    accessDeniedHandledRef.current = true;
    optionsRef.current?.onConversationAccessDenied?.({
      conversationId,
      error,
    });
  }, [conversationId, shouldRetryDmForbidden]);

  const wait = useCallback(async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }, []);

  const updateMessageCache = useCallback((updater: (previous: any[]) => any[]) => {
    setMessages((previous) => {
      const next = updater(previous);
      queryClient.setQueryData(messagesQueryKey, next);
      return next;
    });
  }, [messagesQueryKey, queryClient]);

  const replaceMessageCache = useCallback((next: any[]) => {
    queryClient.setQueryData(messagesQueryKey, next);
    setMessages(next);
  }, [messagesQueryKey, queryClient]);

  const historyQuery = useQuery<any[]>({
    queryKey: messagesQueryKey,
    queryFn: async ({ signal }) => {
      const data = await ApiClient.get<MessageItem[]>(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        { limit: INITIAL_MESSAGES_LIMIT },
        { signal },
      );

      return Array.isArray(data)
        ? [...data].reverse().map((message) => normalizeRecalledMessage(message))
        : [];
    },
    enabled: Boolean(conversationId),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const { isFirstLoad: isFirstHistoryLoad } = useSkeletonQuery(historyQuery);

  // ── 1. Load message history from REST API ────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    setIsLoadingOlderMessages(false);
    setHasOlderMessages(true);

    if (historyQuery.error) {
      notifyAccessDenied(historyQuery.error);
      console.error('[useChatConversation] Failed to load history:', historyQuery.error);
      setIsLoadingHistory(false);
      return;
    }

    if (Array.isArray(historyQuery.data)) {
      replaceMessageCache(historyQuery.data);
      setIsLoadingHistory(false);
      setHasOlderMessages(historyQuery.data.length >= INITIAL_MESSAGES_LIMIT);
      return;
    }

    if (historyQuery.isLoading || historyQuery.isFetching || !historyQuery.data) {
      setIsLoadingHistory(isFirstHistoryLoad);
      return;
    }

    const cachedMessages = queryClient.getQueryData<any[]>(messagesQueryKey);
    if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {
      replaceMessageCache(cachedMessages.map((message) => normalizeRecalledMessage(message)));
      setIsLoadingHistory(false);
      setHasOlderMessages(cachedMessages.length >= INITIAL_MESSAGES_LIMIT);
      return;
    }

    setIsLoadingHistory(true);
    replaceMessageCache([]);
    let cancelled = false;
    const abortController = new AbortController();

    const loadHistory = async () => {
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const data = await ApiClient.get<MessageItem[]>(
            `/conversations/${encodeURIComponent(conversationId)}/messages`,
            { limit: INITIAL_MESSAGES_LIMIT },
            { signal: abortController.signal },
          );

          if (cancelled) {
            return;
          }

          // Backend returns newest-first, we keep local state oldest-first so newest stays at the bottom.
          const normalizedMessages = Array.isArray(data)
            ? [...data].reverse().map((message) => normalizeRecalledMessage(message))
            : [];
          replaceMessageCache(normalizedMessages);

          if (Array.isArray(data)) {
            setHasOlderMessages(data.length >= INITIAL_MESSAGES_LIMIT);
          } else {
            setHasOlderMessages(false);
          }
          return;
        } catch (err) {
          const canRetry = attempt < maxAttempts && shouldRetryDmForbidden(err);

          if (!canRetry) {
            notifyAccessDenied(err);
            console.error('[useChatConversation] Failed to load history:', err);
            return;
          }

          await wait(300 * attempt);
        }
      }
    };

    void loadHistory().finally(() => {
      if (!cancelled) {
        setIsLoadingHistory(false);
      }
    });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    conversationId,
    historyQuery.data,
    historyQuery.error,
    historyQuery.isFetching,
    historyQuery.isLoading,
    isFirstHistoryLoad,
    messagesQueryKey,
    normalizeRecalledMessage,
    notifyAccessDenied,
    queryClient,
    replaceMessageCache,
    shouldRetryDmForbidden,
    wait,
  ]);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || isLoadingHistory || isLoadingOlderMessages || !hasOlderMessages) {
      return;
    }

    const oldest = messages[0];
    const before = oldest?.sentAt || oldest?.createdAt;
    if (!before) {
      setHasOlderMessages(false);
      return;
    }

    setIsLoadingOlderMessages(true);
    try {
      const older = await ApiClient.get<MessageItem[]>(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          limit: OLDER_MESSAGES_BATCH_LIMIT,
          before,
        },
      );

      const incoming = Array.isArray(older)
        ? [...older].reverse().map((message) => normalizeRecalledMessage(message))
        : [];

      updateMessageCache((prev) => {
        if (!incoming.length) {
          return prev;
        }

        const existingIds = new Set(prev.map((item) => String(item?.id || '')));
        const prepend = incoming.filter((item) => !existingIds.has(String(item?.id || '')));
        if (!prepend.length) {
          return prev;
        }
        return [...prepend, ...prev];
      });

      setHasOlderMessages(incoming.length >= OLDER_MESSAGES_BATCH_LIMIT);
    } catch (error) {
      if (__DEV__) {
        console.log('[ChatPagination] load older failed', error);
      }
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [
    conversationId,
    hasOlderMessages,
    isLoadingHistory,
    isLoadingOlderMessages,
    messages,
    normalizeRecalledMessage,
    updateMessageCache,
  ]);

  // ── 2. Socket: join room + real-time listeners ────────────────────────────
  useEffect(() => {
    if (!conversationId) {
      console.warn('[useChatConversation] No conversationId provided');
      return;
    }

    let mounted = true;

    const fetchJoin = async () => {
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
          return;
        } catch (e) {
          const canRetry = attempt < maxAttempts && shouldRetryDmForbidden(e);

          if (!canRetry) {
            notifyAccessDenied(e);
            console.error('[useChatConversation] Failed to join conversation:', e);
            return;
          }

          await wait(300 * attempt);
        }
      }
    };

    const onSocketConnect = () => {
      if (!mounted) {
        return;
      }

      void fetchJoin();
    };

    const onSocketDisconnect = () => {
      if (!mounted) {
        return;
      }

      setIsReady(false);
    };

    socketClient.on('connect', onSocketConnect);
    socketClient.on('disconnect', onSocketDisconnect);

    void fetchJoin();

    // Server emits CHAT_SOCKET_EVENTS.MESSAGE_CREATED = "message.created"
    // with payload: ChatMessageCreatedEvent { message: MessageItem, ... }
    const onMessageCreated = (event: ChatMessageCreatedEvent) => {
      if (mounted && event?.message) {
        updateMessageCache(prev => {
          const next = prev.filter((message) => {
            if (message.id === event.message.id) {
              return false;
            }

            if (!event.clientMessageId) {
              return true;
            }

            return (
              message.id !== event.clientMessageId &&
              message.clientMessageId !== event.clientMessageId
            );
          });

          next.push(normalizeRecalledMessage(event.message));
          return next;
        });
      }
    };

    // Server emits CHAT_SOCKET_EVENTS.TYPING_STATE = "typing.state"
    const onTypingState = (payload: ChatTypingStateEvent) => {
      if (mounted) {
        if (!conversationKeyRef.current) {
          return;
        }

        if (payload.conversationKey !== conversationKeyRef.current) {
          return;
        }

        if (payload.userId === currentUserId) {
          return;
        }

        const currentTimeout = typingTimeoutsRef.current[payload.userId];
        if (currentTimeout) {
          clearTimeout(currentTimeout);
          delete typingTimeoutsRef.current[payload.userId];
        }

        setTypingUsers(prev => {
          if (!payload.isTyping) {
            const next = { ...prev };
            delete next[payload.userId];
            return next;
          }

          return {
            ...prev,
            [payload.userId]: { fullName: payload.fullName, isTyping: true }
          };
        });

        if (payload.isTyping) {
          typingTimeoutsRef.current[payload.userId] = setTimeout(() => {
            setTypingUsers(prev => {
              const next = { ...prev };
              delete next[payload.userId];
              return next;
            });
            delete typingTimeoutsRef.current[payload.userId];
          }, 3000);
        }
      }
    };

    const onPresenceSnapshot = (event: ChatPresenceSnapshotEvent) => {
      if (!mounted || !conversationKeyRef.current) {
        return;
      }

      if (event.conversationKey !== conversationKeyRef.current) {
        return;
      }

      const nextPresenceRaw = Object.fromEntries(
        (event.participants || [])
          .map((item) => normalizePresenceState(item))
          .filter((item): item is ChatPresenceState => Boolean(item))
          .map((item) => [String(item.userId), item] as const),
      );

      setPresenceByUser((prev) => {
        const merged: Record<string, any> = {};
        for (const [userId, rawPresence] of Object.entries(nextPresenceRaw)) {
          merged[userId] = mergePresenceWithGrace(prev[userId], rawPresence as ChatPresenceState);
        }
        return merged;
      });
    };

    const onPresenceUpdated = (event: ChatPresenceUpdatedEvent) => {
      if (!mounted || !conversationKeyRef.current) {
        return;
      }

      if (event.conversationKey !== conversationKeyRef.current || !event.presence?.userId) {
        return;
      }

      const normalizedPresence = normalizePresenceState(event.presence);
      if (!normalizedPresence) {
        return;
      }

      setPresenceByUser((prev) => ({
        ...prev,
        [String(normalizedPresence.userId)]: mergePresenceWithGrace(
          prev[String(normalizedPresence.userId)],
          normalizedPresence,
        ),
      }));
    };

    // Server emits CHAT_SOCKET_EVENTS.MESSAGE_UPDATED = "message.updated"
    const onMessageUpdated = (event: ChatMessageUpdatedEvent) => {
      if (mounted && event?.message) {
        updateMessageCache((prev) =>
          prev.map((m) => {
            if (m.id !== event.message.id) {
              return m;
            }

            const normalized = normalizeRecalledMessage(event.message, m);

            logRecallDebug('message.updated', {
              messageId: event.message.id,
              incomingDeletedAt: (event.message as any)?.deletedAt || null,
              incomingRecalledAt: (event.message as any)?.recalledAt || null,
              previousDeletedAt: (m as any)?.deletedAt || null,
              previousRecalledAt: (m as any)?.recalledAt || null,
              nextDeletedAt: (normalized as any)?.deletedAt || null,
              nextRecalledAt: (normalized as any)?.recalledAt || null,
              incomingContent: String((event.message as any)?.content || '').slice(0, 80),
              nextContent: String((normalized as any)?.content || '').slice(0, 80),
            });

            return normalized;
          }),
        );
      }
    };

    // Server emits CHAT_SOCKET_EVENTS.MESSAGE_DELETED = "message.deleted"
    const onMessageDeleted = (event: ChatMessageDeletedEvent) => {
      if (mounted && event?.messageId) {
        const occurredAt = event.occurredAt || new Date().toISOString();
        updateMessageCache((prev) =>
          prev.map((m) =>
            m.id === event.messageId
              ? normalizeRecalledMessage(
                  {
                    ...m,
                    deletedAt: occurredAt,
                    recalledAt: (m as any).recalledAt || occurredAt,
                    content: m.content || RECALL_FALLBACK_TEXT,
                  },
                  m,
                )
              : m,
          ),
        );

        logRecallDebug('message.deleted', {
          messageId: event.messageId,
          occurredAt,
        });
      }
    };

    socketClient.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, onMessageCreated);
    socketClient.on(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, onMessageUpdated);
    socketClient.on(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, onMessageDeleted);
    socketClient.on(CHAT_SOCKET_EVENTS.TYPING_STATE, onTypingState);
    socketClient.on(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, onPresenceSnapshot);
    socketClient.on(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, onPresenceUpdated);

    return () => {
      mounted = false;
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      typingTimeoutsRef.current = {};
      conversationKeyRef.current = null;
      setIsReady(false);
      socketClient.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, onMessageCreated);
      socketClient.off(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, onMessageUpdated);
      socketClient.off(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, onMessageDeleted);
      socketClient.off(CHAT_SOCKET_EVENTS.TYPING_STATE, onTypingState);
      socketClient.off(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, onPresenceSnapshot);
      socketClient.off(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, onPresenceUpdated);
      socketClient.off('connect', onSocketConnect);
      socketClient.off('disconnect', onSocketDisconnect);
    };
  }, [
    conversationId,
    currentUserId,
    logRecallDebug,
    mergePresenceWithGrace,
    normalizePresenceState,
    normalizeRecalledMessage,
    notifyAccessDenied,
    shouldRetryDmForbidden,
    updateMessageCache,
    wait,
  ]);

  // ── 3. Send message ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    content: string,
    clientMessageId: string,
    type: string = 'TEXT',
    attachmentUrl?: string,
    replyTo?: string,
    attachmentKey?: string,
  ) => {
    if (!conversationId) return;

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
        attachmentKey,
        replyTo,
        sentAt: new Date().toISOString(),
        deletedAt: null,
        clientMessageId,
        isOptimistic: true,
        sendStatus: 'sending',
      };
      updateMessageCache(prev => [...prev, optimisticMsg]);
    }

    try {
      const payload = {
        content,
        clientMessageId,
        type,
        ...(attachmentKey ? { attachmentKey } : attachmentUrl ? { attachmentUrl } : {}),
        ...(replyTo ? { replyTo } : {}),
      };

      if (isReady) {
        try {
          await socketClient.emitWithAck<ChatMessageAccepted>(
            CHAT_SOCKET_EVENTS.MESSAGE_SEND,
            {
              conversationId,
              ...payload,
            }
          );
          return;
        } catch (socketError) {
          if (__DEV__) {
            console.log('[ChatFallback] socket send failed, fallback to REST', {
              conversationId,
              clientMessageId,
              type,
              error: String((socketError as any)?.message || socketError || 'unknown'),
            });
          }
        }
      }

      // Fallback for mobile when realtime socket is not ready: send via REST.
      const created = await ApiClient.post<any>(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        payload,
      );

      if (created?.id || created?.messageId) {
        updateMessageCache((prev) => {
          const withoutOptimistic = prev.filter((m) => m.id !== clientMessageId && m.clientMessageId !== clientMessageId);
          return [...withoutOptimistic, normalizeRecalledMessage(created)];
        });
      }
    } catch (e) {
      console.error('[useChatConversation] Send message failed:', e);
      updateMessageCache(prev =>
        prev.map((message) =>
          message.id === clientMessageId || message.clientMessageId === clientMessageId
            ? {
                ...message,
                isOptimistic: false,
                sendStatus: 'failed',
                errorMessage: (e as Error)?.message || 'Send failed',
              }
            : message,
        ),
      );
    }
  }, [
    conversationId,
    currentUser,
    isReady,
    normalizeRecalledMessage,
    updateMessageCache,
  ]);

  const createClientMessageId = useCallback(
    () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  // Fetch only once when opening conversation if realtime socket is not ready.
  useEffect(() => {
    if (!conversationId || isReady) {
      return;
    }

    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const latestMessages = messagesRef.current;
        const latest = latestMessages[latestMessages.length - 1];
        const after = latest?.sentAt || latest?.createdAt;
        const data = await ApiClient.get<MessageItem[]>(
          `/conversations/${encodeURIComponent(conversationId)}/messages`,
          {
            limit: INITIAL_MESSAGES_LIMIT,
            ...(after ? { after } : {}),
          },
        );

        if (cancelled || !Array.isArray(data)) {
          return;
        }

        if (data.length === 0) {
          return;
        }

        updateMessageCache((prev) => {
          const map = new Map<string, any>(prev.map((item) => [String(item?.id || ''), item]));
          for (const message of data) {
            const key = String(message?.id || '');
            const normalized = normalizeRecalledMessage(message, map.get(key));
            map.set(key, normalized);
          }

          const sorted = Array.from(map.values()).sort((a, b) => {
            const at = Date.parse(String(a?.sentAt || a?.createdAt || 0));
            const bt = Date.parse(String(b?.sentAt || b?.createdAt || 0));
            if (Number.isNaN(at) || Number.isNaN(bt)) return 0;
            return at - bt;
          });
          return sorted;
        });
      } catch {
        // Ignore transient fetch errors when opening conversation.
      }
    };

    void fetchOnce();

    return () => {
      cancelled = true;
    };
  }, [conversationId, isReady, normalizeRecalledMessage, updateMessageCache]);

  // ── 3.1 Upload and Send Media ─────────────────────────────────────────────
  const sendMedia = useCallback(async (
    fileUri: string,
    fileName: string,
    mimeType: string,
    type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOC',
    replyTo?: string,
  ) => {
    if (!conversationId) return;
    
    try {
      // Use uploadMedia with proper /api prefix routing
      const uploadResponse = await uploadMedia({
        uri: fileUri,
        fileName,
        mimeType,
        target: 'MESSAGE',
        entityId: conversationId,
      });

      if (!uploadResponse?.url && !uploadResponse?.key) {
        throw new Error('Upload failed: No URL or key returned');
      }

      const attachmentUrl = uploadResponse.url || uploadResponse.key;
      const attachmentKey = uploadResponse.key || undefined;

      await sendMessage(fileName, createClientMessageId(), type, attachmentUrl, replyTo, attachmentKey);
      
    } catch (e) {
      console.error('[useChatConversation] Media send failed:', e);
      throw e;
    }
  }, [conversationId, sendMessage, createClientMessageId]);

  // ── 4. Typing indicator ───────────────────────────────────────────────────
  const sendTyping = useCallback((isTyping: boolean) => {
    if (!isReady || !conversationId) return;

    const socket = socketClient.socket;
    if (!socket || !socket.connected) return;

    const event = isTyping ? CHAT_SOCKET_EVENTS.TYPING_START : CHAT_SOCKET_EVENTS.TYPING_STOP;
    if (!isTyping) {
      if (typingEmitTimeoutRef.current) {
        clearTimeout(typingEmitTimeoutRef.current);
        typingEmitTimeoutRef.current = null;
      }
      socket.emit(event, { conversationId });
      return;
    }

    if (typingEmitTimeoutRef.current) {
      clearTimeout(typingEmitTimeoutRef.current);
    }

    // Throttle typing.start emissions to reduce socket pressure on mobile keyboards.
    typingEmitTimeoutRef.current = setTimeout(() => {
      socket.emit(event, { conversationId });
      typingEmitTimeoutRef.current = null;
    }, 220);
  }, [conversationId, isReady]);

  useEffect(() => {
    return () => {
      if (typingEmitTimeoutRef.current) {
        clearTimeout(typingEmitTimeoutRef.current);
        typingEmitTimeoutRef.current = null;
      }
    };
  }, []);

  // ── 5. Mark read ──────────────────────────────────────────────────────────
  const markRead = useCallback(() => {
    if (!isReady) return;
    socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CONVERSATION_READ, { conversationId }).catch(() => {});
  }, [conversationId, isReady]);

  // ── 6. Update/Delete Message ──────────────────────────────────────────────
  const recallMessage = useCallback(async (messageId: string) => {
    if (!isReady || !conversationId) return;
    try {
      const ack = await socketClient.emitWithAck<RecallMessageResult>(
        CHAT_SOCKET_EVENTS.MESSAGE_RECALL,
        { conversationId, messageId, scope: 'EVERYONE' }
      );

      logRecallDebug('message.recall.ack', {
        messageId,
        scope: (ack as any)?.scope || 'EVERYONE',
        recalledAt: (ack as any)?.recalledAt || null,
      });
    } catch (e) {
      logRecallDebug('message.recall.error', {
        messageId,
        error: String((e as any)?.message || e || 'unknown'),
      });
      console.error('[useChatConversation] Recall message failed:', e);
    }
  }, [conversationId, isReady, logRecallDebug]);

  const hideMessage = useCallback(async (messageId: string) => {
    if (!isReady || !conversationId) return;
    try {
      await socketClient.emitWithAck<RecallMessageResult>(
        CHAT_SOCKET_EVENTS.MESSAGE_RECALL,
        { conversationId, messageId, scope: 'SELF' }
      );

      // Hide only on current client timeline.
      updateMessageCache((prev) => prev.filter((message) => message.id !== messageId));
    } catch (e) {
      console.error('[useChatConversation] Hide message failed:', e);
      throw e;
    }
  }, [conversationId, isReady, updateMessageCache]);

  // Backward compatibility for existing callsites.
  const deleteMessage = recallMessage;

  const updateMessage = useCallback(async (messageId: string, content?: string, attachmentUrl?: string) => {
    if (!conversationId) return;

    const payload = { messageId, content, attachmentUrl };

    if (isReady) {
      try {
        const ack = await socketClient.emitWithAck<ChatMessageUpdatedAccepted>(
          CHAT_SOCKET_EVENTS.MESSAGE_UPDATE,
          { conversationId, ...payload }
        );
        if (__DEV__) {
          console.log('[useChatConversation] Message update ack:', ack);
        }
        return;
      } catch (socketError) {
        if (__DEV__) {
          console.log('[ChatFallback] socket update failed, fallback to REST', {
            conversationId,
            messageId,
            error: String((socketError as any)?.message || socketError || 'unknown'),
          });
        }
      }
    }

    try {
      await ApiClient.patch(
        `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
        { content, attachmentUrl },
      );
    } catch (e) {
      console.error('[useChatConversation] Update message failed:', e);
      throw e;
    }
  }, [conversationId, isReady]);

  const forwardMessage = useCallback(async (messageId: string, targetConversationIds: string[]) => {
    if (!conversationId) return;

    const conversationIds = [...new Set(targetConversationIds.map((id) => String(id).trim()).filter(Boolean))];
    if (!conversationIds.length) {
      throw new Error('Vui lòng chọn ít nhất một cuộc trò chuyện để chuyển tiếp.');
    }

    try {
      await ApiClient.post(
        `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/forward`,
        { conversationIds },
      );
    } catch (e) {
      console.error('[useChatConversation] Forward message failed:', e);
      throw e;
    }
  }, [conversationId]);

  const messageViewModels = useMemo<ChatMessageViewModel[]>(() => {
    return messages.map((message) => {
      const normalizedContent = parseMessageContent(message?.content);
      const reaction = parseReactionPayload(message);
      const sentAt = String(message?.sentAt || message?.createdAt || '');
      const sentAtMs = Number.isNaN(Date.parse(sentAt)) ? 0 : Date.parse(sentAt);

      return {
        ...message,
        id: String(message?.id || ''),
        senderId: String(message?.senderId || ''),
        senderName: String(message?.senderName || ''),
        type: String(message?.type || 'TEXT'),
        sentAt,
        sentAtMs,
        contentText: normalizedContent,
        isDeletedOrRecalled: Boolean(message?.deletedAt || message?.recalledAt),
        isOptimistic: Boolean(message?.isOptimistic),
        reaction,
      };
    });
  }, [messages]);

  const visibleMessageViewModels = useMemo(
    () => messageViewModels.filter((message) => !message.reaction),
    [messageViewModels],
  );

  const reactionSummaryByMessageId = useMemo(() => {
    const countersByTarget = new Map<string, Map<string, Set<string>>>();
    const latestByUserTarget = new Map<string, string>();

    for (const message of messageViewModels) {
      const reaction = message.reaction;
      if (!reaction) {
        continue;
      }

      const target = reaction.targetMessageId;
      const userId = String(message.senderId || message.id || 'unknown');
      const latestKey = `${target}::${userId}`;
      const previousEmoji = latestByUserTarget.get(latestKey);

      if (!countersByTarget.has(target)) {
        countersByTarget.set(target, new Map<string, Set<string>>());
      }
      const targetCounters = countersByTarget.get(target)!;

      if (previousEmoji) {
        const previousSet = targetCounters.get(previousEmoji);
        if (previousSet) {
          previousSet.delete(userId);
          if (previousSet.size === 0) {
            targetCounters.delete(previousEmoji);
          }
        }
      }

      if (!targetCounters.has(reaction.emoji)) {
        targetCounters.set(reaction.emoji, new Set<string>());
      }
      targetCounters.get(reaction.emoji)!.add(userId);
      latestByUserTarget.set(latestKey, reaction.emoji);
    }

    const summary: Record<string, Record<string, number>> = {};
    for (const [target, emojiMap] of countersByTarget.entries()) {
      const entry: Record<string, number> = {};
      for (const [emoji, users] of emojiMap.entries()) {
        if (users.size > 0) {
          entry[emoji] = users.size;
        }
      }

      if (Object.keys(entry).length > 0) {
        summary[target] = entry;
      }
    }

    return summary;
  }, [messageViewModels]);

  return {
    messages,
    messageViewModels,
    visibleMessageViewModels,
    reactionSummaryByMessageId,
    isLoadingHistory,
    typingUsers,
    presenceByUser: Object.fromEntries(
      Object.entries(presenceByUser).map(([userId, value]) => [userId, resolvePresenceWithGrace(value)]),
    ),
    isReady,
    sendMessage,
    sendMedia,
    sendTyping,
    markRead,
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    recallMessage,
    hideMessage,
    deleteMessage,
    updateMessage,
    forwardMessage,
  };
};
