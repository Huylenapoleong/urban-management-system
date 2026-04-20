import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View, TouchableOpacity, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { Avatar, Badge, Card, Divider, IconButton, Searchbar, SegmentedButtons, Portal, Modal, Button } from "react-native-paper";
import colors from "@/constants/colors";
import { useCitizenInbox } from "@/features/chat/citizen/useCitizenInbox";
import { useAuth } from "@/providers/AuthProvider";
import client from "@/services/api/client";
import { convertToS3Url } from "@/constants/s3";
import { socketClient } from "@/lib/socket-client";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";

const PRESENCE_OFFLINE_GRACE_MS = 120000;
const CITIZEN_DM_PRESENCE_CACHE: Record<string, any> = {};

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

const getDmTargetUserId = (conversationId: string | undefined): string | undefined => {
  if (!conversationId || typeof conversationId !== "string") return undefined;
  if (!conversationId.startsWith("dm:")) return undefined;
  const targetId = conversationId.slice(3).trim();
  return targetId || undefined;
};

const formatPresenceLabel = (
  presence?: { isActive?: boolean; lastSeenAt?: string; occurredAt?: string } | null,
  nowMs = Date.now(),
): string => {
  if (presence?.isActive === true) {
    return 'Đang hoạt động';
  }

  if (presence?.isActive === false) {
    const ts = Date.parse(String(presence.lastSeenAt || presence.occurredAt || ''));
    if (!Number.isNaN(ts)) {
      const diffMinutes = Math.max(0, Math.floor((nowMs - ts) / 60000));
      return `Hoạt động ${diffMinutes} phút trước`;
    }
  }

  return '';
};

const normalizePresencePayload = (raw: any): { isActive?: boolean; lastSeenAt?: string; occurredAt?: string } | null => {
  const candidate = raw?.presence || raw?.data?.presence || raw?.data || raw;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  return {
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

const resolveConversationPathId = (conversationId: string) => {
  return conversationId.includes("#") ? encodeURIComponent(conversationId) : conversationId;
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
  const tabBarHeight = useBottomTabBarHeight();
  const { user: currentUser } = useAuth();
  const currentUserId = String((currentUser as any)?.sub || (currentUser as any)?.id || '');
  const { conversations, loading, error, refresh } = useCitizenInbox();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("ALL");
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [muteOptionsVisible, setMuteOptionsVisible] = useState(false);
  const [dmAvatarByConversationId, setDmAvatarByConversationId] = useState<Record<string, string>>({});
  const [dmPresenceByConversationId, setDmPresenceByConversationId] = useState<Record<string, any>>(() => ({ ...CITIZEN_DM_PRESENCE_CACHE }));
  const [presenceNowMs, setPresenceNowMs] = useState(() => Date.now());

  const openConversation = React.useCallback((conversationId: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.replace(`/chat/${encodeURIComponent(conversationId)}`);
      return;
    }

    router.push({
      pathname: "/(citizen)/chat/[id]",
      params: { id: conversationId },
    });
  }, [router]);

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

    if (filterMode === "GROUP") {
      next = next.filter((item) => item.isGroup);
    }

    if (filterMode === "PRIVATE") {
      next = next.filter((item) => !item.isGroup);
    }

    return [...next].sort((left, right) => {
      const leftPinned = Boolean(left.isPinned);
      const rightPinned = Boolean(right.isPinned);

      if (leftPinned !== rightPinned) {
        return rightPinned ? 1 : -1;
      }

      return getConversationSortTimestamp(right) - getConversationSortTimestamp(left);
    });
  }, [conversations, filterMode, searchQuery]);

  useEffect(() => {
    let cancelled = false;

    const loadDmAvatars = async () => {
      const dmItems = conversations.filter((item) => !item.isGroup);
      const targetUserIds = Array.from(
        new Set(
          dmItems
            .map((item) => getDmTargetUserId(item.conversationId))
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
        const userId = getDmTargetUserId(item.conversationId);
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
  }, [conversations]);

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
        nextMap[conversationId] = existing || fallback || null;
      }
      return nextMap;
    });

  }, [conversations]);

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
      const peerUserId = getDmTargetUserId(item.conversationId);
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

      await client.patch(
        `/conversations/${resolveConversationPathId(selectedConversation.conversationId)}/preferences`,
        sanitizedPayload,
      );
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

  const handleToggleMute = async () => {
    if (!selectedConversation) return;
    const mutedUntil = isConversationMuted(selectedConversation.mutedUntil)
      ? null
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await patchPreferences({ mutedUntil });
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
    setIsUpdatingSettings(true);
    try {
      await client.delete(`/conversations/${resolveConversationPathId(selectedConversation.conversationId)}`);
      closeSettings();
      await refresh();
    } catch (error: any) {
      alert(error?.message || "Không thể xóa cuộc trò chuyện.");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Tin nhắn</Text>
        </View>
        <Searchbar
          placeholder="Tìm kiếm cuộc hội thoại..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
        />
        <View style={styles.filterRow}>
          <SegmentedButtons
            value={filterMode}
            onValueChange={setFilterMode}
            buttons={[
              { value: "ALL", label: "Tất cả" },
              { value: "GROUP", label: "Nhóm" },
              { value: "PRIVATE", label: "Cá nhân" },
            ]}
            density="small"
          />
        </View>
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.conversationId}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <Divider style={{ marginHorizontal: 16 }} />}
          renderItem={({ item }) => {
            const displayPresence = !item.isGroup
              ? resolveDisplayPresence(dmPresenceByConversationId[item.conversationId], presenceNowMs)
              : null;
            const presenceLabel = !item.isGroup
              ? formatPresenceLabel(displayPresence, presenceNowMs)
              : '';

            const avatarUrl =
              resolveConversationAvatarUrl(item) || dmAvatarByConversationId[item.conversationId];

            return (
              <Card style={styles.chatCard} mode="elevated" elevation={1}>
                <View style={styles.cardContent}>
                  <TouchableOpacity
                    style={styles.chatMainPressable}
                    activeOpacity={0.8}
                    onPress={() => openConversation(item.conversationId)}
                  >
                    <View style={styles.avatarContainer}>
                      {avatarUrl ? (
                        <Avatar.Image
                          size={48}
                          source={{ uri: avatarUrl }}
                          style={{ backgroundColor: item.isGroup ? "#e8efff" : "#eafbf0" }}
                        />
                      ) : (
                        <Avatar.Icon
                          icon={item.isGroup ? "account-group" : "account"}
                          size={48}
                          style={{ backgroundColor: item.isGroup ? "#e8efff" : "#eafbf0" }}
                        />
                      )}
                      {!item.isGroup && displayPresence?.isActive ? (
                        <View style={styles.onlineDot} />
                      ) : null}
                      {item.unreadCount > 0 ? <Badge style={styles.badge}>{item.unreadCount}</Badge> : null}
                    </View>
                    <View style={styles.textWrap}>
                      <View style={styles.titleRow}>
                        <View style={styles.nameWithPresenceWrap}>
                          <Text style={[styles.title, item.unreadCount > 0 ? styles.titleUnread : null]} numberOfLines={1}>
                            {item.groupName || "Hội thoại"}
                          </Text>
                          {presenceLabel ? (
                            <Text
                              style={[
                                styles.presenceInline,
                                displayPresence?.isActive ? styles.presenceInlineActive : null,
                              ]}
                              numberOfLines={1}
                            >
                              {presenceLabel}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.timeWrap}>
                          {isConversationMuted(item.mutedUntil) ? (
                            <Ionicons name="notifications-off-outline" size={14} color={colors.textSecondary} style={styles.muteIcon} />
                          ) : null}
                          <Text style={styles.timeText}>{formatConversationTime(item)}</Text>
                        </View>
                      </View>
                      <Text style={[styles.preview, item.unreadCount > 0 ? styles.previewUnread : null]} numberOfLines={1}>
                        {[
                          item.lastMessagePreview || "Bắt đầu trò chuyện...",
                        ].filter(Boolean).join(' • ')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <IconButton icon="dots-vertical" size={20} style={styles.settingsBtn} onPress={() => openSettings(item)} />
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Chưa có cuộc hội thoại nào.</Text>}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.text,
  },
  searchBar: {
    borderRadius: 12,
    backgroundColor: "#f2f5f9",
  },
  filterRow: { marginTop: 10 },
  loader: { marginTop: 16 },
  chatCard: {
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  chatMainPressable: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatarContainer: { position: "relative" },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  textWrap: { flex: 1, marginLeft: 12 },
  nameWithPresenceWrap: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  presenceInline: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  presenceInlineActive: {
    color: "#16a34a",
    fontWeight: "700",
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },
  titleUnread: { fontWeight: "900" },
  timeText: {
    marginLeft: 8,
    color: colors.textSecondary,
    fontSize: 12,
  },
  timeWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  muteIcon: {
    marginRight: 2,
  },
  preview: { color: colors.textSecondary, fontSize: 14 },
  previewUnread: { color: colors.text, fontWeight: "700" },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#E53935",
  },
  settingsBtn: {
    margin: 0,
    marginLeft: 4,
  },
  settingsModalSheet: {
    justifyContent: "flex-end",
    margin: 0,
  },
  settingsModalContainer: {
    backgroundColor: "#fff",
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
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 8,
  },
  error: { color: colors.danger, textAlign: "center", marginTop: 12 },
  empty: { color: colors.textSecondary, textAlign: "center", marginTop: 12 },
});
