import { View, StyleSheet, Text } from "react-native";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { useState } from "react";
import colors from "@/constants/colors";
import { useAuth } from "@/services/auth-context";

export default function RegisterPage() {
  const { register, error, loading } = useAuth();
  const [fullname, setFullname] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Đăng ký</Text>
      <Input label="Họ và tên" value={fullname} onChange={setFullname} placeholder="Nguyen Van A" />
      <Input label="Số điện thoại" value={phone} onChange={setPhone} placeholder="0123 456 789" />
      <Input label="Mật khẩu" value={password} onChange={setPassword} placeholder="********" secureTextEntry />
      <Button
        onPress={async () => {
          await register({
              fullName: fullname,
              phone,
              password,
              locationCode: "VN-HN-HN-01",
            });
        }}
        disabled={loading || !fullname || !phone || !password}
      >
        {loading ? "Đang xử lý..." : "Đăng ký"}
      </Button>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.info}>Tạo tài khoản bằng API backend và chuyển tới home.</Text>
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
