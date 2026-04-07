import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import Header from "@/components/Header";
import colors from "@/constants/colors";
import client from "@/services/api/client";
import { listConversations } from "@/services/api/conversation.api";
import { connectChatSocket } from "@/services/chat-socket";
import type {
  ChatConversationRemovedEvent,
  ChatConversationUpdatedEvent,
  ConversationSummary,
  GroupMetadata,
} from "@urban/shared-types";

const MAX_TRACKED_EVENT_IDS = 200;

function rememberEvent(seen: MutableRefObject<Set<string>>, eventId: string): boolean {
  if (seen.current.has(eventId)) {
    return false;
  }

  seen.current.add(eventId);

  if (seen.current.size > MAX_TRACKED_EVENT_IDS) {
    const oldest = seen.current.values().next().value;
    if (oldest) {
      seen.current.delete(oldest);
    }
  }

  return true;
}

export default function ChatListPage() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [joinedGroups, setJoinedGroups] = useState<GroupMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenEventIds = useRef(new Set<string>());

  useFocusEffect(
    useMemo(
      () => () => {
        let active = true;
        let cleanupSocketListeners: (() => void) | undefined;

        const fetchConversations = async () => {
          setLoading(true);
          try {
            const [data, mine] = await Promise.all([
              listConversations(),
              client.get("/groups", { params: { mine: true } }) as Promise<GroupMetadata[]>,
            ]);
            if (active) {
              setConversations(data);
              setJoinedGroups(mine);
              setError(null);
            }
          } catch (err: unknown) {
            if (active) {
              setError((err as Error)?.message ?? "Unable to load conversations");
            }
          } finally {
            if (active) {
              setLoading(false);
            }
          }
        };

        void fetchConversations();
        void connectChatSocket()
          .then((socket) => {
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

            socket.on(CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED, handleConversationUpdated);
            socket.on(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);

            if (!active) {
              socket.off(CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED, handleConversationUpdated);
              socket.off(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);
              return;
            }

            cleanupSocketListeners = () => {
              socket.off(CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED, handleConversationUpdated);
              socket.off(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);
            };
          })
          .catch((err: unknown) => {
            if (active) {
              setError((current) => current ?? ((err as Error)?.message || "Unable to connect realtime chat"));
            }
          });

        return () => {
          active = false;
          cleanupSocketListeners?.();
        };
      },
      [],
    ),
  );

  const dedupedConversations = useMemo(
    () =>
      conversations.filter((item, index, arr) => {
        return arr.findIndex((entry) => entry.conversationId === item.conversationId) === index;
      }),
    [conversations],
  );

  const visibleConversations = useMemo<ConversationSummary[]>(() => {
    const conversationMap = new Map(
      dedupedConversations.map((item) => [item.conversationId, item] as const),
    );

    for (const group of joinedGroups) {
      const conversationId = `group:${group.id}`;

      if (!conversationMap.has(conversationId)) {
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
  }, [dedupedConversations, joinedGroups]);

  return (
    <View style={styles.container}>
      <Header title="Chat" subtitle="Your latest conversations" />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={visibleConversations}
          keyExtractor={(item) => item.conversationId}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(citizen)/chat/[id]",
                  params: { id: item.conversationId },
                })
              }
              style={styles.conversation}
            >
              <View style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name="chatbubble-ellipses" size={18} color={colors.primary} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.title}>{item.groupName}</Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.lastMessagePreview || "Chua co tin nhan, bam de bat dau tro chuyen"}
                  </Text>
                </View>
                {item.unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No conversations yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: 16 },
  conversation: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  row: { flexDirection: "row", alignItems: "center" },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 4, color: colors.text },
  preview: { color: colors.textSecondary, fontSize: 14 },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  badgeText: { color: "white", fontSize: 12, fontWeight: "700" },
  error: { color: colors.danger, textAlign: "center", marginTop: 12 },
  empty: { color: colors.textSecondary, textAlign: "center", marginTop: 12 },
});
