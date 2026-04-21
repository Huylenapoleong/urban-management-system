import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import {
  listConversations,
  deleteMessage,
  forwardMessage,
  listMessagesPage,
  type CursorPage,
  markConversationAsRead,
  sendMessage,
  updateMessage,
  type RecallScope,
  type SendMessageInput,
} from "@/services/conversation.api";
import { socketClient } from "@/lib/socket-client";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type { ChatTypingStateEvent, MessageItem } from "@urban/shared-types";

export function useConversations(searchTerm?: string) {
  const queryClient = useQueryClient();
  const joinedConversationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleNewMessage = () => {
      // payload probably has conversationId
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const handleConversationRemoved = (payload: any) => {
      const removedConversationId = payload?.conversationId || payload?.data?.conversationId;
      if (removedConversationId) {
        joinedConversationIdsRef.current.delete(removedConversationId);
        queryClient.removeQueries({ queryKey: ["messages", removedConversationId] });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const handleSocketConnect = () => {
      joinedConversationIdsRef.current.clear();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    socketClient.socket?.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleNewMessage);
    socketClient.socket?.on(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);
    socketClient.socket?.on("connect", handleSocketConnect);

    return () => {
      socketClient.socket?.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleNewMessage);
      socketClient.socket?.off(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);
      socketClient.socket?.off("connect", handleSocketConnect);
    };
  }, [queryClient]);

  const query = useQuery({
    queryKey: ["conversations", searchTerm?.trim() ?? ""],
    queryFn: () => listConversations(searchTerm),
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
          await socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CONVERSATION_JOIN, {
            conversationId,
          });
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
  const [typingUsers, setTypingUsers] = useState<Record<string, ChatTypingStateEvent>>({});
  const messageQueryKey = useMemo(() => ["messages", conversationId] as const, [conversationId]);

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
  });

  const messages = query.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (!conversationId) return;

    setTypingUsers({});
    
    const joinRoom = async () => {
      try {
        await socketClient.connect();
        // Fire & forget join event
        socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CONVERSATION_JOIN, { conversationId });
      } catch (err) {
        console.error("Failed to join chat room", err);
      }
    };
    joinRoom();

    const handleTypingState = (payload: ChatTypingStateEvent) => {
      if (!payload?.userId) {
        return;
      }

      setTypingUsers((prev) => {
        if (!payload.isTyping) {
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        }

        return {
          ...prev,
          [payload.userId]: payload,
        };
      });
    };

    const handleMessageCreated = (payload: any) => {
      // payload could be a ChatMessageCreatedEvent
      const newMsg = payload.message || payload;
      if (newMsg?.conversationId === conversationId) {
        // Keep newest page fresh while preserving older pages.
        queryClient.setQueryData<InfiniteData<CursorPage<MessageItem>>>(messageQueryKey, (oldData) => {
          if (!oldData || oldData.pages.length === 0) {
            return {
              pages: [{ items: [newMsg], nextCursor: undefined }],
              pageParams: [undefined],
            };
          }

          if (oldData.pages.some((page) => page.items.some((msg) => msg.id === newMsg.id))) {
            return oldData;
          }

          const [firstPage, ...restPages] = oldData.pages;
          return {
            ...oldData,
            pages: [{ ...firstPage, items: [newMsg, ...firstPage.items] }, ...restPages],
          };
        });
      }
    };

    const handleConversationRemoved = (payload: any) => {
      const removedConversationId = payload?.conversationId || payload?.data?.conversationId;
      if (!removedConversationId || removedConversationId !== conversationId) {
        return;
      }

      setTypingUsers({});
      queryClient.removeQueries({ queryKey: messageQueryKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    socketClient.socket?.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);
    socketClient.socket?.on(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);
    socketClient.socket?.on(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);

    return () => {
      socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE, { conversationId }).catch(() => {});
      socketClient.socket?.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);
      socketClient.socket?.off(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);
      socketClient.socket?.off(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);
    };
  }, [conversationId, messageQueryKey, queryClient]);

  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!conversationId) return;

      try {
        await socketClient.safeEmitValidated(isTyping ? CHAT_SOCKET_EVENTS.TYPING_START : CHAT_SOCKET_EVENTS.TYPING_STOP, {
          conversationId,
          clientTimestamp: new Date().toISOString(),
        });
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
    mutationFn: (payload: SendMessageInput) => sendMessage(conversationId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageQueryKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      updateMessage(conversationId!, messageId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageQueryKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ messageId, scope }: { messageId: string; scope?: RecallScope }) =>
      deleteMessage(conversationId!, messageId, scope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageQueryKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const forwardMutation = useMutation({
    mutationFn: ({ messageId, conversationIds }: { messageId: string; conversationIds: string[] }) =>
      forwardMessage(conversationId!, messageId, conversationIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageQueryKey });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

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
