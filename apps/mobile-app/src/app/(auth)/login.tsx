import { View, StyleSheet, Text } from "react-native";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { useState } from "react";
import colors from "@/constants/colors";
import { useAuth } from "@/services/auth-context";

export default function LoginPage() {
  const { login, error, loading } = useAuth();

  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Đăng nhập</Text>

      <Input
        label="Email hoặc Số điện thoại"
        value={loginValue}
        onChange={setLoginValue}
        placeholder="example@gmail.com hoặc +84..."
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Input
        label="Mật khẩu"
        value={password}
        onChange={setPassword}
        placeholder="********"
        secureTextEntry
      />

      <Button
        onPress={async () => {
          try {
            await login({ login: loginValue, password }); // ✅ FIX
          } catch {
            // error đã xử lý trong state
          }
        }}
        disabled={loading || !loginValue || !password}
      >
        {loading ? "Đang xử lý..." : "Đăng nhập"}
      </Button>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.info}>
        Đăng nhập qua API backend, token lưu AsyncStorage.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: "center",
  },
  heading: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 18,
  },
  info: {
    marginTop: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  error: {
    marginTop: 10,
    color: colors.danger,
    textAlign: "center",
  },
});