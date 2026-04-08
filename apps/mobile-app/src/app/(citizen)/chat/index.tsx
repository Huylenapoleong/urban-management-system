import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import Header from "@/components/Header";
import colors from "@/constants/colors";
import { useCitizenInbox } from "@/features/chat/citizen/useCitizenInbox";

export default function ChatListPage() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const { conversations, loading, error } = useCitizenInbox();

  return (
    <View style={styles.container}>
      <Header title="Chat" subtitle="Your latest conversations" />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={conversations}
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
