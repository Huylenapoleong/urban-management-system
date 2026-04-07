import { Stack } from "expo-router";
import { AuthProvider } from "@/services/auth-context";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack />
    </AuthProvider>
  );
}
