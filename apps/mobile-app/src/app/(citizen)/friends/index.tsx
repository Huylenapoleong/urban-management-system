import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import type {
  MediaAsset,
  UserDirectoryItem,
  UserFriendItem,
  UserFriendRequestItem,
} from "@urban/shared-types";
import Avatar from "@/components/Avatar";
import colors from "@/constants/colors";
import { ENV_CONFIG } from "@/constants/env";
import { convertToS3Url } from "@/constants/s3";
import { ApiClient } from "@/lib/api-client";

type FriendTab = "SUGGESTIONS" | "OUTGOING" | "FRIENDS";
type FriendAction = "send" | "cancel" | "accept" | "reject";

function resolveRemoteUrl(value?: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }

  const converted = convertToS3Url(value.trim());
  if (/^https?:\/\//i.test(converted)) {
    return converted;
  }

  const normalized = converted.replace(/^\/+/, "");
  if (normalized.startsWith("uploads/")) {
    return `${ENV_CONFIG.S3.NEW_BASE_URL}${normalized.replace(/^uploads\/+/, "")}`;
  }

  return `${ENV_CONFIG.API_BASE_URL.replace(/\/+$/, "")}/${normalized}`;
}

function resolveAvatarUrl(item: { avatarUrl?: string; avatarAsset?: MediaAsset }) {
  return (
    resolveRemoteUrl(item.avatarUrl) ||
    resolveRemoteUrl(item.avatarAsset?.resolvedUrl || item.avatarAsset?.key) ||
    undefined
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FriendTab>("SUGGESTIONS");
  const [incomingRequests, setIncomingRequests] = useState<UserFriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<UserFriendRequestItem[]>([]);
  const [friends, setFriends] = useState<UserFriendItem[]>([]);
  const [suggestions, setSuggestions] = useState<UserDirectoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const normalizeRequest = useCallback(
    (item: UserFriendRequestItem): UserFriendRequestItem => ({
      ...item,
      avatarUrl: resolveAvatarUrl(item),
    }),
    [],
  );

  const normalizeFriend = useCallback(
    (item: UserFriendItem): UserFriendItem => ({
      ...item,
      avatarUrl: resolveAvatarUrl(item),
    }),
    [],
  );

  const normalizeSuggestion = useCallback(
    (item: UserDirectoryItem): UserDirectoryItem => ({
      ...item,
      avatarUrl: resolveAvatarUrl(item),
    }),
    [],
  );

  const loadFriendsData = useCallback(
    async (query = searchQuery, showLoader = false) => {
      if (showLoader) {
        setLoading(true);
      } else {
        setSearching(true);
      }

      const keyword = query.trim();
      const discoveryParams: Record<string, string | number> = {
        mode: "friend",
        limit: 30,
      };

      if (keyword) {
        discoveryParams.q = keyword;
      }

      try {
        const [incomingData, outgoingData, friendsData, suggestionsData] = await Promise.all([
          ApiClient.get<UserFriendRequestItem[]>("/users/me/friend-requests", {
            direction: "INCOMING",
            limit: 30,
          }),
          ApiClient.get<UserFriendRequestItem[]>("/users/me/friend-requests", {
            direction: "OUTGOING",
            limit: 30,
          }),
          ApiClient.get<UserFriendItem[]>("/users/me/friends", { limit: 50 }),
          ApiClient.get<UserDirectoryItem[]>("/users/discover", discoveryParams),
        ]);

        setIncomingRequests(incomingData.map(normalizeRequest));
        setOutgoingRequests(outgoingData.map(normalizeRequest));
        setFriends(friendsData.map(normalizeFriend));
        setSuggestions(suggestionsData.map(normalizeSuggestion));
      } catch (err: unknown) {
        Alert.alert("Loi ket ban", (err as Error)?.message || "Khong the tai du lieu ban be.");
      } finally {
        setLoading(false);
        setSearching(false);
      }
    },
    [normalizeFriend, normalizeRequest, normalizeSuggestion, searchQuery],
  );

  useEffect(() => {
    void loadFriendsData("", true);
  }, [loadFriendsData]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadFriendsData(searchQuery, false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [loadFriendsData, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      void loadFriendsData(searchQuery, true);
    }, [loadFriendsData, searchQuery]),
  );

  const handleOpenChat = useCallback(
    (userId: string) => {
      router.push({
        pathname: "/(citizen)/chat/[id]",
        params: { id: `dm:${userId}` },
      });
    },
    [router],
  );

  const handleFriendAction = useCallback(
    async (userId: string, action: FriendAction) => {
      setActingId(`${action}:${userId}`);

      try {
        if (action === "send") {
          await ApiClient.post(`/users/me/friends/${encodeURIComponent(userId)}/request`);
        } else if (action === "cancel") {
          await ApiClient.post(`/users/me/friend-requests/${encodeURIComponent(userId)}/cancel`);
        } else if (action === "accept") {
          await ApiClient.post(`/users/me/friend-requests/${encodeURIComponent(userId)}/accept`);
        } else {
          await ApiClient.post(`/users/me/friend-requests/${encodeURIComponent(userId)}/reject`);
        }

        await loadFriendsData(searchQuery, false);
      } catch (err: unknown) {
        Alert.alert("Loi ket ban", (err as Error)?.message || "Khong the thuc hien thao tac.");
      } finally {
        setActingId(null);
      }
    },
    [loadFriendsData, searchQuery],
  );

  const tabs = useMemo(
    () => [
      { key: "SUGGESTIONS" as const, label: "Goi y" },
      { key: "OUTGOING" as const, label: "Da gui", count: outgoingRequests.length },
      { key: "FRIENDS" as const, label: "Ban be", count: friends.length },
    ],
    [friends.length, outgoingRequests.length],
  );

  const renderFriendIdentity = (
    item: { fullName: string; avatarUrl?: string; userId: string },
    subtitle?: string,
  ) => (
    <View style={styles.friendIdentity}>
      <Avatar uri={item.avatarUrl} name={item.fullName || item.userId} size={48} />
      <View style={styles.friendMeta}>
        <Text style={styles.friendName}>{item.fullName || item.userId}</Text>
        {subtitle ? <Text style={styles.friendHint}>{subtitle}</Text> : null}
      </View>
    </View>
  );

  const renderSuggestionAction = (item: UserDirectoryItem) => {
    if (item.relationState === "FRIEND") {
      return (
        <Pressable style={[styles.friendButton, styles.friendButtonSecondary]} onPress={() => handleOpenChat(item.userId)}>
          <Text style={styles.friendButtonSecondaryText}>Nhan tin</Text>
        </Pressable>
      );
    }

    if (item.relationState === "OUTGOING_REQUEST") {
      return (
        <View style={[styles.friendButton, styles.friendButtonDisabled]}>
          <Text style={styles.friendButtonDisabledText}>Da gui</Text>
        </View>
      );
    }

    if (item.relationState === "INCOMING_REQUEST") {
      return (
        <View style={[styles.friendButton, styles.friendButtonDisabled]}>
          <Text style={styles.friendButtonDisabledText}>Cho phan hoi</Text>
        </View>
      );
    }

    return (
      <Pressable
        style={[styles.friendButton, styles.friendButtonPrimary]}
        onPress={() => void handleFriendAction(item.userId, "send")}
        disabled={actingId !== null}
      >
        <Text style={styles.friendButtonPrimaryText}>
          {actingId === `send:${item.userId}` ? "Dang gui..." : "Ket ban"}
        </Text>
      </Pressable>
    );
  };

  const renderTabContent = () => {
    if (activeTab === "SUGGESTIONS") {
      return (
        <>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Tim theo ten..."
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {searching ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : null}
          {!searching && suggestions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Chua co goi y phu hop</Text>
              <Text style={styles.emptyText}>Thu doi tu khoa khac de tim them nguoi dung.</Text>
            </View>
          ) : null}
          {suggestions.map((item) => (
            <View key={item.userId} style={styles.friendCard}>
              {renderFriendIdentity(item, item.relationState || "NONE")}
              {renderSuggestionAction(item)}
            </View>
          ))}
        </>
      );
    }

    if (activeTab === "OUTGOING") {
      return outgoingRequests.length > 0 ? (
        <>
          {outgoingRequests.map((item) => (
            <View key={item.userId} style={styles.friendCard}>
              {renderFriendIdentity(
                item,
                `Da gui ${new Date(item.requestedAt).toLocaleDateString("vi-VN")}`,
              )}
              <Pressable
                style={[styles.friendButton, styles.friendButtonSecondary]}
                onPress={() => void handleFriendAction(item.userId, "cancel")}
                disabled={actingId !== null}
              >
                <Text style={styles.friendButtonSecondaryText}>
                  {actingId === `cancel:${item.userId}` ? "Dang huy..." : "Huy loi moi"}
                </Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Chua gui loi moi nao</Text>
          <Text style={styles.emptyText}>Loi moi ban gui se hien tai day.</Text>
        </View>
      );
    }

    return friends.length > 0 ? (
      <>
        {friends.map((item) => (
          <Pressable key={item.userId} style={styles.friendCard} onPress={() => handleOpenChat(item.userId)}>
            {renderFriendIdentity(
              item,
              `Ban be tu ${new Date(item.friendsSince).toLocaleDateString("vi-VN")}`,
            )}
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
          </Pressable>
        ))}
      </>
    ) : (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Chua co ban be</Text>
        <Text style={styles.emptyText}>Ket ban de bat dau nhan tin rieng.</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Ban be</Text>
          <Text style={styles.headerSubtitle}>Tim kiem, quan ly loi moi va mo chat nhanh.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {incomingRequests.length > 0 ? (
          <View style={styles.incomingBanner}>
            <View style={styles.bannerHeader}>
              <Text style={styles.bannerTitle}>Loi moi nhan duoc</Text>
              <View style={styles.bannerBadge}>
                <Text style={styles.bannerBadgeText}>{incomingRequests.length}</Text>
              </View>
            </View>
            {incomingRequests.map((item) => (
              <View key={item.userId} style={styles.incomingItem}>
                {renderFriendIdentity(
                  item,
                  `Gui ${new Date(item.requestedAt).toLocaleDateString("vi-VN")}`,
                )}
                <View style={styles.incomingActions}>
                  <Pressable
                    style={[styles.friendButton, styles.friendButtonPrimary]}
                    onPress={() => void handleFriendAction(item.userId, "accept")}
                    disabled={actingId !== null}
                  >
                    <Text style={styles.friendButtonPrimaryText}>Dong y</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.friendButton, styles.friendButtonSecondary]}
                    onPress={() => void handleFriendAction(item.userId, "reject")}
                    disabled={actingId !== null}
                  >
                    <Text style={styles.friendButtonSecondaryText}>Tu choi</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tabButton, activeTab === tab.key ? styles.tabButtonActive : null]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabButtonText, activeTab === tab.key ? styles.tabButtonTextActive : null]}>
                {tab.label}{tab.count ? ` (${tab.count})` : ""}
              </Text>
            </Pressable>
          ))}
        </View>

        {renderTabContent()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  headerSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 13,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  incomingBanner: {
    backgroundColor: "white",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    padding: 14,
    marginBottom: 16,
  },
  bannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  bannerBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    backgroundColor: "#dc2626",
  },
  bannerBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "800",
  },
  incomingItem: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    gap: 10,
  },
  incomingActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  tabButtonTextActive: {
    color: "white",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dbe5f0",
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    color: colors.text,
  },
  loader: {
    marginVertical: 16,
  },
  friendCard: {
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  friendIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  friendMeta: {
    flex: 1,
    marginLeft: 12,
  },
  friendName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  friendHint: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12,
  },
  friendButton: {
    minWidth: 86,
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  friendButtonPrimary: {
    backgroundColor: colors.primary,
  },
  friendButtonSecondary: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#dbe5f0",
  },
  friendButtonDisabled: {
    backgroundColor: "#e2e8f0",
  },
  friendButtonPrimaryText: {
    color: "white",
    fontSize: 12,
    fontWeight: "800",
  },
  friendButtonSecondaryText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  friendButtonDisabledText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  emptyCard: {
    backgroundColor: "white",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 22,
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 8,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
