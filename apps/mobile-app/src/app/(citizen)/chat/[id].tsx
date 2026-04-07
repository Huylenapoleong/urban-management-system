import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CHAT_SOCKET_EVENTS, type MessageType } from "@urban/shared-constants";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "@/components/Avatar";
import colors from "@/constants/colors";
import { useAuth } from "@/services/auth-context";
import client from "@/services/api/client";
import { listMessages, markConversationAsRead } from "@/services/api/conversation.api";
import { connectChatSocket, joinConversation, leaveConversation } from "@/services/chat-socket";
import type {
  ChatMessageCreatedEvent,
  ChatMessageDeletedEvent,
  ChatMessageUpdatedEvent,
  ChatPresenceSnapshotEvent,
  ChatPresenceState,
  ChatPresenceUpdatedEvent,
  ChatTypingStateEvent,
  MessageItem,
} from "@urban/shared-types";

type StructuredTextContent = {
  text: string;
  mention: unknown[];
};

type RenderMessage = {
  primaryText: string;
  secondaryText?: string;
  typeLabel?: string;
};

const isMissingConversationError = (error: unknown) => {
  const message = (error as Error | undefined)?.message?.toLowerCase() ?? "";
  return message.includes("conversation not found");
};

const sortMessages = (items: MessageItem[]) =>
  [...items].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());

const MAX_TRACKED_EVENT_IDS = 300;

const parseConversationId = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;

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

function upsertSortedMessage(items: MessageItem[], nextItem: MessageItem): MessageItem[] {
  const next = items.filter((item) => item.id !== nextItem.id);
  next.push(nextItem);
  return sortMessages(next);
}

const parseStructuredContent = (content: string): StructuredTextContent | undefined => {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (typeof parsed === "string") {
      return { text: parsed, mention: [] };
    }

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;
    return {
      text: typeof record.text === "string" ? record.text : "",
      mention: Array.isArray(record.mention) ? record.mention : [],
    };
  } catch {
    return undefined;
  }
};

const getRenderMessage = (item: MessageItem): RenderMessage => {
  const structured = parseStructuredContent(item.content);
  const normalizedText = structured?.text?.trim() || item.content?.trim() || "";
  const attachmentHint = item.attachmentUrl ? "Co tep dinh kem" : undefined;

  switch (item.type as MessageType) {
    case "TEXT":
    case "EMOJI":
      return {
        primaryText: normalizedText || "(Tin nhan rong)",
        secondaryText: attachmentHint,
      };
    case "SYSTEM":
      return {
        primaryText: normalizedText || "Thong bao he thong",
        typeLabel: "SYSTEM",
      };
    case "IMAGE":
    case "VIDEO":
    case "AUDIO":
    case "DOC":
      return {
        primaryText: normalizedText || `[${item.type}]`,
        secondaryText: item.attachmentUrl || attachmentHint,
        typeLabel: item.type,
      };
    default:
      return {
        primaryText: normalizedText || item.type,
        secondaryText: attachmentHint,
      };
  }
};

export default function ChatDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const convoId = parseConversationId(params.id);

  const [text, setText] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenceByUser, setPresenceByUser] = useState<Record<string, ChatPresenceState>>({});
  const [typingByUser, setTypingByUser] = useState<Record<string, ChatTypingStateEvent>>({});
  const [joinedConversationKey, setJoinedConversationKey] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<MessageItem>>(null);
  const seenEventIds = useRef(new Set<string>());

  const fetchMessages = useCallback(async (conversationId: string, showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const data = await listMessages(conversationId);
      setMessages(sortMessages(data));
      setError(null);
      await markConversationAsRead(conversationId);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    } catch (err: unknown) {
      if (isMissingConversationError(err)) {
        setMessages([]);
        setError(null);
        return;
      }

      setError((err as Error)?.message ?? "Unable to load messages");
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!convoId) {
      setLoading(false);
      return;
    }

    void fetchMessages(convoId, true);
  }, [convoId, fetchMessages]);

  useEffect(() => {
    if (!convoId) {
      return;
    }

    let active = true;
    let currentConversationKey: string | null = null;
    let cleanupSocketListeners: (() => void) | undefined;

    const syncJoinState = async () => {
      try {
        const response = await joinConversation(convoId);

        if (!active || !response.success) {
          if (active && !response.success) {
            setError((current) => current ?? response.error.message);
          }
          return;
        }

        currentConversationKey = response.data.conversationKey;
        setJoinedConversationKey(response.data.conversationKey);
      } catch (err: unknown) {
        if (active) {
          setError((current) => current ?? ((err as Error)?.message || "Unable to join realtime chat"));
        }
      }
    };

    void connectChatSocket()
      .then((socket) => {
        const handleConnect = () => {
          void syncJoinState();
        };

        const handleMessageCreated = (event: ChatMessageCreatedEvent) => {
          if (event.conversationId !== convoId || !rememberEvent(seenEventIds, event.eventId)) {
            return;
          }

          setMessages((prev) => upsertSortedMessage(prev, event.message));
          setError(null);
        };

        const handleMessageUpdated = (event: ChatMessageUpdatedEvent) => {
          if (event.conversationId !== convoId || !rememberEvent(seenEventIds, event.eventId)) {
            return;
          }

          setMessages((prev) => upsertSortedMessage(prev, event.message));
        };

        const handleMessageDeleted = (event: ChatMessageDeletedEvent) => {
          if (event.conversationId !== convoId || !rememberEvent(seenEventIds, event.eventId)) {
            return;
          }

          setMessages((prev) => prev.filter((item) => item.id !== event.messageId));
        };

        const handlePresenceSnapshot = (event: ChatPresenceSnapshotEvent) => {
          if (event.conversationKey !== currentConversationKey) {
            return;
          }

          setPresenceByUser(
            Object.fromEntries(event.participants.map((item) => [item.userId, item] as const)),
          );
        };

        const handlePresenceUpdated = (event: ChatPresenceUpdatedEvent) => {
          if (event.conversationKey !== currentConversationKey) {
            return;
          }

          setPresenceByUser((prev) => ({
            ...prev,
            [event.presence.userId]: event.presence,
          }));
        };

        const handleTypingState = (event: ChatTypingStateEvent) => {
          if (event.conversationKey !== currentConversationKey || event.userId === user?.id) {
            return;
          }

          setTypingByUser((prev) => {
            if (!event.isTyping) {
              const next = { ...prev };
              delete next[event.userId];
              return next;
            }

            return {
              ...prev,
              [event.userId]: event,
            };
          });
        };

        socket.on("connect", handleConnect);
        socket.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);
        socket.on(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
        socket.on(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
        socket.on(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
        socket.on(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, handlePresenceUpdated);
        socket.on(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);

        void syncJoinState();

        if (!active) {
          socket.off("connect", handleConnect);
          socket.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);
          socket.off(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
          socket.off(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
          socket.off(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
          socket.off(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, handlePresenceUpdated);
          socket.off(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);
          return;
        }

        cleanupSocketListeners = () => {
          socket.off("connect", handleConnect);
          socket.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleMessageCreated);
          socket.off(CHAT_SOCKET_EVENTS.MESSAGE_UPDATED, handleMessageUpdated);
          socket.off(CHAT_SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted);
          socket.off(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
          socket.off(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, handlePresenceUpdated);
          socket.off(CHAT_SOCKET_EVENTS.TYPING_STATE, handleTypingState);
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
      setPresenceByUser({});
      setTypingByUser({});
      setJoinedConversationKey(null);
      void leaveConversation(convoId).catch(() => undefined);
    };
  }, [convoId, user?.id]);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  const textPayload = useMemo(
    () =>
      JSON.stringify({
        text: text.trim(),
        mention: [],
      }),
    [text],
  );

  const onSend = async () => {
    if (!text.trim() || !convoId || sending) {
      return;
    }

    const clientMessageId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    setSending(true);

    try {
      await client.post(`/conversations/${encodeURIComponent(convoId)}/messages`, {
        type: "TEXT",
        content: textPayload,
        clientMessageId,
      });

      setText("");
      await fetchMessages(convoId);

      setTimeout(() => {
        scrollToBottom();
      }, 100);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Unable to send message");
    } finally {
      setSending(false);
    }
  };

  const typingUsers = useMemo(
    () => Object.values(typingByUser).map((item) => item.fullName).filter(Boolean),
    [typingByUser],
  );

  const activeParticipants = useMemo(
    () =>
      Object.values(presenceByUser).filter(
        (item) => item.isActive && item.userId !== user?.id,
      ).length,
    [presenceByUser, user?.id],
  );

  const subtitle = typingUsers.length
    ? `${typingUsers.join(", ")} dang go tin nhan`
    : activeParticipants > 0
      ? `${activeParticipants} nguoi dang online`
      : joinedConversationKey
        ? "Dang dong bo realtime"
        : "Dang ket noi phong chat";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.topBarText}>
          <Text style={styles.topBarTitle}>Chat room</Text>
          <Text style={styles.topBarSubtitle}>{subtitle}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => `${item.id}-${item.sentAt}-${item.senderId}`}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: tabBarHeight + insets.bottom + 24,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const rendered = getRenderMessage(item);
            const isOwn = item.senderId === user?.id;

            return (
              <View style={[styles.messageRow, isOwn ? styles.messageRowOwn : styles.messageRowOther]}>
                {!isOwn ? (
                  <Avatar uri={item.senderAvatarUrl} name={item.senderName} size={34} />
                ) : null}
                <View style={[styles.messageStack, isOwn ? styles.messageStackOwn : styles.messageStackOther]}>
                  <Text style={[styles.senderName, isOwn ? styles.senderNameOwn : null]}>
                    {isOwn ? "Ban" : item.senderName}
                  </Text>
                  <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                    {rendered.typeLabel ? (
                      <View style={[styles.typePill, isOwn ? styles.typePillOwn : styles.typePillOther]}>
                        <Text style={[styles.typePillText, isOwn ? styles.typePillTextOwn : null]}>
                          {rendered.typeLabel}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : null]}>
                      {rendered.primaryText}
                    </Text>
                    {rendered.secondaryText ? (
                      <Text style={[styles.messageMeta, isOwn ? styles.messageMetaOwn : null]}>
                        {rendered.secondaryText}
                      </Text>
                    ) : null}
                    <Text style={[styles.messageTime, isOwn ? styles.messageTimeOwn : null]}>
                      {new Date(item.sentAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-ellipses-outline" size={42} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>Chua co tin nhan nao</Text>
              <Text style={styles.emptyText}>Hay gui tin nhan dau tien de bat dau cuoc tro chuyen trong nhom nay.</Text>
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          placeholder="Nhap noi dung van ban..."
          value={text}
          onChangeText={setText}
          multiline
          editable={!sending}
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            (!text.trim() || !convoId || sending) && styles.sendButtonDisabled,
            pressed && text.trim() && !sending ? styles.sendButtonPressed : null,
          ]}
          onPress={onSend}
          disabled={!text.trim() || !convoId || sending}
        >
          <Ionicons name="send" size={18} color="white" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f8ff" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  topBarText: { flex: 1 },
  topBarTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  topBarSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 13 },
  loader: { marginTop: 20 },
  error: { color: colors.danger, textAlign: "center", marginTop: 20 },
  messageRow: {
    flexDirection: "row",
    marginVertical: 7,
    paddingHorizontal: 4,
    alignItems: "flex-end",
  },
  messageRowOwn: { justifyContent: "flex-end" },
  messageRowOther: { justifyContent: "flex-start" },
  messageStack: { maxWidth: "80%" },
  messageStackOwn: { alignItems: "flex-end" },
  messageStackOther: { marginLeft: 10 },
  senderName: {
    marginBottom: 6,
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  senderNameOwn: { color: "#1d4ed8" },
  bubble: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  bubbleOwn: {
    backgroundColor: "#2563eb",
    borderTopRightRadius: 8,
  },
  bubbleOther: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopLeftRadius: 8,
  },
  typePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  typePillOwn: { backgroundColor: "rgba(255,255,255,0.18)" },
  typePillOther: { backgroundColor: "#eff6ff" },
  typePillText: { fontSize: 11, fontWeight: "800", color: colors.primary },
  typePillTextOwn: { color: "white" },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextOwn: { color: "white" },
  messageMeta: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  messageMetaOwn: { color: "rgba(255,255,255,0.82)" },
  messageTime: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 11,
    alignSelf: "flex-end",
  },
  messageTimeOwn: { color: "rgba(255,255,255,0.76)" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginRight: 10,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  emptyText: {
    marginTop: 8,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
