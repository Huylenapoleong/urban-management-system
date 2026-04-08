import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";

export default function CitizenLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!user) {
      router.replace("/login");
      return;
    }

    if (["ADMIN", "PROVINCE_OFFICER", "WARD_OFFICER"].includes(user.role)) {
      router.replace("/(official)" as any);
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "shift",
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.94)",
          borderTopWidth: 1,
          borderTopColor: "#e5e7eb",
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 66 + Math.max(insets.bottom, 8),
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          elevation: 16,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        tabBarItemStyle: {
          marginHorizontal: 6,
          marginTop: 2,
          borderRadius: 18,
        },
        tabBarActiveBackgroundColor: "#eef4ff",
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="group"
        options={{
          title: "Group",
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="create-group" options={{ href: null }} />
      <Tabs.Screen name="join-group" options={{ href: null }} />
      <Tabs.Screen name="report-history" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
