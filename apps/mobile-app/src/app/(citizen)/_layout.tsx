import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { LinearGradient } from "@/components/shared/SafeLinearGradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import type { ConversationSummary } from "@urban/shared-types";
import colors from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import { listConversations } from "@/services/api/conversation.api";
import { SkeletonDetail } from "@/components/skeleton/Skeleton";
import { prefetchConversationMessages } from "@/services/prefetch";

const CHAT_BUBBLE_SETTING_KEY = "citizen.chatBubble.enabled";

async function readChatBubbleSetting(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CHAT_BUBBLE_SETTING_KEY);
  } catch {
    return null;
  }
}

function ChatBubbleOverlay() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [targetConversation, setTargetConversation] = useState<ConversationSummary | null>(null);
  const translateX = useSharedValue(18);
  const translateY = useSharedValue(150);
  const offsetX = useSharedValue(18);
  const offsetY = useSharedValue(150);

  const bubbleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          offsetX.value = translateX.value;
          offsetY.value = translateY.value;
        },
        onPanResponderMove: (_, gesture) => {
          translateX.value = offsetX.value + gesture.dx;
          translateY.value = offsetY.value + gesture.dy;
        },
        onPanResponderRelease: () => {
          translateX.value = withSpring(translateX.value, { damping: 18, stiffness: 180 });
          translateY.value = withSpring(translateY.value, { damping: 18, stiffness: 180 });
        },
      }),
    [offsetX, offsetY, translateX, translateY],
  );

  const loadSetting = useCallback(async () => {
    const value = await readChatBubbleSetting();
    setEnabled(value === null ? true : value === "true");
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!enabled) {
      setUnreadCount(0);
      setTargetConversation(null);
      return;
    }

    try {
      const conversations = await listConversations();
      const unread = conversations.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
      const target =
        conversations
          .filter((item) => (item.unreadCount || 0) > 0)
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ??
        null;

      setUnreadCount(unread);
      setTargetConversation(target);
    } catch {
      setUnreadCount(0);
      setTargetConversation(null);
    }
  }, [enabled]);

  useEffect(() => {
    void loadSetting();
  }, [loadSetting]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        return;
      }

      void loadSetting();
      void refreshUnread();
    });

    return () => {
      subscription.remove();
    };
  }, [loadSetting, refreshUnread]);

  if (!enabled || unreadCount <= 0 || !targetConversation) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.chatBubbleWrap,
        bubbleAnimatedStyle,
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable
        style={styles.chatBubble}
        onPress={() => {
          void prefetchConversationMessages(queryClient, targetConversation.conversationId);
          router.push({
            pathname: "/(citizen)/chat/[id]",
            params: { id: targetConversation.conversationId },
          });
        }}
      >
        <LinearGradient
          colors={colors.gradient.primary}
          start={colors.gradient.start}
          end={colors.gradient.end}
          style={StyleSheet.absoluteFillObject}
        />
        <Ionicons name="chatbubble-ellipses" size={26} color="white" />
        <View style={styles.chatBubbleBadge}>
          <Text style={styles.chatBubbleBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

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
        <SkeletonDetail />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <Tabs
      screenOptions={{
        headerShown: false,
        animation: "shift",
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.muted,
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
        tabBarActiveBackgroundColor: "rgba(73,90,255,0.12)",
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
      <Tabs.Screen name="friends/index" options={{ href: null }} />
      <Tabs.Screen name="friends/requests" options={{ href: null }} />
      <Tabs.Screen name="friends/search" options={{ href: null }} />
      </Tabs>
      <ChatBubbleOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  chatBubbleWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  chatBubble: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.secondary,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 10,
  },
  chatBubbleBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: "#dc2626",
    borderWidth: 2,
    borderColor: "white",
  },
  chatBubbleBadgeText: {
    color: "white",
    fontSize: 11,
    fontWeight: "800",
  },
});
