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

const INBOX_CACHE_STALE_MS = 60000;

const CITIZEN_INBOX_CACHE: {
  conversations: ConversationSummary[];
  joinedGroups: GroupMetadata[];
  hiddenConversationIds: Set<string>;
  loadedAt: number;
} = {
  conversations: [],
  joinedGroups: [],
  hiddenConversationIds: new Set<string>(),
  loadedAt: 0,
};

export function useCitizenInbox() {
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    () => CITIZEN_INBOX_CACHE.conversations,
  );
  const [joinedGroups, setJoinedGroups] = useState<GroupMetadata[]>(
    () => CITIZEN_INBOX_CACHE.joinedGroups,
  );
  const [hiddenConversationIds, setHiddenConversationIds] = useState<Set<string>>(
    () => new Set(CITIZEN_INBOX_CACHE.hiddenConversationIds),
  );
  const [loading, setLoading] = useState(() => CITIZEN_INBOX_CACHE.loadedAt === 0);
  const [error, setError] = useState<string | null>(null);
  const seenEventIds = useRef(new Set<string>());
  const hasLoadedOnceRef = useRef(CITIZEN_INBOX_CACHE.loadedAt > 0);

  const refresh = useCallback(async (
    activeRef?: { current: boolean },
    options?: { force?: boolean },
  ) => {
    const hasFreshCache =
      CITIZEN_INBOX_CACHE.loadedAt > 0 &&
      Date.now() - CITIZEN_INBOX_CACHE.loadedAt < INBOX_CACHE_STALE_MS;

    if (!options?.force && hasFreshCache) {
      if (!hasLoadedOnceRef.current) {
        setConversations(CITIZEN_INBOX_CACHE.conversations);
        setJoinedGroups(CITIZEN_INBOX_CACHE.joinedGroups);
        setHiddenConversationIds(new Set(CITIZEN_INBOX_CACHE.hiddenConversationIds));
        hasLoadedOnceRef.current = true;
      }
      setLoading(false);
      setError(null);
      return;
    }

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }

    try {
      const [conversationItems, groupItems] = await Promise.all([
        listConversations(),
        client.get("/groups", { params: { mine: true } }) as Promise<GroupMetadata[]>,
      ]);

      if (activeRef && !activeRef.current) {
        return;
      }

      CITIZEN_INBOX_CACHE.conversations = conversationItems;
      CITIZEN_INBOX_CACHE.joinedGroups = groupItems;
      CITIZEN_INBOX_CACHE.loadedAt = Date.now();

      setConversations(conversationItems);
      setJoinedGroups(groupItems);

      const refreshedConversationIds = new Set(
        conversationItems.map((item) => item.conversationId),
      );
      const nextHiddenConversationIds = new Set(CITIZEN_INBOX_CACHE.hiddenConversationIds);
      for (const conversationId of nextHiddenConversationIds) {
        if (refreshedConversationIds.has(conversationId)) {
          nextHiddenConversationIds.delete(conversationId);
        }
      }
      CITIZEN_INBOX_CACHE.hiddenConversationIds = nextHiddenConversationIds;
      setHiddenConversationIds(nextHiddenConversationIds);

      hasLoadedOnceRef.current = true;
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

            if (event.summary?.conversationId) {
              setHiddenConversationIds((prev) => {
                if (!prev.has(event.summary.conversationId)) {
                  return prev;
                }

                const nextHidden = new Set(prev);
                nextHidden.delete(event.summary.conversationId);
                CITIZEN_INBOX_CACHE.hiddenConversationIds = nextHidden;
                return nextHidden;
              });
            }

            setConversations((prev) => {
              const index = prev.findIndex(
                (item) => item.conversationId === event.conversationId,
              );

              if (index === -1) {
                const next = [event.summary, ...prev];
                CITIZEN_INBOX_CACHE.conversations = next;
                CITIZEN_INBOX_CACHE.loadedAt = Date.now();
                return next;
              }

              const next = [...prev];
              next[index] = event.summary;
              CITIZEN_INBOX_CACHE.conversations = next;
              CITIZEN_INBOX_CACHE.loadedAt = Date.now();
              return next;
            });
          };

          const handleConversationRemoved = (event: ChatConversationRemovedEvent) => {
            if (!rememberEvent(seenEventIds, event.eventId)) {
              return;
            }

            setHiddenConversationIds((prev) => {
              if (prev.has(event.conversationId)) {
                return prev;
              }

              const nextHidden = new Set(prev);
              nextHidden.add(event.conversationId);
              CITIZEN_INBOX_CACHE.hiddenConversationIds = nextHidden;
              return nextHidden;
            });

            setConversations((prev) => {
              const next = prev.filter((item) => item.conversationId !== event.conversationId);
              CITIZEN_INBOX_CACHE.conversations = next;
              CITIZEN_INBOX_CACHE.loadedAt = Date.now();
              return next;
            });
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

  const hideConversation = useCallback((conversationId: string) => {
    const normalizedConversationId = conversationId?.trim();
    if (!normalizedConversationId) {
      return;
    }

    setHiddenConversationIds((prev) => {
      if (prev.has(normalizedConversationId)) {
        return prev;
      }

      const nextHidden = new Set(prev);
      nextHidden.add(normalizedConversationId);
      CITIZEN_INBOX_CACHE.hiddenConversationIds = nextHidden;
      return nextHidden;
    });

    setConversations((prev) => {
      const next = prev.filter((item) => item.conversationId !== normalizedConversationId);
      CITIZEN_INBOX_CACHE.conversations = next;
      CITIZEN_INBOX_CACHE.loadedAt = Date.now();
      return next;
    });
  }, []);

  const visibleConversations = useMemo(() => {
    const conversationMap = new Map(
      conversations
        .filter((item) => !hiddenConversationIds.has(item.conversationId))
        .map((item) => [item.conversationId, item] as const),
    );

    for (const group of joinedGroups) {
      const conversationId = `group:${group.id}`;
      if (hiddenConversationIds.has(conversationId)) {
        continue;
      }

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
  }, [conversations, joinedGroups, hiddenConversationIds]);

  return {
    conversations: visibleConversations,
    loading,
    error,
    refresh: () => refresh(undefined, { force: true }),
    hideConversation,
  };
}
