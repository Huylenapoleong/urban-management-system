import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { Avatar, Badge, Card, Divider, IconButton, Searchbar, SegmentedButtons } from "react-native-paper";
import colors from "@/constants/colors";
import { useCitizenInbox } from "@/features/chat/citizen/useCitizenInbox";

export default function ChatListPage() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const { conversations, loading, error } = useCitizenInbox();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("ALL");

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
      const leftUnread = left.unreadCount > 0 ? 1 : 0;
      const rightUnread = right.unreadCount > 0 ? 1 : 0;

      if (leftUnread !== rightUnread) {
        return rightUnread - leftUnread;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [conversations, filterMode, searchQuery]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Hộp thư</Text>
          <IconButton
            icon="account-search-outline"
            size={26}
            onPress={() => router.push("/(citizen)/chat/search" as any)}
          />
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
          renderItem={({ item }) => (
            <Card
              style={styles.chatCard}
              mode="elevated"
              elevation={1}
              onPress={() =>
                router.push({
                  pathname: "/(citizen)/chat/[id]",
                  params: { id: item.conversationId },
                })
              }
            >
              <View style={styles.cardContent}>
                <View style={styles.avatarContainer}>
                  <Avatar.Icon
                    icon={item.isGroup ? "account-group" : "account"}
                    size={48}
                    style={{ backgroundColor: item.isGroup ? "#e8efff" : "#eafbf0" }}
                  />
                  {item.unreadCount > 0 ? <Badge style={styles.badge}>{item.unreadCount}</Badge> : null}
                </View>
                <View style={styles.textWrap}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, item.unreadCount > 0 ? styles.titleUnread : null]} numberOfLines={1}>
                      {item.groupName || "Hội thoại"}
                    </Text>
                    <Text style={styles.timeText}>
                      {item.updatedAt
                        ? new Date(item.updatedAt).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </Text>
                  </View>
                  <Text style={[styles.preview, item.unreadCount > 0 ? styles.previewUnread : null]} numberOfLines={1}>
                    {item.lastMessagePreview || "Bắt đầu trò chuyện..."}
                  </Text>
                </View>
              </View>
            </Card>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Chưa có cuộc hội thoại nào.</Text>}
        />
      )}
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
  avatarContainer: { position: "relative" },
  textWrap: { flex: 1, marginLeft: 12 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },
  titleUnread: { fontWeight: "900" },
  timeText: {
    marginLeft: 8,
    color: colors.textSecondary,
    fontSize: 12,
  },
  preview: { color: colors.textSecondary, fontSize: 14 },
  previewUnread: { color: colors.text, fontWeight: "700" },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#E53935",
  },
  error: { color: colors.danger, textAlign: "center", marginTop: 12 },
  empty: { color: colors.textSecondary, textAlign: "center", marginTop: 12 },
});
