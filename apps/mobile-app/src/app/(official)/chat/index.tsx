import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Text, Avatar, Badge, Searchbar, Divider, SegmentedButtons, IconButton, Card, Portal, Modal, Button } from 'react-native-paper';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useConversations, type ConversationSummaryItem } from '../../../hooks/shared/useConversations';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ApiClient } from '../../../lib/api-client';
import { useAuth } from '../../../providers/AuthProvider';
import { socketClient } from '../../../lib/socket-client';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import { convertToS3Url } from '../../../constants/s3';
import { ListSkeleton, useSkeletonQuery } from '@/components/skeleton/Skeleton';
import { prefetchConversationMessages } from '@/services/prefetch';
import colors from '@/constants/colors';

const PRESENCE_OFFLINE_GRACE_MS = 120000;
const OFFICIAL_DM_PRESENCE_CACHE: Record<string, any> = {};

const getDmTargetUserId = (conversationId: string | undefined): string | undefined => {
  if (!conversationId || typeof conversationId !== 'string') return undefined;
  if (!conversationId.startsWith('dm:')) return undefined;
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
        typeof previous?._pendingOfflineSinceMs === 'number'
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
    typeof presence._pendingOfflineSinceMs === 'number' &&
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

const resolveConversationAvatarUrl = (item: ConversationSummaryItem): string | undefined => {
  const candidates = [
    (item as any).groupAvatarUrl,
    (item as any).peerAvatarUrl,
    (item as any).targetAvatarUrl,
    (item as any).avatarUrl,
    (item as any).avatarAsset?.resolvedUrl,
    (item as any).groupAvatarAsset?.resolvedUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return convertToS3Url(candidate.trim());
    }
  }

  return undefined;
};

const sanitizeConversationPreferencesPayload = (payload: Record<string, unknown>) => {
  const next: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'isPinned')) {
    next.isPinned = Boolean(payload.isPinned);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'archived')) {
    next.archived = Boolean(payload.archived);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'mutedUntil')) {
    const rawMutedUntil = payload.mutedUntil;

    if (rawMutedUntil === null || rawMutedUntil === '') {
      next.mutedUntil = null;
    } else if (typeof rawMutedUntil === 'string') {
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

const isConversationMuted = (mutedUntil: unknown) => {
  if (typeof mutedUntil !== 'string' || !mutedUntil.trim()) return false;
  const ts = Date.parse(mutedUntil);
  return !Number.isNaN(ts) && ts > Date.now();
};

const resolveConversationPathId = (conversationId: string) => {
  return conversationId.includes('#') ? encodeURIComponent(conversationId) : conversationId;
};

export default function ChatListScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const currentUserId = String((currentUser as any)?.sub || (currentUser as any)?.id || '');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('ALL');
  const [selectedConversation, setSelectedConversation] = useState<ConversationSummaryItem | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [muteOptionsVisible, setMuteOptionsVisible] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [dmPresenceByConversationId, setDmPresenceByConversationId] = useState<Record<string, any>>(() => ({ ...OFFICIAL_DM_PRESENCE_CACHE }));
  const [presenceNowMs, setPresenceNowMs] = useState(() => Date.now());
  const { data: conversations, isLoading, isFetching, isRefetching, refetch } = useConversations({ q: searchQuery || undefined });
  const { isFirstLoad, isRefreshing } = useSkeletonQuery({ data: conversations, isLoading, isFetching, isRefetching });

  const openConversation = useCallback((conversationId: string) => {
    void prefetchConversationMessages(queryClient, conversationId);

    router.push({
      pathname: '/(official)/chat/[id]',
      params: { id: conversationId },
    } as any);
  }, [queryClient, router]);
  
  // Refresh list whenever screen is focused (user comes back from chat)
  useFocusEffect(
    useCallback(() => {
      const hasConversationCache = queryClient
        .getQueriesData({ queryKey: ['conversations'] })
        .some(([, data]) => Array.isArray(data));

      if (!hasConversationCache) {
        refetch();
      }
    }, [queryClient, refetch])
  );

  React.useEffect(() => {
    let cancelled = false;

    const handleConversationUpdated = (event: any) => {
      if (!event?.summary?.conversationId) {
        return;
      }

      queryClient.setQueriesData<ConversationSummaryItem[]>(
        { queryKey: ['conversations'] },
        (current) => {
          if (!Array.isArray(current)) {
            return current;
          }

          const index = current.findIndex((item) => item.conversationId === event.summary.conversationId);
          if (index === -1) {
            return [event.summary, ...current];
          }

          const next = [...current];
          next[index] = event.summary;
          return next;
        },
      );
    };

    const handleConversationRemoved = (event: any) => {
      if (!event?.conversationId) {
        return;
      }

      queryClient.setQueriesData<ConversationSummaryItem[]>(
        { queryKey: ['conversations'] },
        (current) =>
          Array.isArray(current)
            ? current.filter((item) => item.conversationId !== event.conversationId)
            : current,
      );
    };

    void socketClient.connect().then(() => {
      if (cancelled) {
        return;
      }

      socketClient.on(CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED, handleConversationUpdated);
      socketClient.on(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);
    }).catch(() => {});

    return () => {
      cancelled = true;
      socketClient.off(CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED, handleConversationUpdated);
      socketClient.off(CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED, handleConversationRemoved);
    };
  }, [queryClient]);

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      setPresenceNowMs(Date.now());
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    const sourceConversations = Array.isArray(conversations) ? conversations : [];
    const dmItems = sourceConversations.filter((item) => !item.isGroup);
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

  React.useEffect(() => {
    Object.assign(OFFICIAL_DM_PRESENCE_CACHE, dmPresenceByConversationId);
  }, [dmPresenceByConversationId]);

  React.useEffect(() => {
    const sourceConversations = Array.isArray(conversations) ? conversations : [];
    const dmItems = sourceConversations.filter((item) => !item.isGroup);

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

  const getConversationSortTimestamp = useCallback((item: ConversationSummaryItem) => {
    const candidates = [
      (item as any).lastMessageSentAt,
      (item as any).lastMessageAt,
      (item as any).latestMessageSentAt,
      item.updatedAt,
    ];

    for (const value of candidates) {
      const time = typeof value === 'string' ? Date.parse(value) : NaN;
      if (!Number.isNaN(time)) return time;
    }

    return 0;
  }, []);

  const formatConversationTime = useCallback((item: ConversationSummaryItem) => {
    const timestamp = getConversationSortTimestamp(item);
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }, [getConversationSortTimestamp]);

  const sortedConversations = React.useMemo(() => {
    if (!conversations) return [];
    if (!Array.isArray(conversations)) {
      return [];
    }
    let filtered = [...conversations];
    
    // Deduplicate by conversationId to prevent FlatList key warnings
    const uniqueMap = new Map<string, ConversationSummaryItem>();
    for (const conv of filtered) {
      const existing = uniqueMap.get(conv.conversationId);
      if (!existing || getConversationSortTimestamp(conv) >= getConversationSortTimestamp(existing)) {
        uniqueMap.set(conv.conversationId, conv);
      }
    }
    filtered = Array.from(uniqueMap.values());

    if (filterMode === 'GROUP') {
      filtered = filtered.filter(c => c.isGroup);
    } else if (filterMode === 'PRIVATE') {
      filtered = filtered.filter(c => !c.isGroup);
    }

    const sorted = filtered.sort((a, b) => {
      const aPinned = Boolean(a.isPinned);
      const bPinned = Boolean(b.isPinned);

      if (aPinned !== bPinned) {
        return bPinned ? 1 : -1;
      }

      return getConversationSortTimestamp(b) - getConversationSortTimestamp(a);
    });
    return sorted;
  }, [conversations, filterMode, getConversationSortTimestamp]);

  const handlePress = useCallback((id: string) => {
    if (!id) {
      return;
    }
    openConversation(id);
  }, [openConversation]);

  const openConversationSettings = useCallback((item: ConversationSummaryItem) => {
    setSelectedConversation(item);
    setSettingsVisible(true);
  }, []);

  const closeConversationSettings = useCallback(() => {
    setSettingsVisible(false);
    setMuteOptionsVisible(false);
    setSelectedConversation(null);
  }, []);

  const openMuteOptions = useCallback(() => {
    setMuteOptionsVisible(true);
  }, []);

  const closeMuteOptions = useCallback(() => {
    setMuteOptionsVisible(false);
  }, []);

  const updateConversationPreference = useCallback(async (payload: Record<string, unknown>) => {
    if (!selectedConversation) return;
    setIsUpdatingSettings(true);
    try {
      const deltaPayload = buildConversationPreferenceDelta(selectedConversation, payload);
      const sanitizedPayload = sanitizeConversationPreferencesPayload(deltaPayload);

      if (Object.keys(sanitizedPayload).length === 0) {
        closeConversationSettings();
        return;
      }

      await ApiClient.patch(
        `/conversations/${resolveConversationPathId(selectedConversation.conversationId)}/preferences`,
        sanitizedPayload,
      );
      closeConversationSettings();
      refetch();
    } catch (error: any) {
      // Keep message concise to avoid noisy settings UX.
      alert(error?.message || 'Không thể cập nhật cài đặt hội thoại.');
    } finally {
      setIsUpdatingSettings(false);
    }
  }, [closeConversationSettings, refetch, selectedConversation]);

  const handleDeleteConversation = useCallback(async () => {
    if (!selectedConversation) return;
    setIsUpdatingSettings(true);
    try {
      await ApiClient.delete(`/conversations/${resolveConversationPathId(selectedConversation.conversationId)}`);
      closeConversationSettings();
      refetch();
    } catch (error: any) {
      alert(error?.message || 'Không thể xóa cuộc trò chuyện.');
    } finally {
      setIsUpdatingSettings(false);
    }
  }, [closeConversationSettings, refetch, selectedConversation]);

  const handleToggleMute = useCallback(async () => {
    if (!selectedConversation) return;
    const mutedUntil = isConversationMuted(selectedConversation.mutedUntil)
      ? null
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await updateConversationPreference({ mutedUntil });
  }, [selectedConversation, updateConversationPreference]);

  const handleMuteForHours = useCallback(async (hours: number) => {
    if (!selectedConversation) return;
    const mutedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await updateConversationPreference({ mutedUntil });
  }, [selectedConversation, updateConversationPreference]);

  const handleMuteUntilManual = useCallback(async () => {
    if (!selectedConversation) return;
    await updateConversationPreference({ mutedUntil: '2099-12-31T23:59:59.999Z' });
  }, [selectedConversation, updateConversationPreference]);

  const handleUnmute = useCallback(async () => {
    if (!selectedConversation) return;
    await updateConversationPreference({ mutedUntil: null });
  }, [selectedConversation, updateConversationPreference]);

  const handleTogglePin = useCallback(async () => {
    if (!selectedConversation) return;
    await updateConversationPreference({ isPinned: !(selectedConversation.isPinned ?? false) });
  }, [selectedConversation, updateConversationPreference]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header / Search */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text variant="headlineSmall" style={styles.headerTitle}>Tin nhắn</Text>
        </View>
        <Searchbar
          placeholder="Tìm kiếm cuộc hội thoại..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
        <View style={styles.filterRow}>
          <SegmentedButtons
            value={filterMode}
            onValueChange={setFilterMode}
            buttons={[
              { value: 'ALL', label: 'Tất cả' },
              { value: 'GROUP', label: 'Nhóm' },
              { value: 'PRIVATE', label: 'Cá nhân' },
            ]}
            density="small"
          />
        </View>
      </View>

      {/* List */}
      {isFirstLoad ? (
        <ListSkeleton count={7} />
      ) : (
        <FlatList
          data={sortedConversations}
          keyExtractor={item => item.conversationId}
          onRefresh={refetch}
          refreshing={isRefreshing}
          removeClippedSubviews={Platform.OS !== 'web'}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <Divider style={{ marginHorizontal: 16 }} />}
          renderItem={({ item }) => {
            const displayPresence = !item.isGroup
              ? resolveDisplayPresence(dmPresenceByConversationId[item.conversationId], presenceNowMs)
              : null;
            const presenceLabel = !item.isGroup
              ? formatPresenceLabel(displayPresence, presenceNowMs)
              : '';

            return (
            <Card style={styles.chatCard} mode="elevated" elevation={1}>
              <Card.Content style={styles.cardContent}>
                <TouchableOpacity style={styles.chatMainPressable} activeOpacity={0.8} onPress={() => handlePress(item.conversationId)}>
                  <View style={styles.avatarContainer}>
                    {resolveConversationAvatarUrl(item) ? (
                      <Avatar.Image
                        size={48}
                        source={{ uri: resolveConversationAvatarUrl(item) as string }}
                        style={{ backgroundColor: colors.surface }}
                      />
                    ) : (
                      <Avatar.Icon 
                        icon={item.isGroup ? "account-group" : "account"} 
                        size={48} 
                        style={{ backgroundColor: colors.surface }}
                      />
                    )}
                    {!item.isGroup && displayPresence?.isActive ? (
                      <View style={styles.onlineDot} />
                    ) : null}
                    {item.unreadCount > 0 && <Badge style={styles.badge}>{item.unreadCount}</Badge>}
                  </View>
                  <View style={styles.textContainer}>
                    <View style={styles.row}>
                      <View style={styles.nameWithPresenceWrap}>
                        <Text variant="titleMedium" style={[styles.groupName, item.unreadCount > 0 && { fontWeight: '700' }]} numberOfLines={1}>
                          {item.groupName || 'Hội thoại'}
                        </Text>
                        {presenceLabel ? (
                          <Text
                            variant="labelSmall"
                            style={[
                              styles.presenceInline,
                                displayPresence?.isActive && styles.presenceInlineActive,
                            ]}
                            numberOfLines={1}
                          >
                            {presenceLabel}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.trailingActions}>
                        {isConversationMuted(item.mutedUntil) ? (
                          <MaterialCommunityIcons name="bell-off-outline" size={14} color={colors.muted} style={styles.muteIcon} />
                        ) : null}
                        <Text variant="labelSmall" style={styles.timeText}>{formatConversationTime(item)}</Text>
                      </View>
                    </View>
                    <Text variant="bodySmall" style={[styles.description, item.unreadCount > 0 && { fontWeight: '600', color: colors.text }]} numberOfLines={1}>
                      {[
                        item.lastMessagePreview || 'Bắt đầu trò chuyện...',
                      ].filter(Boolean).join(' • ')}
                    </Text>
                  </View>
                </TouchableOpacity>

                <IconButton
                  icon="dots-vertical"
                  size={20}
                  style={styles.settingsBtn}
                  onPress={() => openConversationSettings(item)}
                />
              </Card.Content>
            </Card>
          );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="message-text-outline" size={60} color={colors.border} />
              <Text variant="bodyLarge" style={{ color: colors.textSecondary, fontWeight: '700', marginTop: 8 }}>
                Không có cuộc hội thoại nào.
              </Text>
            </View>
          }
        />
      )}

      <Portal>
        <Modal
          visible={settingsVisible}
          onDismiss={closeConversationSettings}
          contentContainerStyle={styles.settingsModalContainer}
          style={styles.settingsModalSheet}
        >
          <Text variant="titleMedium" style={styles.settingsTitle}>Cài đặt hội thoại</Text>
          <Text variant="bodySmall" style={styles.settingsSubtitle} numberOfLines={1}>
            {selectedConversation?.groupName || selectedConversation?.conversationId}
          </Text>

          <Button
            mode="text"
            icon="pin-outline"
            disabled={isUpdatingSettings}
            onPress={handleTogglePin}
            contentStyle={styles.settingsActionContent}
            labelStyle={styles.settingsActionLabel}
          >
            {selectedConversation?.isPinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại'}
          </Button>

          <Button
            mode="text"
            icon="bell-off-outline"
            disabled={isUpdatingSettings}
            onPress={openMuteOptions}
            contentStyle={styles.settingsActionContent}
            labelStyle={styles.settingsActionLabel}
          >
            {isConversationMuted(selectedConversation?.mutedUntil) ? 'Tùy chỉnh tắt thông báo' : 'Tắt thông báo'}
          </Button>

          {muteOptionsVisible ? (
            <View style={styles.muteOptionsBox}>
              <Button mode="text" icon="bell-off-outline" disabled={isUpdatingSettings} onPress={() => handleMuteForHours(1)}>
                Tắt 1 giờ
              </Button>
              <Button mode="text" icon="bell-off-outline" disabled={isUpdatingSettings} onPress={() => handleMuteForHours(4)}>
                Tắt 4 giờ
              </Button>
              <Button mode="text" icon="bell-off-outline" disabled={isUpdatingSettings} onPress={handleMuteUntilManual}>
                Tắt đến khi mở lại
              </Button>
              <Button mode="text" icon="bell-ring-outline" disabled={isUpdatingSettings} onPress={handleUnmute}>
                Bật thông báo
              </Button>
              <Button mode="text" disabled={isUpdatingSettings} onPress={closeMuteOptions}>
                Đóng tùy chọn
              </Button>
            </View>
          ) : null}

          <Button
            mode="text"
            icon="delete-outline"
            disabled={isUpdatingSettings}
            onPress={handleDeleteConversation}
            contentStyle={styles.settingsActionContent}
            labelStyle={styles.settingsDangerLabel}
          >
            Xóa cuộc trò chuyện
          </Button>

          <Button mode="contained" onPress={closeConversationSettings} disabled={isUpdatingSettings} style={{ marginTop: 8 }}>
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
    backgroundColor: colors.card,
    borderBottomLeftRadius: 24, 
    borderBottomRightRadius: 24, 
    elevation: 4,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    zIndex: 10,
  },
  headerTitle: { fontWeight: '700', color: colors.text },
  searchBar: { borderRadius: 12, backgroundColor: colors.surface, elevation: 0 },
  filterRow: { marginTop: 12 },
  
  listContent: { paddingVertical: 12 },
  chatCard: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 16,
    backgroundColor: colors.card,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  chatMainPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: { position: 'relative' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: colors.card,
  },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.secondary },
  
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  nameWithPresenceWrap: {
    flex: 1,
    marginRight: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  presenceInline: {
    marginTop: 1,
    color: colors.textSecondary,
  },
  presenceInlineActive: {
    color: '#16a34a',
    fontWeight: '700',
  },
  trailingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  muteIcon: {
    marginRight: 4,
  },
  settingsBtn: {
    margin: 0,
    marginLeft: 4,
  },
  groupName: {
    flex: 1,
    color: colors.text,
  },
  timeText: {
    color: colors.muted,
    fontWeight: '500',
  },
  description: {
    color: colors.textSecondary,
  },
  settingsModalSheet: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  settingsModalContainer: {
    backgroundColor: colors.card,
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  settingsTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  settingsSubtitle: {
    color: colors.textSecondary,
    marginBottom: 8,
  },
  settingsActionContent: {
    justifyContent: 'flex-start',
  },
  settingsActionLabel: {
    color: colors.text,
  },
  settingsDangerLabel: {
    color: '#b91c1c',
  },
  muteOptionsBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 8,
  },
  
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { padding: 48, alignItems: 'center' },
});
