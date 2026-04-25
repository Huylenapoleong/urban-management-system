import React, { useEffect, useMemo, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar, Badge, Button, Modal, Portal } from "react-native-paper";
import colors from "@/constants/colors";
import { useCitizenInbox } from "@/features/chat/citizen/useCitizenInbox";
import { useAuth } from "@/providers/AuthProvider";
import client from "@/services/api/client";
import { deleteConversation, updateConversationPreferences } from "@/services/api/conversation.api";
import { getUserPresence } from "@/services/api/user.api";
import { convertToS3Url } from "@/constants/s3";
import { socketClient } from "@/lib/socket-client";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import { ListSkeleton } from "@/components/skeleton/Skeleton";
import { prefetchConversationMessages } from "@/services/prefetch";
import { openAiChatbot } from "@/lib/ai-chatbot-controller";

const PRESENCE_OFFLINE_GRACE_MS = 120000;
const CITIZEN_DM_PRESENCE_CACHE: Record<string, any> = {};
const DEFAULT_CHAT_HEADER_HEIGHT = 118;

const resolveConversationAvatarUrl = (item: any): string | undefined => {
  const candidates = [
    item?.groupAvatarUrl,
    item?.peerAvatarUrl,
    item?.targetAvatarUrl,
    item?.avatarUrl,
    item?.avatarAsset?.resolvedUrl,
    item?.groupAvatarAsset?.resolvedUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return convertToS3Url(candidate.trim());
    }
  }

  return undefined;
};

const getDmTargetUserId = (
  conversationId: string | undefined,
  currentUserId?: string,
): string | undefined => {
  if (!conversationId || typeof conversationId !== "string") return undefined;
  const normalized = conversationId.trim();

  if (/^dm:/i.test(normalized)) {
    const targetId = normalized.replace(/^dm:/i, "").trim();
    return targetId || undefined;
  }

  if (/^dm#/i.test(normalized)) {
    const participantIds = normalized
      .replace(/^dm#/i, "")
      .split("#")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!participantIds.length) return undefined;

    if (currentUserId) {
      return participantIds.find((participantId) => participantId !== currentUserId) ?? participantIds[0];
    }

    return participantIds[participantIds.length - 1];
  }

  return undefined;
};

const formatPresenceLabel = (
  presence?: { isActive?: boolean; lastSeenAt?: string; occurredAt?: string } | null,
  nowMs = Date.now(),
): string => {
  if (presence?.isActive === true) {
    return "Đang hoạt động";
  }

  if (presence?.isActive === false) {
    const ts = Date.parse(String(presence.lastSeenAt || presence.occurredAt || ""));
    if (!Number.isNaN(ts)) {
      const diffMinutes = Math.max(0, Math.floor((nowMs - ts) / 60000));
      if (diffMinutes < 1) {
        return "Vừa hoạt động";
      }
      if (diffMinutes < 60) {
        return `Hoạt động ${diffMinutes} phút trước`;
      }
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        return `Hoạt động ${diffHours} giờ trước`;
      }
      const diffDays = Math.floor(diffHours / 24);
      return `Hoạt động ${diffDays} ngày trước`;
    }
  }

  return "";
};

const normalizePresencePayload = (raw: any): { isActive?: boolean; lastSeenAt?: string; occurredAt?: string } | null => {
  const candidate = raw?.presence || raw?.data?.presence || raw?.data || raw;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const normalized = {
    isActive:
      typeof candidate.isActive === 'boolean'
        ? candidate.isActive
        : typeof candidate.active === 'boolean'
          ? candidate.active
          : undefined,
    lastSeenAt:
      typeof candidate.lastSeenAt === 'string'
        ? candidate.lastSeenAt
        : typeof candidate.lastActiveAt === 'string'
          ? candidate.lastActiveAt
          : undefined,
    occurredAt: typeof candidate.occurredAt === 'string' ? candidate.occurredAt : undefined,
  };

  if (
    normalized.isActive === undefined &&
    !normalized.lastSeenAt &&
    !normalized.occurredAt
  ) {
    return null;
  }

  return normalized;
};

const applyPresenceWithGrace = (previous: any, incoming: any, nowMs = Date.now()) => {
  const normalizedIncoming = normalizePresencePayload(incoming);
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
        typeof previous?._pendingOfflineSinceMs === "number"
          ? previous._pendingOfflineSinceMs
          : nowMs,
      _pendingOfflinePresence: {
        ...normalizedIncoming,
        lastSeenAt: normalizedIncoming.lastSeenAt || normalizedIncoming.occurredAt,
      },
    };
  }

  return {
    ...normalizedIncoming,
    lastSeenAt: normalizedIncoming.lastSeenAt || normalizedIncoming.occurredAt,
    _pendingOfflineSinceMs: undefined,
    _pendingOfflinePresence: undefined,
  };
};

const resolveDisplayPresence = (presence: any, nowMs = Date.now()) => {
  if (!presence) {
    return null;
  }

  if (
    presence.isActive === true &&
    typeof presence._pendingOfflineSinceMs === "number" &&
    nowMs - presence._pendingOfflineSinceMs >= PRESENCE_OFFLINE_GRACE_MS
  ) {
    const pending = normalizePresencePayload(presence._pendingOfflinePresence);
    if (pending) {
      return {
        ...pending,
        isActive: false,
        lastSeenAt: pending.lastSeenAt || pending.occurredAt,
      };
    }
  }

  return presence;
};

const isConversationMuted = (mutedUntil: unknown) => {
  if (typeof mutedUntil !== "string" || !mutedUntil.trim()) return false;
  const ts = Date.parse(mutedUntil);
  return !Number.isNaN(ts) && ts > Date.now();
};

const sanitizeConversationPreferencesPayload = (payload: Record<string, unknown>) => {
  const next: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(payload, "isPinned")) {
    next.isPinned = Boolean(payload.isPinned);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "archived")) {
    next.archived = Boolean(payload.archived);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "mutedUntil")) {
    const rawMutedUntil = payload.mutedUntil;

    if (rawMutedUntil === null || rawMutedUntil === "") {
      next.mutedUntil = null;
    } else if (typeof rawMutedUntil === "string") {
      const normalized = rawMutedUntil.trim();
      const ts = Date.parse(normalized);
      if (!Number.isNaN(ts)) {
        next.mutedUntil = new Date(ts).toISOString();
      }
    }
  }

  return next;
};

const buildConversationPreferenceDelta = (
  currentConversation: any,
  payload: Record<string, unknown>,
) => {
  const delta: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'isPinned')) {
    const nextValue = Boolean(payload.isPinned);
    const currentValue = Boolean(currentConversation?.isPinned);
    if (nextValue !== currentValue) {
      delta.isPinned = nextValue;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'archived')) {
    const nextValue = Boolean(payload.archived);
    const currentValue = Boolean(currentConversation?.archived);
    if (nextValue !== currentValue) {
      delta.archived = nextValue;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'mutedUntil')) {
    const nextValue = payload.mutedUntil ?? null;
    const currentValue = currentConversation?.mutedUntil ?? null;
    if (nextValue !== currentValue) {
      delta.mutedUntil = nextValue;
    }
  }

  return delta;
};

export default function ChatListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tabBarHeight = useBottomTabBarHeight();
  const { user: currentUser } = useAuth();
  const currentUserId = String((currentUser as any)?.sub || (currentUser as any)?.id || '');
  const { conversations, loading, error, refresh, hideConversation } = useCitizenInbox();
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [muteOptionsVisible, setMuteOptionsVisible] = useState(false);
  const [dmAvatarByConversationId, setDmAvatarByConversationId] = useState<Record<string, string>>({});
  const [dmPresenceByConversationId, setDmPresenceByConversationId] = useState<Record<string, any>>(() => ({ ...CITIZEN_DM_PRESENCE_CACHE }));
  const [presenceNowMs, setPresenceNowMs] = useState(() => Date.now());
  const [titleBarHeight, setTitleBarHeight] = useState(56);
  const [searchHeaderHeight, setSearchHeaderHeight] = useState(DEFAULT_CHAT_HEADER_HEIGHT - 56);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const searchCollapseDistance = Math.max(searchHeaderHeight, 1);
  const clampedScrollY = useMemo(
    () => Animated.diffClamp(scrollY, 0, searchCollapseDistance),
    [scrollY, searchCollapseDistance],
  );
  const searchRowHeight = useMemo(
    () =>
      clampedScrollY.interpolate({
        inputRange: [
          0,
          searchCollapseDistance * 0.16,
          searchCollapseDistance * 0.72,
          searchCollapseDistance,
        ],
        outputRange: [
          searchHeaderHeight,
          searchHeaderHeight,
          searchHeaderHeight * 0.54,
          0,
        ],
        extrapolate: "clamp",
      }),
    [clampedScrollY, searchCollapseDistance, searchHeaderHeight],
  );
  const searchRowOpacity = useMemo(
    () =>
      clampedScrollY.interpolate({
        inputRange: [
          0,
          searchCollapseDistance * 0.16,
          searchCollapseDistance * 0.5,
          searchCollapseDistance * 0.82,
          searchCollapseDistance,
        ],
        outputRange: [1, 0.98, 0.86, 0.34, 0],
        extrapolate: "clamp",
      }),
    [clampedScrollY, searchCollapseDistance],
  );
  const searchRowTranslateY = useMemo(
    () =>
      clampedScrollY.interpolate({
        inputRange: [0, searchCollapseDistance * 0.68, searchCollapseDistance],
        outputRange: [0, -2, -4],
        extrapolate: "clamp",
      }),
    [clampedScrollY, searchCollapseDistance],
  );
  const searchRowScale = useMemo(
    () =>
      clampedScrollY.interpolate({
        inputRange: [0, searchCollapseDistance * 0.7, searchCollapseDistance],
        outputRange: [1, 0.997, 0.992],
        extrapolate: "clamp",
      }),
    [clampedScrollY, searchCollapseDistance],
  );
  const handleTitleBarLayout = React.useCallback((event: any) => {
    const nextHeight = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    if (nextHeight > 0 && Math.abs(nextHeight - titleBarHeight) > 1) {
      setTitleBarHeight(nextHeight);
    }
  }, [titleBarHeight]);
  const handleSearchHeaderLayout = React.useCallback((event: any) => {
    const nextHeight = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    if (nextHeight > 0 && Math.abs(nextHeight - searchHeaderHeight) > 1) {
      setSearchHeaderHeight(nextHeight);
    }
  }, [searchHeaderHeight]);
  const animatedOnScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: false },
      ),
    [scrollY],
  );

  const openConversation = React.useCallback((conversationId: string) => {
    void prefetchConversationMessages(queryClient, conversationId);

    router.push({
      pathname: "/(citizen)/chat/[id]",
      params: { id: conversationId },
    });
  }, [queryClient, router]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setPresenceNowMs(Date.now());
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  const getConversationSortTimestamp = (item: any) => {
    const candidates = [
      item.lastMessageSentAt,
      item.lastMessageAt,
      item.latestMessageSentAt,
      item.updatedAt,
    ];

    for (const value of candidates) {
      const ts = typeof value === "string" ? Date.parse(value) : NaN;
      if (!Number.isNaN(ts)) {
        return ts;
      }
    }

    return 0;
  };

  const formatConversationTime = (item: any) => {
    const ts = getConversationSortTimestamp(item);
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredConversations = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    let next = conversations.filter((item) => {
      if (!keyword) {
        return true;
      }

      return [item.groupName, item.lastMessagePreview, item.lastSenderName]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });

    return [...next].sort((left, right) => {
      const leftPinned = Boolean(left.isPinned);
      const rightPinned = Boolean(right.isPinned);

      if (leftPinned !== rightPinned) {
        return rightPinned ? 1 : -1;
      }

      return getConversationSortTimestamp(right) - getConversationSortTimestamp(left);
    });
  }, [conversations, searchQuery]);

  useEffect(() => {
    let cancelled = false;

    const loadDmAvatars = async () => {
      const dmItems = conversations.filter((item) => !item.isGroup);
      const targetUserIds = Array.from(
        new Set(
          dmItems
            .map((item) => getDmTargetUserId(item.conversationId, currentUserId))
            .filter((value): value is string => Boolean(value)),
        ),
      );

      if (!targetUserIds.length) {
        if (!cancelled) {
          setDmAvatarByConversationId({});
        }
        return;
      }

      const avatarByUserId: Record<string, string> = {};

      try {
        const friends = (await client.get("/users/me/friends", { params: { limit: 500 } })) as any[];
        for (const friend of Array.isArray(friends) ? friends : []) {
          const friendId = typeof friend?.userId === "string" ? friend.userId : undefined;
          if (!friendId || !targetUserIds.includes(friendId)) continue;
          const friendAvatar = resolveConversationAvatarUrl(friend);
          if (friendAvatar) {
            avatarByUserId[friendId] = friendAvatar;
          }
        }
      } catch {
        // Ignore friend-avatar mapping failures for list fallback.
      }

      // Keep friends-only source for avatar fallback to avoid /users/:id 403 in current backend policy.

      const nextMap: Record<string, string> = {};
      for (const item of dmItems) {
        const userId = getDmTargetUserId(item.conversationId, currentUserId);
        if (!userId) continue;
        const avatar = avatarByUserId[userId];
        if (avatar) {
          nextMap[item.conversationId] = avatar;
        }
      }

      if (!cancelled) {
        setDmAvatarByConversationId(nextMap);
      }
    };

    void loadDmAvatars();

    return () => {
      cancelled = true;
    };
  }, [conversations, currentUserId]);

  useEffect(() => {
    const dmItems = conversations.filter((item) => !item.isGroup);

    if (!dmItems.length) {
      return;
    }

    const summaryMap: Record<string, any> = {};
    for (const item of dmItems) {
      const normalized = normalizePresencePayload({
        isActive: (item as any).peerIsActive ?? (item as any).isActive,
        lastSeenAt: (item as any).peerLastSeenAt ?? (item as any).lastSeenAt,
      });

      if (normalized) {
        summaryMap[item.conversationId] = normalized;
      }
    }

    setDmPresenceByConversationId((prev) => {
      const nextMap: Record<string, any> = {};
      for (const item of dmItems) {
        const conversationId = item.conversationId;
        const existing = prev[conversationId];
        const fallback = summaryMap[conversationId];
        nextMap[conversationId] = fallback
          ? applyPresenceWithGrace(existing, fallback)
          : existing || null;
      }
      return nextMap;
    });

  }, [conversations]);

  useEffect(() => {
    const dmTargets = conversations
      .filter((item) => !item.isGroup)
      .map((item) => ({
        conversationId: item.conversationId,
        userId: getDmTargetUserId(item.conversationId, currentUserId),
      }))
      .filter((item): item is { conversationId: string; userId: string } => Boolean(item.userId));

    if (!dmTargets.length) {
      return;
    }

    let cancelled = false;

    const loadPresence = async () => {
      const results = await Promise.all(
        dmTargets.map(async (item) => {
          try {
            const presence = await getUserPresence(item.userId);
            const normalized = normalizePresencePayload(presence);
            return normalized
              ? { conversationId: item.conversationId, presence: normalized }
              : null;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setDmPresenceByConversationId((prev) => {
        const next = { ...prev };
        for (const result of results) {
          if (!result) continue;
          next[result.conversationId] = applyPresenceWithGrace(
            prev[result.conversationId],
            result.presence,
          );
        }
        return next;
      });
    };

    void loadPresence();

    return () => {
      cancelled = true;
    };
  }, [conversations, currentUserId]);

  useEffect(() => {
    Object.assign(CITIZEN_DM_PRESENCE_CACHE, dmPresenceByConversationId);
  }, [dmPresenceByConversationId]);

  useEffect(() => {
    const dmItems = conversations.filter((item) => !item.isGroup);

    if (!dmItems.length) {
      return;
    }

    let cancelled = false;
    if (!currentUserId) {
      return;
    }

    const conversationIdByKey = new Map<string, string>();
    const peerUserIdByConversationId = new Map<string, string>();
    const joinedConversationIds = new Set<string>();

    for (const item of dmItems) {
      const peerUserId = getDmTargetUserId(item.conversationId, currentUserId);
      if (peerUserId) {
        peerUserIdByConversationId.set(item.conversationId, peerUserId);
      }
    }

    const normalizeSocketPresence = (presence: any) => normalizePresencePayload({
      isActive: presence?.isActive,
      lastSeenAt: presence?.lastSeenAt,
      occurredAt: presence?.occurredAt,
    });

    const handlePresenceSnapshot = (event: any) => {
      const conversationId = conversationIdByKey.get(String(event?.conversationKey || ''));
      if (!conversationId) return;

      const peerUserId = peerUserIdByConversationId.get(conversationId);
      const participant =
        (event?.participants || []).find((entry: any) => String(entry?.userId || '') === String(peerUserId || '')) ||
        (event?.participants || []).find((entry: any) => String(entry?.userId || '') !== currentUserId);
      const normalized = normalizeSocketPresence(participant);

      if (normalized) {
        setDmPresenceByConversationId((prev) => ({
          ...prev,
          [conversationId]: applyPresenceWithGrace(prev[conversationId], normalized),
        }));
      }
    };

    const handlePresenceUpdated = (event: any) => {
      const conversationId = conversationIdByKey.get(String(event?.conversationKey || ''));
      if (!conversationId) return;

      const peerUserId = peerUserIdByConversationId.get(conversationId);

      if (peerUserId && String(event?.presence?.userId || '') !== String(peerUserId)) {
        return;
      }

      if (!peerUserId && String(event?.presence?.userId || '') === currentUserId) {
        return;
      }

      const normalized = normalizeSocketPresence(event.presence);

      if (normalized) {
        setDmPresenceByConversationId((prev) => ({
          ...prev,
          [conversationId]: applyPresenceWithGrace(prev[conversationId], normalized),
        }));
      }
    };

    const joinAllPresenceRooms = async () => {
      conversationIdByKey.clear();

      for (const item of dmItems) {
        try {
          const joined = await socketClient.emitWithAck<{ conversationKey: string }>(
            CHAT_SOCKET_EVENTS.CONVERSATION_JOIN,
            { conversationId: item.conversationId },
          );

          if (cancelled) {
            break;
          }

          const conversationKey = String(joined?.conversationKey || '');
          if (conversationKey) {
            conversationIdByKey.set(conversationKey, item.conversationId);
          }
          joinedConversationIds.add(item.conversationId);
        } catch {
          // Ignore per-room join failures in list context.
        }
      }
    };

    const handleSocketConnect = () => {
      void joinAllPresenceRooms();
    };

    const setup = async () => {
      try {
        await socketClient.connect();
      } catch {
        return;
      }

      socketClient.on(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
      socketClient.on(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, handlePresenceUpdated);
      socketClient.on('connect', handleSocketConnect);

      await joinAllPresenceRooms();
    };

    void setup();

    return () => {
      cancelled = true;
      socketClient.off(CHAT_SOCKET_EVENTS.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
      socketClient.off(CHAT_SOCKET_EVENTS.PRESENCE_UPDATED, handlePresenceUpdated);
      socketClient.off('connect', handleSocketConnect);
    };
  }, [conversations, currentUserId]);

  const openSettings = (item: any) => {
    setSelectedConversation(item);
    setSettingsVisible(true);
  };

  const closeSettings = () => {
    setSettingsVisible(false);
    setMuteOptionsVisible(false);
    setSelectedConversation(null);
  };

  const openMuteOptions = () => {
    setMuteOptionsVisible(true);
  };

  const closeMuteOptions = () => {
    setMuteOptionsVisible(false);
  };

  const patchPreferences = async (payload: Record<string, unknown>) => {
    if (!selectedConversation) return;
    setIsUpdatingSettings(true);
    try {
      const deltaPayload = buildConversationPreferenceDelta(selectedConversation, payload);
      const sanitizedPayload = sanitizeConversationPreferencesPayload(deltaPayload);

      if (Object.keys(sanitizedPayload).length === 0) {
        closeSettings();
        return;
      }

      await updateConversationPreferences(selectedConversation.conversationId, sanitizedPayload);
      closeSettings();
      await refresh();
    } catch (error: any) {
      alert(error?.message || "Không thể cập nhật cài đặt hội thoại.");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleTogglePin = async () => {
    if (!selectedConversation) return;
    await patchPreferences({ isPinned: !(selectedConversation.isPinned ?? false) });
  };

  const handleMuteForHours = async (hours: number) => {
    if (!selectedConversation) return;
    const mutedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await patchPreferences({ mutedUntil });
  };

  const handleMuteUntilManual = async () => {
    if (!selectedConversation) return;
    const mutedUntil = "2099-12-31T23:59:59.999Z";
    await patchPreferences({ mutedUntil });
  };

  const handleUnmute = async () => {
    if (!selectedConversation) return;
    await patchPreferences({ mutedUntil: null });
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return;
    const conversationId = selectedConversation.conversationId;
    setIsUpdatingSettings(true);
    try {
      await deleteConversation(conversationId);
      hideConversation(conversationId);
      closeSettings();
      await refresh();
    } catch (error: any) {
      alert(error?.message || "Không thể xóa cuộc trò chuyện.");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.floatingHeader}>
        <View onLayout={handleTitleBarLayout} style={styles.floatingHeaderInner}>
          <View style={[styles.headerTop, styles.headerTopMessenger]}>
            <Text style={styles.headerTitle}>Chat</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tìm người để chat"
              onPress={() => router.push("/(citizen)/chat/search" as any)}
              style={({ pressed }) => [styles.headerAction, pressed ? styles.pressed : null]}
            >
              <Ionicons name="create-outline" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </View>

      {loading ? (
        <View
          style={[
            styles.skeletonWrap,
            styles.stateWrap,
            { paddingTop: titleBarHeight + 12, paddingBottom: tabBarHeight + 20 },
          ]}
        >
          <ListSkeleton count={7} />
        </View>
      ) : error ? (
        <View
          style={[
            styles.stateWrap,
            styles.errorWrap,
            { paddingTop: titleBarHeight + 12, paddingBottom: tabBarHeight + 20 },
          ]}
        >
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <Animated.FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.conversationId}
          ListHeaderComponent={
            <Animated.View
              style={[
                styles.searchHeaderAnimated,
                {
                  height: searchRowHeight,
                  opacity: searchRowOpacity,
                  transform: [{ translateY: searchRowTranslateY }, { scale: searchRowScale }],
                },
              ]}
            >
              <View onLayout={handleSearchHeaderLayout} style={styles.searchSection}>
                <View style={styles.searchField}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Mở Meta AI"
                    onPress={openAiChatbot}
                    style={({ pressed }) => [styles.searchAiButton, pressed ? styles.pressed : null]}
                  >
                    <Ionicons name="sparkles" size={20} color={colors.secondary} />
                  </Pressable>
                  <TextInput
                    placeholder="Hỏi Meta AI hoặc tìm kiếm"
                    placeholderTextColor="#6b7280"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    selectionColor={colors.secondary}
                    style={styles.searchInput}
                  />
                </View>
              </View>
            </Animated.View>
          }
          onScroll={animatedOnScroll}
          scrollEventThrottle={8}
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: titleBarHeight, paddingBottom: tabBarHeight + 20 },
          ]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== "web"}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          renderItem={({ item }) => {
            const displayPresence = !item.isGroup
              ? resolveDisplayPresence(dmPresenceByConversationId[item.conversationId], presenceNowMs)
              : null;
            const presenceLabel = !item.isGroup
              ? formatPresenceLabel(displayPresence, presenceNowMs)
              : "";
            const avatarUrl =
              resolveConversationAvatarUrl(item) || dmAvatarByConversationId[item.conversationId];
            const unreadCount = Number(item.unreadCount || 0);
            const previewText = item.lastMessagePreview || presenceLabel || "Bắt đầu trò chuyện...";

            return (
              <Pressable
                onPress={() => openConversation(item.conversationId)}
                onLongPress={() => openSettings(item)}
                delayLongPress={260}
                style={({ pressed }) => [styles.chatRow, pressed ? styles.chatRowPressed : null]}
              >
                <View style={styles.avatarContainer}>
                  {avatarUrl ? (
                    <Avatar.Image
                      size={46}
                      source={{ uri: avatarUrl }}
                      style={{ backgroundColor: colors.surface }}
                    />
                  ) : (
                    <Avatar.Icon
                      icon={item.isGroup ? "account-group" : "account"}
                      size={46}
                      style={{ backgroundColor: colors.surface }}
                    />
                  )}
                  {!item.isGroup && displayPresence?.isActive ? <View style={styles.onlineDot} /> : null}
                </View>

                <View style={styles.chatBody}>
                  <View style={styles.messageColumn}>
                    <View style={styles.nameLine}>
                      <Text
                        style={[styles.title, unreadCount > 0 ? styles.titleUnread : null]}
                        numberOfLines={1}
                      >
                        {item.groupName || "Hội thoại"}
                      </Text>
                      {item.isPinned ? (
                        <Ionicons name="bookmark" size={11} color={colors.secondary} style={styles.inlineIcon} />
                      ) : null}
                    </View>
                    <Text
                      style={[styles.preview, unreadCount > 0 ? styles.previewUnread : null]}
                      numberOfLines={1}
                    >
                      {previewText}
                    </Text>
                  </View>

                  <View style={styles.metaColumn}>
                    <Text style={styles.timeText} numberOfLines={1}>
                      {formatConversationTime(item)}
                    </Text>
                    <View style={styles.statusRow}>
                      {isConversationMuted(item.mutedUntil) ? (
                        <Ionicons name="notifications-off-outline" size={13} color={colors.muted} />
                      ) : null}
                      {unreadCount > 0 ? (
                        <Badge size={18} style={styles.unreadBadge}>
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                      ) : (
                        <Ionicons name="checkmark-done" size={15} color={colors.muted} />
                      )}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-ellipses-outline" size={42} color={colors.border} />
              <Text style={styles.empty}>Chưa có cuộc hội thoại nào.</Text>
            </View>
          }
        />
      )}

      <Portal>
        <Modal
          visible={settingsVisible}
          onDismiss={closeSettings}
          style={styles.settingsModalSheet}
          contentContainerStyle={styles.settingsModalContainer}
        >
          <Text style={styles.settingsTitle}>Cài đặt hội thoại</Text>
          <Text style={styles.settingsSubtitle} numberOfLines={1}>
            {selectedConversation?.groupName || selectedConversation?.conversationId}
          </Text>

          <Button mode="text" icon="pin-outline" onPress={handleTogglePin} disabled={isUpdatingSettings}>
            {selectedConversation?.isPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"}
          </Button>
          <Button mode="text" icon="bell-off-outline" onPress={openMuteOptions} disabled={isUpdatingSettings}>
            {isConversationMuted(selectedConversation?.mutedUntil) ? "Tùy chỉnh tắt thông báo" : "Tắt thông báo"}
          </Button>
          {muteOptionsVisible ? (
            <View style={styles.muteOptionsBox}>
              <Button mode="text" icon="bell-off-outline" onPress={() => handleMuteForHours(1)} disabled={isUpdatingSettings}>
                Tắt 1 giờ
              </Button>
              <Button mode="text" icon="bell-off-outline" onPress={() => handleMuteForHours(4)} disabled={isUpdatingSettings}>
                Tắt 4 giờ
              </Button>
              <Button mode="text" icon="bell-off-outline" onPress={handleMuteUntilManual} disabled={isUpdatingSettings}>
                Tắt đến khi mở lại
              </Button>
              <Button mode="text" icon="bell-ring-outline" onPress={handleUnmute} disabled={isUpdatingSettings}>
                Bật thông báo
              </Button>
              <Button mode="text" onPress={closeMuteOptions} disabled={isUpdatingSettings}>
                Đóng tùy chọn
              </Button>
            </View>
          ) : null}
          <Button mode="text" icon="delete-outline" onPress={handleDeleteConversation} disabled={isUpdatingSettings} textColor="#b91c1c">
            Xóa cuộc trò chuyện
          </Button>

          <Button mode="contained" style={{ marginTop: 8 }} onPress={closeSettings} disabled={isUpdatingSettings}>
            Đóng
          </Button>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  floatingHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 30,
  },
  floatingHeaderInner: {
    backgroundColor: colors.card,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 10,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchHeaderAnimated: {
    overflow: "hidden",
    backgroundColor: colors.card,
    marginTop: 0,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTopMessenger: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 0,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
  },
  headerLeft: { display: "none" },
  headerRow: { display: "none" },
  headerActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActionDark: {
    display: "none",
  },
  pressed: {
    opacity: 0.58,
  },
  searchField: {
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f0f4",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingRight: 14,
  },
  searchAiButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    flex: 1,
    height: 40,
    marginLeft: 6,
    padding: 0,
    color: colors.text,
    fontSize: 15,
    fontWeight: "400",
  },
  filterRow: {
    display: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  filterChip: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f2f4",
  },
  filterChipActive: {
    backgroundColor: "rgba(10,207,254,0.14)",
  },
  filterChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: colors.secondary,
  },
  skeletonWrap: {
    backgroundColor: colors.card,
  },
  stateWrap: {
    flex: 1,
    paddingHorizontal: 16,
  },
  errorWrap: {
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 0,
    paddingBottom: 8,
  },
  chatRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chatRowPressed: {
    backgroundColor: "#eef2f7",
  },
  avatarContainer: { position: "relative" },
  onlineDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  chatBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 11,
    minWidth: 0,
  },
  messageColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  nameLine: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 17,
  },
  titleUnread: { fontWeight: "700" },
  inlineIcon: {
    marginLeft: 5,
    marginTop: 1,
  },
  preview: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0,
    lineHeight: 15,
  },
  previewUnread: {
    color: colors.text,
    fontWeight: "700",
  },
  metaColumn: {
    width: 48,
    alignItems: "flex-end",
    alignSelf: "stretch",
    justifyContent: "center",
  },
  timeText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 12,
  },
  statusRow: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 7,
  },
  unreadBadge: {
    minWidth: 18,
    paddingHorizontal: 4,
    backgroundColor: colors.secondary,
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
  },
  settingsModalSheet: {
    justifyContent: "flex-end",
    margin: 0,
  },
  settingsModalContainer: {
    backgroundColor: colors.card,
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  settingsSubtitle: {
    color: colors.textSecondary,
    marginBottom: 8,
  },
  muteOptionsBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 8,
  },
  error: { color: colors.danger, textAlign: "center", marginTop: 12 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 70,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center",
  },
 
});



