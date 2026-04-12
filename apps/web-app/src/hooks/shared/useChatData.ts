import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listConversations,
  listMessages,
  markConversationAsRead,
  sendMessage,
} from "@/services/conversation.api";
import { socketClient } from "@/lib/socket-client";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type { MessageItem } from "@urban/shared-types";

export function useConversations() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleNewMessage = () => {
      // payload probably has conversationId
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    socketClient.socket?.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleNewMessage);
    
    // Auto refresh conversations when we connect to ensure freshness
    socketClient.socket?.on('connect', () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });

    return () => {
      socketClient.socket?.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleNewMessage);
      socketClient.socket?.off('connect');
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });
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
    mutationFn: (text: string) => sendMessage(conversationId!, text),
    onSuccess: (data) => {
      queryClient.setQueryData<MessageItem[]>(["messages", conversationId], (oldData) => {
        if (!oldData) return [data];
        if (oldData.some(msg => msg.id === data.id)) return oldData;
        return [data, ...oldData];
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
    isSending: sendMutation.isPending,
    markAsRead: readMutation.mutate,
  };
}
