import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Header from "@/components/Header";
import Avatar from "@/components/Avatar";
import Button from "@/components/Button";
import { getMe } from "@/services/api/auth.api";
import type { UserProfile } from "@urban/shared-types";
import colors from "@/constants/colors";
import { useAuth } from "@/services/auth-context";

export default function ProfilePage() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMe();
      setProfile(data);
      setError(null);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Khong the tai ho so");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Khong the tai ho so.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Thong tin ca nhan" />
      <View style={styles.card}>
        <Avatar uri={profile.avatarUrl} name={profile.fullName} size={96} />
        <Text style={styles.name}>{profile.fullName}</Text>
        <Text style={styles.role}>{profile.role}</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Email: </Text>
          <Text style={styles.value}>{profile.email || "-"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Dien thoai: </Text>
          <Text style={styles.value}>{profile.phone || "-"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Trang thai: </Text>
          <Text style={styles.value}>{profile.status}</Text>
        </View>
        <Button style={styles.logoutButton} onPress={() => void logout()}>
          Dang xuat
        </Button>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    margin: 14,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  name: { fontSize: 20, fontWeight: "700", marginTop: 10 },
  role: { color: colors.primary, marginBottom: 14, fontWeight: "600" },
  row: { flexDirection: "row", width: "100%", marginTop: 8 },
  label: { color: colors.textSecondary, fontWeight: "600" },
  value: { color: colors.text, flex: 1 },
  logoutButton: { width: "100%", marginTop: 18, backgroundColor: colors.danger },
  error: { color: colors.danger, textAlign: "center", marginTop: 10 },
});
