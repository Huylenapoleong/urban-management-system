import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Header from "@/components/Header";
import colors from "@/constants/colors";
import { listConversations } from "@/services/api/conversation.api";
import { listReports } from "@/services/api/report.api";
import type { ConversationSummary, ReportItem } from "@urban/shared-types";

type NotificationCard = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  tone: "primary" | "success";
};

export default function NotificationsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [reportData, conversationData] = await Promise.all([
          listReports({ mine: true, limit: 100 }),
          listConversations(),
        ]);

        if (active) {
          setReports(reportData);
          setConversations(conversationData);
          setError(null);
        }
      } catch (err: unknown) {
        if (active) {
          setError((err as Error)?.message ?? "Unable to load notifications");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  const items = useMemo<NotificationCard[]>(() => {
    const unreadCount = conversations.reduce((sum, item) => sum + item.unreadCount, 0);
    const activeReports = reports.filter((item) => item.status === "NEW" || item.status === "IN_PROGRESS");

    return [
      {
        id: "messages",
        icon: "chatbubble-ellipses",
        title: "Unread messages",
        body: unreadCount > 0 ? `You have ${unreadCount} unread messages.` : "You're all caught up in chat.",
        tone: "primary",
      },
      {
        id: "reports",
        icon: "document-text",
        title: "Report updates",
        body:
          activeReports.length > 0
            ? `${activeReports.length} reports still need attention.`
            : "All tracked reports look up to date.",
        tone: "success",
      },
    ];
  }, [conversations, reports]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header title="Notifications" subtitle="Important updates at a glance" />
      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable key={item.id} style={styles.card}>
              <View
                style={[
                  styles.iconWrap,
                  item.tone === "primary" ? styles.primaryIconWrap : styles.successIconWrap,
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.tone === "primary" ? colors.primary : colors.success}
                />
              </View>
              <View style={styles.textContent}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 120 },
  loader: { marginTop: 24 },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#edf2f7",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  primaryIconWrap: { backgroundColor: "#eff6ff" },
  successIconWrap: { backgroundColor: "#ecfdf5" },
  textContent: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 4 },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  error: { color: colors.danger, textAlign: "center", marginTop: 20 },
});
