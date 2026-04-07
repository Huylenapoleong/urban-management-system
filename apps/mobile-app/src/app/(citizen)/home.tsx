import React, { useState, useEffect } from "react";
import { View, StyleSheet, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/services/auth-context";
import { listConversations } from "@/services/api/conversation.api";
import { listReports } from "@/services/api/report.api";
import type { ReportItem, ConversationSummary } from "@urban/shared-types";
import colors from "@/constants/colors";
import Avatar from "@/components/Avatar";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [recentReports, setRecentReports] = useState<ReportItem[]>([]);
  const [recentChats, setRecentChats] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const reportsData = await listReports();
        const chatsData = await listConversations();
        setRecentReports(reportsData.slice(0, 3));
        setRecentChats(chatsData.slice(0, 2));
      } catch (error) {
        console.error("Home data load error:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []); // Stable deps - no loops

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Welcome */}
      <View style={styles.welcomeCard}>
        <Avatar uri={user?.avatarUrl} name={user?.fullName} size={64} />
        <View style={styles.welcomeText}>
          <Text style={styles.welcomeTitle}>Chào {user?.fullName?.split(' ')[0] || 'bạn'}</Text>
          <Text style={styles.welcomeSubtitle}>Urban Management</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{recentReports.length}</Text>
          <Text style={styles.statLabel}>Phản ánh</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{recentChats.reduce((sum: number, chat: ConversationSummary) => sum + chat.unreadCount, 0)}</Text>
          <Text style={styles.statLabel}>Tin nhắn</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nhanh</Text>
        <View style={styles.actionGrid}>
          <Pressable style={styles.actionCard} onPress={() => router.push('/report')}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>📝</Text>
            </View>
            <Text style={styles.actionTitle}>Phản ánh</Text>
          </Pressable>
          <Pressable style={styles.actionCard} onPress={() => router.push('/chat')}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>💬</Text>
            </View>
            <Text style={styles.actionTitle}>Chat</Text>
          </Pressable>
        </View>
      </View>

      {/* Recent Reports */}
      {recentReports.length > 0 && (
        <View style={styles.section}>
          <Pressable style={styles.sectionHeader} onPress={() => router.push('/report')}>
            <Text style={styles.sectionTitle}>Phản ánh mới</Text>
            <Text style={styles.sectionLink}>Tất cả</Text>
          </Pressable>
          {recentReports.map((report: ReportItem) => (
            <Pressable key={report.id} style={styles.activityItem}>
              <View>
                <Text style={styles.activityTitle}>{report.title}</Text>
                <Text style={styles.activitySubtitle}>{report.category}</Text>
              </View>
              <Text style={[styles.statusText, { color: report.status === 'NEW' || report.status === 'IN_PROGRESS' ? '#f59e0b' : colors.success }]}>
                {report.status}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Recent Chats */}
      {recentChats.length > 0 && (
        <View style={styles.section}>
          <Pressable style={styles.sectionHeader} onPress={() => router.push('/chat')}>
            <Text style={styles.sectionTitle}>Trò chuyện</Text>
            <Text style={styles.sectionLink}>Tất cả</Text>
          </Pressable>
          {recentChats.map((chat: ConversationSummary) => (
            <Pressable key={chat.conversationId} style={styles.chatPreview}>
              <Text style={styles.chatTitle}>{chat.groupName}</Text>
              <Text style={styles.chatPreviewText}>{chat.lastMessagePreview}</Text>
              {chat.unreadCount > 0 && (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>{chat.unreadCount}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 100 },
  welcomeCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  welcomeText: { marginLeft: 16, flex: 1 },
  welcomeTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  welcomeSubtitle: { fontSize: 16, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statNumber: { fontSize: 32, fontWeight: 'bold', color: colors.primary },
  statLabel: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionLink: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  actionGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  actionCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  actionIconText: { fontSize: 24 },
  actionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  activityItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  activityTitle: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1, marginRight: 12 },
  activitySubtitle: { fontSize: 14, color: colors.textSecondary },
  statusText: { fontSize: 12, fontWeight: '600' },
  chatPreview: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  chatTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 },
  chatPreviewText: { fontSize: 14, color: colors.textSecondary },
  chatBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatBadgeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
