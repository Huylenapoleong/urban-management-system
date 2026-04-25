import { socketClient } from "@/lib/socket-client";
import {
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

function extractConversationId(
  payload?: ConversationRemovedPayload | null,
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

export function useConversations(searchTerm?: string) {
  const queryClient = useQueryClient();
  const joinedConversationIdsRef = useRef<Set<string>>(new Set());
  const lastConversationRefreshAtRef = useRef(0);
  const scheduledConversationRefreshRef = useRef<number | null>(null);

  const scheduleConversationsRefresh = useCallback(() => {
    const minIntervalMs = 1200;
    const now = Date.now();
    const elapsed = now - lastConversationRefreshAtRef.current;

    if (elapsed >= minIntervalMs) {
      lastConversationRefreshAtRef.current = now;
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
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }, waitMs);
  }, [queryClient]);

  useEffect(() => {
    const handleNewMessage = () => {
      // payload probably has conversationId
      scheduleConversationsRefresh();
    };

    const handleConversationRemoved = (payload: ConversationRemovedPayload) => {
      const removedConversationId = extractConversationId(payload);
      if (removedConversationId) {
        joinedConversationIdsRef.current.delete(removedConversationId);
        queryClient.removeQueries({
          queryKey: ["messages", removedConversationId],
        });
      }
      scheduleConversationsRefresh();
    };

    const handleSocketConnect = () => {
      joinedConversationIdsRef.current.clear();
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
      socketClient.socket?.off("connect", handleSocketConnect);
    };
  }, [queryClient, scheduleConversationsRefresh]);

  const query = useQuery({
    queryKey: ["conversations", searchTerm?.trim() ?? ""],
    queryFn: () => listConversations(searchTerm),
    staleTime: 10 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const conversationIds = (query.data ?? [])
      .map((item) => item.conversationId)
      .filter(Boolean);

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
  }, [query.data]);

  return query;
}

export function useMessages(conversationId?: string) {
  const queryClient = useQueryClient();
  const [typingUsersByConversation, setTypingUsersByConversation] = useState<
    Record<string, Record<string, ChatTypingStateEvent>>
  >({});
  const messageQueryKey = useMemo(
    () => ["messages", conversationId] as const,
    [conversationId],
  );
  const messageRefreshTimerRef = useRef<number | null>(null);
  const conversationRefreshTimerRef = useRef<number | null>(null);
  const typingUsers = conversationId
    ? (typingUsersByConversation[conversationId] ?? {})
    : {};

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

          if (
            oldData.pages.some((page) =>
              page.items.some((msg) => msg.id === message.id),
            )
          ) {
            return oldData;
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
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: !!conversationId,
    staleTime: 15 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const messages = query.data?.pages.flatMap((page) => page.items) ?? [];

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
      if (!payload?.userId) {
        return;
      }

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
    };

    const handleMessageCreated = (
      payload: ChatMessageCreatedEvent | MessageItem,
    ) => {
      const newMsg = "message" in payload ? payload.message : payload;
      if (newMsg?.conversationId === conversationId) {
        upsertMessageInCache(newMsg);
      }
    };

    const handleConversationRemoved = (payload: ConversationRemovedPayload) => {
      const removedConversationId = extractConversationId(payload);
      if (!removedConversationId || removedConversationId !== conversationId) {
        return;
      }

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

    socketClient.socket?.on(
      CHAT_SOCKET_EVENTS.MESSAGE_CREATED,
      handleMessageCreated,
    );
    socketClient.socket?.on(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);
    socketClient.socket?.on(
      CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED,
      handleConversationRemoved,
    );

    return () => {
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
        CHAT_SOCKET_EVENTS.TYPING_STATE,
        handleTypingState,
      );
      socketClient.socket?.off(
        CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED,
        handleConversationRemoved,
      );
    };
  }, [conversationId, messageQueryKey, queryClient, upsertMessageInCache]);

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
    updateMessageAsync: updateMutation.mutateAsync,
    deleteMessageAsync: deleteMutation.mutateAsync,
    forwardMessageAsync: forwardMutation.mutateAsync,
    isUpdatingMessage: updateMutation.isPending,
    isDeletingMessage: deleteMutation.isPending,
    isForwardingMessage: forwardMutation.isPending,
    sendTyping,
  };
}
