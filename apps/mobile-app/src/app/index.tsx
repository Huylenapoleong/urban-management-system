import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { SkeletonDetail } from "@/components/skeleton/Skeleton";

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
        <SkeletonDetail />
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
