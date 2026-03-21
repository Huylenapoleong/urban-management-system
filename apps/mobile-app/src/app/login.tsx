import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Text, TextInput, Button, useTheme, Surface, HelperText } from 'react-native-paper';
import { useAuth } from '../providers/AuthProvider';

export default function LoginScreen() {
  const theme = useTheme();
  const { login } = useAuth();
  
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    setErrorMsg('');
    if (!phone || !password) {
      setErrorMsg('Vui lòng nhập số điện thoại và mật khẩu');
      return;
    }

    try {
      setLoading(true);
      await login(phone, password);
    } catch (err: any) {
      setErrorMsg(err.message || 'Đăng nhập không thành công');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Surface style={styles.surface} elevation={2}>
          <Text variant="headlineMedium" style={styles.title}>
            Đăng nhập hệ thống
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Chào mừng trở lại, Hệ thống Quản lý Đô thị
          </Text>

          <TextInput
            label="Số điện thoại"
            mode="outlined"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={styles.input}
            disabled={loading}
            left={<TextInput.Icon icon="phone" />}
          />

          <TextInput
            label="Mật khẩu"
            mode="outlined"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            disabled={loading}
            left={<TextInput.Icon icon="lock" />}
          />

          {!!errorMsg && (
            <HelperText type="error" visible={!!errorMsg}>
              {errorMsg}
            </HelperText>
          )}

          <Button 
            mode="contained" 
            onPress={handleLogin} 
            loading={loading}
            disabled={loading}
            style={styles.button}
          >
            Đăng nhập
          </Button>
        </Surface>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 16 },
  surface: {
    padding: 24,
    borderRadius: 12,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: '#666',
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
    paddingVertical: 4,
  },
});
