import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  ConversationSummary,
  MediaAsset,
  ReportItem,
  UserFriendRequestItem,
} from "@urban/shared-types";
import { useRouter } from "expo-router";
import Avatar from "@/components/Avatar";
import CitizenReportCard from "@/components/shared/CitizenReportCard";
import { ENV_CONFIG } from "@/constants/env";
import colors from "@/constants/colors";
import { convertToS3Url } from "@/constants/s3";
import { useAuth } from "@/providers/AuthProvider";
import { listConversations } from "@/services/api/conversation.api";
import { ApiClient } from "@/lib/api-client";
import { listReports } from "@/services/api/report.api";

function resolveRemoteUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const converted = convertToS3Url(trimmed);
  if (/^https?:\/\//i.test(converted)) {
    return converted;
  }

  const normalized = converted.replace(/^\/+/, "");
  if (normalized.startsWith("uploads/")) {
    return `${ENV_CONFIG.S3.NEW_BASE_URL}${normalized.replace(/^uploads\/+/, "")}`;
  }

  return `${ENV_CONFIG.API_BASE_URL.replace(/\/+$/, "")}/${normalized}`;
}

function normalizeReportMedia(report: ReportItem): ReportItem {
  const mediaUrls = (report.mediaUrls ?? [])
    .map((value) => resolveRemoteUrl(value))
    .filter((value): value is string => Boolean(value));
  const fallbackUrls = (report.mediaAssets ?? [])
    .map((asset: MediaAsset) => resolveRemoteUrl(asset.resolvedUrl || asset.key))
    .filter((value): value is string => Boolean(value));

  return {
    ...report,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : fallbackUrls,
  };
}

function resolveAvatarUrl(item: {
  avatarUrl?: string;
  avatarAsset?: MediaAsset;
}): string | undefined {
  return (
    resolveRemoteUrl(item.avatarUrl) ||
    resolveRemoteUrl(item.avatarAsset?.resolvedUrl || item.avatarAsset?.key) ||
    undefined
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [communityReports, setCommunityReports] = useState<ReportItem[]>([]);
  const [recentChats, setRecentChats] = useState<ConversationSummary[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<UserFriendRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFriendData = useCallback(async () => {
    const incomingData = await ApiClient.get<UserFriendRequestItem[]>("/users/me/friend-requests", {
      direction: "INCOMING",
      limit: 20,
    });

    setIncomingRequests(
      incomingData.map((item: UserFriendRequestItem) => ({
        ...item,
        avatarUrl: resolveAvatarUrl(item),
      })),
    );
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [reportsData, chatsData] = await Promise.all([
        listReports({ limit: 100 }),
        listConversations(),
      ]);

      setCommunityReports(
        [...reportsData]
          .map((report) => normalizeReportMedia(report))
          .sort(
            (left, right) =>
              new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
          ),
      );
      setRecentChats(
        [...chatsData].sort(
          (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        ),
      );
      await loadFriendData();
      setError(null);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Khong the tai du lieu trang chu");
    } finally {
      setLoading(false);
    }
  }, [loadFriendData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Auto-refresh khi quay lại home tab
  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const unreadMessages = useMemo(
    () => recentChats.reduce((sum, item) => sum + item.unreadCount, 0),
    [recentChats],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.welcomeCard}>
        <View style={styles.welcomeRow}>
          <Avatar name={user?.sub ?? "Citizen"} size={64} />
          <View style={styles.welcomeText}>
            <Text style={styles.welcomeTitle}>Trang cong dong</Text>
            <Text style={styles.welcomeSubtitle}>
              Xem phan anh cong dong, vao chat, va theo doi lich su cua ban.
            </Text>
          </View>
          <Pressable
            style={styles.historyButton}
            onPress={() => router.push("/report-history" as any)}
          >
            <Ionicons name="time-outline" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.quickActions}>
          <Pressable style={styles.quickAction} onPress={() => router.push("/(citizen)/report")}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            <Text style={styles.quickActionText}>Gui phan anh</Text>
          </Pressable>
          <Pressable style={styles.quickAction} onPress={() => router.push("/(citizen)/chat")}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
            <Text style={styles.quickActionText}>Mo chat</Text>
          </Pressable>
          <Pressable style={styles.quickAction} onPress={() => router.push("/(citizen)/friends" as any)}>
            <View style={styles.quickActionIconWrap}>
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
              {incomingRequests.length > 0 ? (
                <View style={styles.quickActionBadge}>
                  <Text style={styles.quickActionBadgeText}>{incomingRequests.length}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.quickActionText}>Ban be</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{communityReports.length}</Text>
          <Text style={styles.statLabel}>Phan anh cong dong</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{unreadMessages}</Text>
          <Text style={styles.statLabel}>Tin nhan chua doc</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Phan anh cong dong</Text>
        <Text style={styles.sectionSubtitle}>
          Citizen chi co quyen xem feed cong dong, khong the sua hoac xoa phan anh cua nguoi khac.
        </Text>
        {communityReports.length > 0 ? (
          communityReports.map((report) => <CitizenReportCard key={report.id} report={report} />)
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Chua co phan anh cong dong</Text>
            <Text style={styles.emptyText}>Khi co phan anh moi, feed se cap nhat tai day.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.chatSectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Tro chuyen</Text>
            <Text style={styles.sectionSubtitle}>Tat ca doan chat hien co khi thoat khoi hoi thoai.</Text>
          </View>
          <Pressable onPress={() => router.push("/(citizen)/chat")}>
            <Text style={styles.sectionLink}>Mo danh sach</Text>
          </Pressable>
        </View>

        {recentChats.length > 0 ? (
          recentChats.slice(0, 4).map((chat) => (
            <Pressable
              key={chat.conversationId}
              style={styles.chatPreview}
              onPress={() =>
                router.push({
                  pathname: "/(citizen)/chat/[id]",
                  params: { id: chat.conversationId },
                })
              }
            >
              <View style={styles.chatMain}>
                <Text style={styles.chatTitle}>{chat.groupName}</Text>
                <Text style={styles.chatPreviewText} numberOfLines={1}>
                  {chat.lastMessagePreview || "Chua co tin nhan, bam de bat dau tro chuyen"}
                </Text>
              </View>
              {chat.unreadCount > 0 ? (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>{chat.unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Chua co doan chat nao</Text>
            <Text style={styles.emptyText}>Hay tham gia nhom hoac tao nhom de bat dau.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  welcomeCard: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  welcomeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  welcomeText: {
    flex: 1,
    marginLeft: 14,
    marginRight: 12,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  welcomeSubtitle: {
    marginTop: 6,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  historyButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  quickAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  quickActionText: {
    color: colors.primary,
    fontWeight: "800",
  },
  quickActionIconWrap: {
    position: "relative",
  },
  quickActionBadge: {
    position: "absolute",
    top: -10,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    backgroundColor: "#dc2626",
  },
  quickActionBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "800",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.primary,
  },
  statLabel: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  errorCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
    marginBottom: 18,
  },
  errorText: {
    color: "#b91c1c",
    textAlign: "center",
    fontWeight: "600",
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  sectionSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  emptyCard: {
    backgroundColor: "white",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  emptyText: {
    marginTop: 8,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  chatSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  sectionLink: {
    color: colors.primary,
    fontWeight: "800",
    marginTop: 2,
  },
  chatPreview: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },
  chatMain: {
    flex: 1,
    paddingRight: 12,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  chatPreviewText: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 14,
  },
  chatBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  chatBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "800",
  },
});
