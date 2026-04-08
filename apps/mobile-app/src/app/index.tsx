import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";

export default function Index() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        if (["ADMIN", "PROVINCE_OFFICER", "WARD_OFFICER"].includes(user.role)) {
          router.replace("/(official)" as any);
        } else {
          router.replace("/home");
        }
      } else {
        router.replace("/login");
      }
    }
  }, [user, isLoading, router]);

  if (isLoading) {
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
