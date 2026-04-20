import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar, Button, IconButton, Surface, Text, TextInput, useTheme } from "react-native-paper";
import { ApiClient } from "@/lib/api-client";

export default function CitizenSearchUserScreen() {
  const theme = useTheme();
  const router = useRouter();

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
      const response = await ApiClient.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
      setResult(response);
    } catch (error: any) {
      setErrorMsg(error?.message || "Không tìm thấy người dùng.");
    } finally {
      setLoading(false);
    }
  };

  const handleChat = () => {
    const targetUserId = (result?.userId || result?.id || '').trim();

    if (!targetUserId) {
      return;
    }

    router.replace({
      pathname: '/(citizen)/chat/[id]',
      params: { id: `dm:${targetUserId}` },
    } as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <IconButton icon="close" size={24} onPress={() => router.back()} />
        <Text variant="titleLarge" style={styles.headerTitle}>
          Tìm người liên hệ để chat
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.content}>
        <Surface style={styles.searchCard} elevation={2}>
          <Text variant="bodyLarge" style={styles.label}>
            Nhập <Text style={{ fontWeight: "bold" }}>Số điện thoại</Text> hoặc <Text style={{ fontWeight: "bold" }}>Email</Text>
          </Text>

          <TextInput
            mode="outlined"
            placeholder="VD: 0912345678"
            value={query}
            onChangeText={setQuery}
            style={styles.input}
            outlineColor="#e0e0e0"
            activeOutlineColor={theme.colors.primary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            right={<TextInput.Icon icon="account-search-outline" />}
          />

          <Button
            mode="contained"
            onPress={handleSearch}
            loading={loading}
            disabled={loading || !query.trim()}
            style={styles.searchButton}
          >
            Tìm kiếm
          </Button>

          {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

          {result && (
            <Surface style={styles.resultCard} elevation={1}>
              <View style={styles.resultInfo}>
                {result.avatarUrl ? (
                  <Avatar.Image size={56} source={{ uri: result.avatarUrl }} />
                ) : (
                  <Avatar.Icon size={56} icon="account" />
                )}
                <View style={styles.resultTextCol}>
                  <Text variant="titleMedium" style={styles.resultName} numberOfLines={1}>
                    {result.fullName}
                  </Text>
                  <Text variant="bodySmall" style={styles.resultRole}>
                    {result.role === "CITIZEN" ? "Cư dân" : "Cán bộ"}
                  </Text>
                </View>
              </View>

              <Button mode="contained-tonal" icon="message-text-outline" onPress={handleChat} style={styles.chatButton}>
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
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerTitle: { fontWeight: "bold" },
  content: { flex: 1, padding: 20 },
  searchCard: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  label: { marginBottom: 12, color: "#424242" },
  input: { backgroundColor: "#fff", fontSize: 16 },
  searchButton: { marginTop: 16, borderRadius: 8 },
  errorText: { color: "#d32f2f", marginTop: 16, textAlign: "center", fontSize: 14 },
  resultCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  resultInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  resultTextCol: { marginLeft: 16, flex: 1 },
  resultName: { fontWeight: "bold", fontSize: 18, color: "#1a1a1a" },
  resultRole: { color: "#666", marginTop: 2 },
  chatButton: { borderRadius: 8 },
});
