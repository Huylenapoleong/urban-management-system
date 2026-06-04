import { socketClient } from "@/lib/socket-client";
import {
  clearConversationListCache,
  deleteMessage,
  forwardMessage,
  listConversations,
  listMessagesPage,
  markConversationAsRead,
  sendMessage,
  updateMessage,
  type CursorPage,
  type RecallScope,
  type SendMessageInput,
} from "@/services/conversation.api";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type {
  ChatConversationRemovedEvent,
  ChatConversationUpdatedEvent,
  ChatMessageCreatedEvent,
  ChatTypingStateEvent,
  ConversationSummary,
  MessageItem,
} from "@urban/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ConversationRemovedPayload =
  | ChatConversationRemovedEvent
  | {
      conversationId?: string;
      data?: {
        conversationId?: string;
      };
    };

type ConversationUpdatedPayload =
  | ChatConversationUpdatedEvent
  | {
      conversationId?: string;
      summary?: ConversationSummary;
      reason?: ChatConversationUpdatedEvent["reason"];
      data?: {
        conversationId?: string;
        summary?: ConversationSummary;
        reason?: ChatConversationUpdatedEvent["reason"];
      };
    };

function extractConversationId(
  payload?: ConversationRemovedPayload | ConversationUpdatedPayload | null,
): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload.conversationId === "string" && payload.conversationId) {
    return payload.conversationId;
  }

  if ("data" in payload && payload.data?.conversationId) {
    return payload.data.conversationId;
  }

  return undefined;
}

function extractConversationUpdate(
  payload?: ConversationUpdatedPayload | null,
): {
  conversationId?: string;
  reason?: ChatConversationUpdatedEvent["reason"];
  summary?: ConversationSummary;
} {
  if (!payload) {
    return {};
  }

  const summary =
    "summary" in payload && payload.summary
      ? payload.summary
      : "data" in payload
        ? payload.data?.summary
        : undefined;
  const reason =
    "reason" in payload && payload.reason
      ? payload.reason
      : "data" in payload
        ? payload.data?.reason
        : undefined;

  return {
    conversationId: extractConversationId(payload) || summary?.conversationId,
    reason,
    summary,
  };
}

function normalizeConversationToken(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

function conversationKeyBelongsToConversation(
  conversationId: string,
  eventConversationKey?: string,
): boolean {
  const active = conversationId.trim();
  const eventKey = eventConversationKey?.trim();

  if (!active || !eventKey) {
    return false;
  }

  const normalizedActive = normalizeConversationToken(active);
  const normalizedEventKey = normalizeConversationToken(eventKey);

  if (normalizedActive === normalizedEventKey) {
    return true;
  }

  if (/^group:/i.test(active)) {
    const groupId = active.replace(/^group:/i, "").trim();
    return normalizeConversationToken(`GRP#${groupId}`) === normalizedEventKey;
  }

  if (/^grp#/i.test(active)) {
    const groupId = active.replace(/^grp#/i, "").trim();
    return normalizeConversationToken(`group:${groupId}`) === normalizedEventKey;
  }

  if (/^dm:/i.test(active)) {
    const peerId = normalizeConversationToken(active.replace(/^dm:/i, ""));
    const dmParticipants = normalizedEventKey.startsWith("dm#")
      ? normalizedEventKey.replace(/^dm#/i, "").split("#")
      : [];
    return Boolean(peerId && dmParticipants.includes(peerId));
  }

  if (/^dm#/i.test(active)) {
    const activeParticipants = normalizedActive.replace(/^dm#/i, "").split("#");
    const eventParticipants = normalizedEventKey.startsWith("dm#")
      ? normalizedEventKey.replace(/^dm#/i, "").split("#")
      : [];
    return (
      activeParticipants.length > 0 &&
      activeParticipants.every((participant) =>
        eventParticipants.includes(participant),
      )
    );
  }

  return normalizedEventKey === normalizeConversationToken(`GRP#${active}`);
}

function isMessageItem(value: unknown): value is MessageItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

type ConversationUpdateReason = ChatConversationUpdatedEvent["reason"];

type ConversationActivitySnapshot = Pick<
  ConversationSummary,
  "lastMessagePreview" | "lastSenderName" | "unreadCount" | "updatedAt"
>;

const conversationActivitySnapshots = new Map<
  string,
  ConversationActivitySnapshot
>();

function getConversationTimestamp(value?: string | null): number {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareConversationSummaries(
  left: ConversationSummary,
  right: ConversationSummary,
): number {
  const pinnedSort = Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned));
  if (pinnedSort !== 0) {
    return pinnedSort;
  }

  const timeSort =
    getConversationTimestamp(right.updatedAt) -
    getConversationTimestamp(left.updatedAt);
  if (timeSort !== 0) {
    return timeSort;
  }

  return left.conversationId.localeCompare(right.conversationId);
}

function isMessageActivityReason(
  reason?: ConversationUpdateReason,
): boolean {
  return (
    reason === "message.created" ||
    reason === "message.updated" ||
    reason === "message.deleted" ||
    reason === "conversation.history.cleared"
  );
}

function stabilizeConversationActivity(
  summary: ConversationSummary,
  reason?: ConversationUpdateReason,
): ConversationSummary {
  const previous = conversationActivitySnapshots.get(summary.conversationId);
  let activityAt = summary.updatedAt;

  if (previous && !isMessageActivityReason(reason)) {
    const previewChanged =
      previous.lastMessagePreview !== summary.lastMessagePreview ||
      previous.lastSenderName !== summary.lastSenderName;
    const unreadIncreased = summary.unreadCount > previous.unreadCount;
    const movedToOlderMessage =
      getConversationTimestamp(summary.updatedAt) <
      getConversationTimestamp(previous.updatedAt);

    if (!previewChanged && !unreadIncreased && !movedToOlderMessage) {
      activityAt = previous.updatedAt;
    }
  }

  const normalized =
    activityAt === summary.updatedAt ? summary : { ...summary, updatedAt: activityAt };

  conversationActivitySnapshots.set(summary.conversationId, {
    lastMessagePreview: normalized.lastMessagePreview,
    lastSenderName: normalized.lastSenderName,
    unreadCount: normalized.unreadCount,
    updatedAt: normalized.updatedAt,
  });

  return normalized;
}

function normalizeConversationList(
  conversations: ConversationSummary[],
): ConversationSummary[] {
  return conversations
    .map((conversation) => stabilizeConversationActivity(conversation))
    .sort(compareConversationSummaries);
}

export function useConversationList(searchTerm?: string) {
  return useQuery({
    queryKey: ["conversations", searchTerm?.trim() ?? ""],
    queryFn: async () =>
      normalizeConversationList(await listConversations(searchTerm)),
    staleTime: 10 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

export function useConversationRealtimeBridge(
  conversations: ConversationSummary[] = [],
) {
  const queryClient = useQueryClient();
  const joinedConversationIdsRef = useRef<Set<string>>(new Set());
  const lastConversationRefreshAtRef = useRef(0);
  const scheduledConversationRefreshRef = useRef<number | null>(null);
  const conversationIds = useMemo(
    () =>
      conversations
        .map((item) => item.conversationId)
        .filter((conversationId): conversationId is string =>
          Boolean(conversationId),
        ),
    [conversations],
  );

  const scheduleConversationsRefresh = useCallback(() => {
    const minIntervalMs = 1200;
    const now = Date.now();
    const elapsed = now - lastConversationRefreshAtRef.current;

    if (elapsed >= minIntervalMs) {
      lastConversationRefreshAtRef.current = now;
      clearConversationListCache();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      return;
    }

    if (scheduledConversationRefreshRef.current !== null) {
      return;
    }

    const waitMs = Math.max(0, minIntervalMs - elapsed);
    scheduledConversationRefreshRef.current = window.setTimeout(() => {
      scheduledConversationRefreshRef.current = null;
      lastConversationRefreshAtRef.current = Date.now();
      clearConversationListCache();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }, waitMs);
  }, [queryClient]);

  useEffect(() => {
    const handleNewMessage = (payload: ChatMessageCreatedEvent | MessageItem) => {
      const summary = "summary" in payload ? payload.summary : undefined;

      if (summary) {
        queryClient.setQueriesData(
          { queryKey: ["conversations"] },
          (oldData: unknown) => {
            if (!Array.isArray(oldData)) {
              return oldData;
            }

            const normalizedSummary = stabilizeConversationActivity(
              summary,
              "message.created",
            );
            let didUpdate = false;
            const next = (oldData as ConversationSummary[]).map((item) => {
              if (item.conversationId !== normalizedSummary.conversationId) {
                return item;
              }

              didUpdate = true;
              return normalizedSummary;
            });

            return normalizeConversationList(
              didUpdate ? next : [normalizedSummary, ...next],
            );
          },
        );
        return;
      }

      scheduleConversationsRefresh();
    };

    const handleConversationRemoved = (payload: ConversationRemovedPayload) => {
      const removedConversationId = extractConversationId(payload);
      clearConversationListCache();
      if (removedConversationId) {
        joinedConversationIdsRef.current.delete(removedConversationId);
        queryClient.setQueriesData(
          { queryKey: ["conversations"] },
          (oldData: unknown) =>
            Array.isArray(oldData)
              ? oldData.filter(
                  (item) =>
                    (item as ConversationSummary).conversationId !==
                    removedConversationId,
                )
              : oldData,
        );
        queryClient.removeQueries({
          queryKey: ["messages", removedConversationId],
        });
      }
      scheduleConversationsRefresh();
    };

    const handleConversationUpdated = (payload: ConversationUpdatedPayload) => {
      const { conversationId, reason, summary } =
        extractConversationUpdate(payload);
      if (!conversationId || !summary) {
        clearConversationListCache();
        scheduleConversationsRefresh();
        return;
      }

      queryClient.setQueriesData(
        { queryKey: ["conversations"] },
        (oldData: unknown) => {
          if (!Array.isArray(oldData)) {
            return oldData;
          }

          const normalizedSummary = stabilizeConversationActivity(
            summary,
            reason,
          );
          let didUpdate = false;
          const next = (oldData as ConversationSummary[]).map((item) => {
            if (item.conversationId !== normalizedSummary.conversationId) {
              return item;
            }

            didUpdate = true;
            return normalizedSummary;
          });

          return normalizeConversationList(
            didUpdate ? next : [normalizedSummary, ...next],
          );
        },
      );
    };

    const handleSocketConnect = () => {
      joinedConversationIdsRef.current.clear();
      clearConversationListCache();
      scheduleConversationsRefresh();
    };

    socketClient.socket?.on(
      CHAT_SOCKET_EVENTS.MESSAGE_CREATED,
      handleNewMessage,
    );
    socketClient.socket?.on(
      CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED,
      handleConversationRemoved,
    );
    socketClient.socket?.on(
      CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED,
      handleConversationUpdated,
    );
    socketClient.socket?.on("connect", handleSocketConnect);

    return () => {
      if (scheduledConversationRefreshRef.current !== null) {
        window.clearTimeout(scheduledConversationRefreshRef.current);
        scheduledConversationRefreshRef.current = null;
      }
      socketClient.socket?.off(
        CHAT_SOCKET_EVENTS.MESSAGE_CREATED,
        handleNewMessage,
      );
      socketClient.socket?.off(
        CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED,
        handleConversationRemoved,
      );
      socketClient.socket?.off(
        CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED,
        handleConversationUpdated,
      );
      socketClient.socket?.off("connect", handleSocketConnect);
    };
  }, [queryClient, scheduleConversationsRefresh]);

  useEffect(() => {
    if (conversationIds.length === 0) {
      return;
    }

    const joinKnownConversations = async () => {
      try {
        await socketClient.connect();
      } catch {
        return;
      }

      for (const conversationId of conversationIds) {
        if (joinedConversationIdsRef.current.has(conversationId)) {
          continue;
        }

        try {
          await socketClient.safeEmitValidated(
            CHAT_SOCKET_EVENTS.CONVERSATION_JOIN,
            {
              conversationId,
            },
          );
          joinedConversationIdsRef.current.add(conversationId);
        } catch {
          // Keep silent here; room join will be retried on reconnect or next refresh.
        }
      }
    };

    void joinKnownConversations();
  }, [conversationIds]);
}

export function useConversations(searchTerm?: string) {
  return useConversationList(searchTerm);
}

export function useMessages(conversationId?: string, searchTerm?: string, messageType?: string) {
  const queryClient = useQueryClient();
  const [typingUsersByConversation, setTypingUsersByConversation] = useState<
    Record<string, Record<string, ChatTypingStateEvent>>
  >({});
  const messageQueryKey = useMemo(
    () => ["messages", conversationId, searchTerm?.trim() || "", messageType || ""] as const,
    [conversationId, searchTerm, messageType],
  );
  const messageRefreshTimerRef = useRef<number | null>(null);
  const conversationRefreshTimerRef = useRef<number | null>(null);
  const typingExpiryTimersRef = useRef<Record<string, number>>({});
  const typingUsers = conversationId
    ? (typingUsersByConversation[conversationId] ?? {})
    : {};

  const clearTypingExpiryTimer = useCallback((typingKey: string) => {
    const timerId = typingExpiryTimersRef.current[typingKey];
    if (timerId === undefined) {
      return;
    }

    window.clearTimeout(timerId);
    delete typingExpiryTimersRef.current[typingKey];
  }, []);

  const clearConversationTypingState = useCallback(
    (targetConversationId: string) => {
      const prefix = `${targetConversationId}::`;
      Object.keys(typingExpiryTimersRef.current)
        .filter((typingKey) => typingKey.startsWith(prefix))
        .forEach(clearTypingExpiryTimer);

      setTypingUsersByConversation((prev) => {
        if (!prev[targetConversationId]) {
          return prev;
        }

        const next = { ...prev };
        delete next[targetConversationId];
        return next;
      });
    },
    [clearTypingExpiryTimer],
  );

  const upsertMessageInCache = useCallback(
    (message: MessageItem) => {
      queryClient.setQueryData<InfiniteData<CursorPage<MessageItem>>>(
        messageQueryKey,
        (oldData) => {
          if (!oldData || oldData.pages.length === 0) {
            return {
              pages: [{ items: [message], nextCursor: undefined }],
              pageParams: [undefined],
            };
          }

          // If message already exists, update it
          const exists = oldData.pages.some((page) =>
            page.items.some((msg) => msg.id === message.id),
          );

          if (exists) {
            return {
              ...oldData,
              pages: oldData.pages.map((page) => ({
                ...page,
                items: page.items.map((msg) =>
                  msg.id === message.id ? message : msg,
                ),
              })),
            };
          }

          const [firstPage, ...restPages] = oldData.pages;
          return {
            ...oldData,
            pages: [
              { ...firstPage, items: [message, ...firstPage.items] },
              ...restPages,
            ],
          };
        },
      );
    },
    [messageQueryKey, queryClient],
  );

  const scheduleMessageRefresh = useCallback(() => {
    if (messageRefreshTimerRef.current !== null) {
      window.clearTimeout(messageRefreshTimerRef.current);
    }

    messageRefreshTimerRef.current = window.setTimeout(() => {
      messageRefreshTimerRef.current = null;
      queryClient.invalidateQueries({ queryKey: messageQueryKey });
    }, 500);
  }, [messageQueryKey, queryClient]);

  const scheduleConversationsRefresh = useCallback(() => {
    if (conversationRefreshTimerRef.current !== null) {
      window.clearTimeout(conversationRefreshTimerRef.current);
    }

    conversationRefreshTimerRef.current = window.setTimeout(() => {
      conversationRefreshTimerRef.current = null;
      clearConversationListCache();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }, 700);
  }, [queryClient]);

  const query = useInfiniteQuery({
    queryKey: messageQueryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listMessagesPage(conversationId!, {
        limit: 40,
        cursor: pageParam,
        q: searchTerm?.trim(),
        type: messageType,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: !!conversationId,
    staleTime: 15 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const messages = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  useEffect(() => {
    if (!conversationId) return;

    const joinRoom = async () => {
      try {
        await socketClient.connect();
        // Fire & forget join event
        socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CONVERSATION_JOIN, {
          conversationId,
        });
      } catch (err) {
        console.error("Failed to join chat room", err);
      }
    };
    joinRoom();

    const handleTypingState = (payload: ChatTypingStateEvent) => {
      if (
        !payload?.userId ||
        !conversationKeyBelongsToConversation(
          conversationId,
          payload.conversationKey,
        )
      ) {
        return;
      }

      const typingKey = `${conversationId}::${payload.userId}`;
      clearTypingExpiryTimer(typingKey);

      setTypingUsersByConversation((prev) => {
        const currentTypingUsers = prev[conversationId] ?? {};
        if (!payload.isTyping) {
          if (!currentTypingUsers[payload.userId]) {
            return prev;
          }

          const nextTypingUsers = { ...currentTypingUsers };
          delete nextTypingUsers[payload.userId];

          return {
            ...prev,
            [conversationId]: nextTypingUsers,
          };
        }

        return {
          ...prev,
          [conversationId]: {
            ...currentTypingUsers,
            [payload.userId]: payload,
          },
        };
      });

      if (payload.isTyping) {
        typingExpiryTimersRef.current[typingKey] = window.setTimeout(() => {
          delete typingExpiryTimersRef.current[typingKey];
          setTypingUsersByConversation((prev) => {
            const currentTypingUsers = prev[conversationId] ?? {};
            if (!currentTypingUsers[payload.userId]) {
              return prev;
            }

            const nextTypingUsers = { ...currentTypingUsers };
            delete nextTypingUsers[payload.userId];

            return {
              ...prev,
              [conversationId]: nextTypingUsers,
            };
          });
        }, 4500);
      }
    };

    const handleMessageCreated = (
      payload: ChatMessageCreatedEvent | MessageItem,
    ) => {
      const newMsg = "message" in payload ? payload.message : payload;
      if (newMsg?.conversationId === conversationId) {
        upsertMessageInCache(newMsg);
        
        // When a system message arrives (e.g. alias change), refresh aliases for all participants
        if (newMsg.type === "SYSTEM") {
          queryClient.invalidateQueries({
            queryKey: ["conversation-aliases", conversationId],
          });
        }
      }
    };

    const handleMessageUpdated = (payload: unknown) => {
      const updatedMsg = isMessageItem(payload)
        ? payload
        : typeof payload === "object" && payload !== null
          ? isMessageItem((payload as { message?: unknown }).message)
            ? (payload as { message: MessageItem }).message
            : isMessageItem((payload as { data?: unknown }).data)
              ? (payload as { data: MessageItem }).data
              : undefined
          : undefined;

      if (updatedMsg?.conversationId === conversationId) {
        upsertMessageInCache(updatedMsg);
      }
    };

    const handleConversationRemoved = (payload: ConversationRemovedPayload) => {
      const removedConversationId = extractConversationId(payload);
      if (!removedConversationId || removedConversationId !== conversationId) {
        return;
      }

      clearConversationListCache();
      setTypingUsersByConversation((prev) => {
        if (!prev[conversationId]) {
          return prev;
        }

        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
      queryClient.removeQueries({ queryKey: messageQueryKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const handleConversationUpdated = (payload: ConversationUpdatedPayload) => {
      const { conversationId: updatedConversationId, reason } =
        extractConversationUpdate(payload);
      if (!updatedConversationId || updatedConversationId !== conversationId) {
        return;
      }

      if (reason === "conversation.history.cleared") {
        clearConversationListCache();
        queryClient.setQueryData<InfiniteData<CursorPage<MessageItem>>>(
          messageQueryKey,
          (oldData) =>
            oldData
              ? {
                  ...oldData,
                  pages: oldData.pages.map((page) => ({
                    ...page,
                    items: [],
                  })),
                }
              : oldData,
        );
        scheduleConversationsRefresh();
        return;
      }

      if (reason === "message.deleted") {
        scheduleMessageRefresh();
      }
    };

    socketClient.socket?.on(
      CHAT_SOCKET_EVENTS.MESSAGE_CREATED,
      handleMessageCreated,
    );
    socketClient.socket?.on(
      CHAT_SOCKET_EVENTS.MESSAGE_UPDATED,
      handleMessageUpdated,
    );
    socketClient.socket?.on(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);
    socketClient.socket?.on(
      CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED,
      handleConversationRemoved,
    );
    socketClient.socket?.on(
      CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED,
      handleConversationUpdated,
    );

    return () => {
      if (messageRefreshTimerRef.current !== null) {
        window.clearTimeout(messageRefreshTimerRef.current);
        messageRefreshTimerRef.current = null;
      }

      if (conversationRefreshTimerRef.current !== null) {
        window.clearTimeout(conversationRefreshTimerRef.current);
        conversationRefreshTimerRef.current = null;
      }

      clearConversationTypingState(conversationId);

      socketClient
        .safeEmitValidated(CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE, {
          conversationId,
        })
        .catch(() => {});
      socketClient.socket?.off(
        CHAT_SOCKET_EVENTS.MESSAGE_CREATED,
        handleMessageCreated,
      );
      socketClient.socket?.off(
        CHAT_SOCKET_EVENTS.MESSAGE_UPDATED,
        handleMessageUpdated,
      );
      socketClient.socket?.off(
        CHAT_SOCKET_EVENTS.TYPING_STATE,
        handleTypingState,
      );
      socketClient.socket?.off(
        CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED,
        handleConversationRemoved,
      );
      socketClient.socket?.off(
        CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED,
        handleConversationUpdated,
      );
    };
  }, [
    clearConversationTypingState,
    clearTypingExpiryTimer,
    conversationId,
    messageQueryKey,
    queryClient,
    scheduleConversationsRefresh,
    scheduleMessageRefresh,
    upsertMessageInCache,
  ]);

  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!conversationId) return;

      try {
        await socketClient.safeEmitValidated(
          isTyping
            ? CHAT_SOCKET_EVENTS.TYPING_START
            : CHAT_SOCKET_EVENTS.TYPING_STOP,
          {
            conversationId,
            clientTimestamp: new Date().toISOString(),
          },
        );
      } catch (error) {
        console.error("Failed to send typing state", {
          conversationId,
          isTyping,
          error,
        });
      }
    },
    [conversationId],
  );

  const sendMutation = useMutation({
    mutationFn: (payload: SendMessageInput) =>
      sendMessage(conversationId!, payload),
    onSuccess: (createdMessage) => {
      if (createdMessage) {
        upsertMessageInCache(createdMessage);
      }
      scheduleConversationsRefresh();
    },
    onError: (error) => {
      console.error("Failed to send message", {
        conversationId,
        error,
      });
    },
  });

  const readMutation = useMutation({
    mutationFn: () => markConversationAsRead(conversationId!),
    onSuccess: () => {
      queryClient.setQueriesData(
        { queryKey: ["conversations"] },
        (oldData: unknown) => {
          if (!Array.isArray(oldData)) {
            return oldData;
          }

          return (oldData as ConversationSummary[]).map((item) => {
            if (!item || item.conversationId !== conversationId) {
              return item;
            }

            return {
              ...item,
              unreadCount: 0,
            };
          });
        },
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      updateMessage(conversationId!, messageId, text),
    onSuccess: () => {
      scheduleMessageRefresh();
      scheduleConversationsRefresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({
      messageId,
      scope,
    }: {
      messageId: string;
      scope?: RecallScope;
    }) => deleteMessage(conversationId!, messageId, scope),
    onSuccess: () => {
      scheduleMessageRefresh();
      scheduleConversationsRefresh();
    },
  });

  const forwardMutation = useMutation({
    mutationFn: ({
      messageId,
      conversationIds,
    }: {
      messageId: string;
      conversationIds: string[];
    }) => forwardMessage(conversationId!, messageId, conversationIds),
    onSuccess: () => {
      scheduleMessageRefresh();
      scheduleConversationsRefresh();
    },
  });

  useEffect(() => {
    return () => {
      if (messageRefreshTimerRef.current !== null) {
        window.clearTimeout(messageRefreshTimerRef.current);
      }

      if (conversationRefreshTimerRef.current !== null) {
        window.clearTimeout(conversationRefreshTimerRef.current);
      }

      Object.values(typingExpiryTimersRef.current).forEach((timerId) =>
        window.clearTimeout(timerId),
      );
      typingExpiryTimersRef.current = {};
    };
  }, []);

  return {
    ...query,
    data: messages,
    loadMore: query.fetchNextPage,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    typingUsers,
    sendMessage: sendMutation.mutate,
    sendMessageAsync: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    markAsRead: readMutation.mutate,
    markAsReadAsync: readMutation.mutateAsync,
    isMarkingAsRead: readMutation.isPending,
    updateMessageAsync: updateMutation.mutateAsync,
    deleteMessageAsync: deleteMutation.mutateAsync,
    forwardMessageAsync: forwardMutation.mutateAsync,
    isUpdatingMessage: updateMutation.isPending,
    isDeletingMessage: deleteMutation.isPending,
    isForwardingMessage: forwardMutation.isPending,
    sendTyping,
  };
}
