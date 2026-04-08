import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type {
  ChatConversationRemovedEvent,
  ChatConversationUpdatedEvent,
  ConversationSummary,
  GroupMetadata,
} from "@urban/shared-types";
import client from "@/services/api/client";
import { listConversations } from "@/services/api/conversation.api";
import { connectChatSocket } from "@/services/chat-socket";
import { rememberEvent } from "./chat-utils";

export function useCitizenInbox() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [joinedGroups, setJoinedGroups] = useState<GroupMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenEventIds = useRef(new Set<string>());

  const refresh = useCallback(async (activeRef?: { current: boolean }) => {
    setLoading(true);

    try {
      const [conversationItems, groupItems] = await Promise.all([
        listConversations(),
        client.get("/groups", { params: { mine: true } }) as Promise<GroupMetadata[]>,
      ]);

      if (activeRef && !activeRef.current) {
        return;
      }

      setConversations(conversationItems);
      setJoinedGroups(groupItems);
      setError(null);
    } catch (err: unknown) {
      if (activeRef && !activeRef.current) {
        return;
      }

      setError((err as Error)?.message ?? "Unable to load conversations");
    } finally {
      if (!activeRef || activeRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const active = { current: true };
      let cleanupSocketListeners: (() => void) | undefined;

      void refresh(active);
      void connectChatSocket()
        .then((socket) => {
          const chatSocket = socket as any;

          const handleConversationUpdated = (event: ChatConversationUpdatedEvent) => {
            if (!rememberEvent(seenEventIds, event.eventId)) {
              return;
            }

            setConversations((prev) => {
              const index = prev.findIndex(
                (item) => item.conversationId === event.conversationId,
              );

              if (index === -1) {
                return [event.summary, ...prev];
              }

              const next = [...prev];
              next[index] = event.summary;
              return next;
            });
          };

          const handleConversationRemoved = (event: ChatConversationRemovedEvent) => {
            if (!rememberEvent(seenEventIds, event.eventId)) {
              return;
            }

            setConversations((prev) =>
              prev.filter((item) => item.conversationId !== event.conversationId),
            );
          };

          chatSocket.on(CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED, handleConversationUpdated);
          chatSocket.on(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);

          if (!active.current) {
            chatSocket.off(CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED, handleConversationUpdated);
            chatSocket.off(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);
            return;
          }

          cleanupSocketListeners = () => {
            chatSocket.off(CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED, handleConversationUpdated);
            chatSocket.off(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);
          };
        })
        .catch((err: unknown) => {
          if (active.current) {
            setError(
              (current) =>
                current ?? ((err as Error)?.message || "Unable to connect realtime chat"),
            );
          }
        });

      return () => {
        active.current = false;
        cleanupSocketListeners?.();
      };
    }, [refresh]),
  );

  const visibleConversations = useMemo(() => {
    const conversationMap = new Map(
      conversations.map((item) => [item.conversationId, item] as const),
    );

    for (const group of joinedGroups) {
      const conversationId = `group:${group.id}`;
      const existingConversation = conversationMap.get(conversationId);

      if (existingConversation) {
        conversationMap.set(conversationId, {
          ...existingConversation,
          groupName: group.groupName,
          updatedAt:
            new Date(existingConversation.updatedAt).getTime() >=
            new Date(group.updatedAt).getTime()
              ? existingConversation.updatedAt
              : group.updatedAt,
        });
      } else {
        conversationMap.set(conversationId, {
          conversationId,
          groupName: group.groupName,
          lastMessagePreview: "",
          lastSenderName: "",
          unreadCount: 0,
          isGroup: true,
          isPinned: false,
          archivedAt: null,
          mutedUntil: null,
          deletedAt: null,
          updatedAt: group.updatedAt,
        });
      }
    }

    return [...conversationMap.values()].sort((left, right) => {
      const leftTime = new Date(left.updatedAt).getTime();
      const rightTime = new Date(right.updatedAt).getTime();
      return rightTime - leftTime;
    });
  }, [conversations, joinedGroups]);

  return {
    conversations: visibleConversations,
    loading,
    error,
    refresh: () => refresh(),
  };
}
