import colors from "@/constants/colors";
import { prefetchConversationMessages } from "@/services/prefetch";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import {
  Avatar,
  Button,
  IconButton,
  Surface,
  Text,
  TextInput,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClient } from "../../../lib/api-client";

export default function SearchUserScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setErrorMsg("");
    setResult(null);
    try {
      const res = await ApiClient.get(
        `/users/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResult(res);
    } catch (error: any) {
      setErrorMsg(
        error.response?.data?.message || "Không tìm thấy người dùng này.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChat = () => {
    const targetUserId = (result?.userId || result?.id || "").trim();

    if (!targetUserId) return;

    void prefetchConversationMessages(queryClient, `dm:${targetUserId}`);
    router.replace({
      pathname: "/(official)/chat/[id]",
      params: { id: `dm:${targetUserId}` },
    } as any);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Custom Header */}
      <View style={styles.header}>
        <IconButton icon="close" size={24} onPress={() => router.back()} />
        <Text variant="titleLarge" style={styles.headerTitle}>
          Tìm người liên hệ để Chat
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.content}
      >
        <Surface style={styles.searchCard} elevation={2}>
          <Text variant="bodyLarge" style={styles.label}>
            Nhập <Text style={{ fontWeight: "700" }}>Số điện thoại</Text> hoặc{" "}
            <Text style={{ fontWeight: "700" }}>Email</Text>:
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              mode="outlined"
              placeholder="VD: 0912345678"
              value={query}
              onChangeText={setQuery}
              style={styles.input}
              outlineColor="#e0e0e0"
              activeOutlineColor={colors.secondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              right={<TextInput.Icon icon="account-search-outline" />}
            />
          </View>
          <Button
            mode="contained"
            onPress={handleSearch}
            disabled={loading || !query.trim()}
            style={styles.searchBtn}
          >
            TÌM KIẾM
          </Button>

          {!!errorMsg && (
            <Text style={styles.errorText}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} />{" "}
              {errorMsg}
            </Text>
          )}

          {result && (
            <Surface style={styles.resultCard} elevation={1}>
              <View style={styles.resultInfo}>
                {result.avatarUrl ? (
                  <Avatar.Image size={56} source={{ uri: result.avatarUrl }} />
                ) : (
                  <Avatar.Icon size={56} icon="account" />
                )}
                <View style={styles.resultTextCol}>
                  <Text
                    variant="titleMedium"
                    style={styles.resultName}
                    numberOfLines={1}
                  >
                    {result.fullName}
                  </Text>
                  <Text variant="bodySmall" style={styles.resultRole}>
                    {result.role === "CITIZEN" ? "Cư dân" : "Cán bộ"}
                  </Text>
                </View>
              </View>

              <Button
                mode="contained-tonal"
                icon="message-text-outline"
                onPress={handleChat}
                style={styles.chatBtn}
              >
                Nhắn tin ngay
              </Button>
            </Surface>
          )}
        </Surface>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontWeight: "700", color: colors.text },
  content: { flex: 1, padding: 20 },
  searchCard: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.card,
  },
  label: { marginBottom: 12, color: colors.text },
  searchRow: { flexDirection: "row", alignItems: "center" },
  input: { flex: 1, backgroundColor: colors.card, fontSize: 16 },
  searchBtn: { marginTop: 16, borderRadius: 8 },
  errorText: {
    color: "#d32f2f",
    marginTop: 16,
    textAlign: "center",
    fontSize: 14,
  },

  resultCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  resultTextCol: { marginLeft: 16, flex: 1 },
  resultName: { fontWeight: "700", fontSize: 18, color: colors.text },
  resultRole: { color: colors.textSecondary, marginTop: 2 },
  chatBtn: { borderRadius: 8 },
});
