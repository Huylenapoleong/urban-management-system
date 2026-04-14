import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listConversations,
  listMessages,
  markConversationAsRead,
  sendMessage,
  type SendMessageInput,
} from "@/services/conversation.api";
import { socketClient } from "@/lib/socket-client";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type { MessageItem } from "@urban/shared-types";

export function useConversations(searchTerm?: string) {
  const queryClient = useQueryClient();
  const joinedConversationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleNewMessage = () => {
      // payload probably has conversationId
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const handleSocketConnect = () => {
      joinedConversationIdsRef.current.clear();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    socketClient.socket?.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleNewMessage);
    socketClient.socket?.on("connect", handleSocketConnect);

    return () => {
      socketClient.socket?.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleNewMessage);
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

  const query = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => listMessages(conversationId!),
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversationId) return;
    
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

    const handleMessageCreated = (payload: any) => {
      // payload could be a ChatMessageCreatedEvent
      const newMsg = payload.message || payload;
      if (newMsg?.conversationId === conversationId) {
        // Optimistically update or invalidate
        queryClient.setQueryData<MessageItem[]>(["messages", conversationId], (oldData) => {
          if (!oldData) return [newMsg];
          // Deduplicate
          if (oldData.some(msg => msg.id === newMsg.id)) {
            return oldData;
          }
          // Determine if we need to append at the beginning or end based on order.
          // Usually listMessages returns newest first (descending), so newMsg goes at index 0
          return [newMsg, ...oldData];
        });
      }
    };

    socketClient.socket?.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);

    return () => {
      socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CONVERSATION_LEAVE, { conversationId }).catch(() => {});
      socketClient.socket?.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);
    };
  }, [conversationId, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (payload: SendMessageInput) => sendMessage(conversationId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
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

  return {
    ...query,
    sendMessage: sendMutation.mutate,
    sendMessageAsync: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    markAsRead: readMutation.mutate,
  };
}
