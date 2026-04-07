import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/services/auth-context";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace("/home");
      } else {
        router.replace("/login");
      }
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1677ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text>Đang chuyển hướng...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
});
