import { LogBox } from "react-native";
import { Stack } from "expo-router";

LogBox.ignoreLogs([
  "Unexpected text node",
  "Unexpected text node: .",
  "A text node cannot be a child of a <View>"
]);
import { PaperProvider } from "react-native-paper";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/providers/AuthProvider";

import { WebRTCProvider } from '../providers/WebRTCProvider';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider>
        <AuthProvider>
          <WebRTCProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </WebRTCProvider>
        </AuthProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}
