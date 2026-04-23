import React, { useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { Text, Surface, Button, TextInput, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';
import colors from '@/constants/colors';

export default function OtpVerifyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { verifyRegisterOtp, verifyLoginOtp, requestRegisterOtp, requestLoginOtp } = useAuth();
  
  const { login, type, context } = useLocalSearchParams<{ 
    login: string, 
    type: 'REGISTER' | 'LOGIN',
    context?: string 
  }>();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError('Vui lòng nhập đủ 6 chữ số.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      if (type === 'REGISTER') {
        await verifyRegisterOtp(login!, otp);
      } else if (type === 'LOGIN') {
        await verifyLoginOtp(login!, otp);
      }
      
      // AuthProvider will automatically redirect to home/(citizen)/(official) upon token persist
    } catch (err: any) {
      setError(err?.message || 'Mã xác thực không hợp lệ hoặc đã hết hạn.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0) return;

    try {
      setLoading(true);
      setError(null);
      if (type === 'REGISTER') {
        await requestRegisterOtp(login!);
      } else {
        await requestLoginOtp(login!);
      }
      setTimer(60);
    } catch (err: any) {
      setError(err?.message || 'Không thể gửi lại mã.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Surface style={styles.card} elevation={3}>
          <Text variant="headlineSmall" style={styles.title}>Xác thực mã OTP</Text>
          <Text style={styles.subtitle}>
            Vui lòng nhập mã 6 số chúng tôi đã gửi đến {login}.
          </Text>

          <TextInput
            mode="outlined"
            value={otp}
            onChangeText={(text) => {
              setOtp(text.replace(/[^0-9]/g, '').slice(0, 6));
              if (error) setError(null);
            }}
            keyboardType="number-pad"
            placeholder="000000"
            style={styles.input}
            maxLength={6}
            disabled={loading}
            autoFocus
            error={!!error}
            contentStyle={styles.inputContent}
          />

          {error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}

          <Button
            mode="contained"
            onPress={handleVerify}
            disabled={loading || otp.length !== 6}
            style={styles.button}
          >
            Xác nhận
          </Button>

          <View style={styles.resendContainer}>
            <Text variant="bodySmall">Không nhận được mã?</Text>
            <Button
              mode="text"
              onPress={handleResend}
              disabled={timer > 0 || loading}
              compact
              labelStyle={styles.resendLabel}
            >
              {timer > 0 ? `Gửi lại sau ${timer}s` : 'Gửi lại mã'}
            </Button>
          </View>

          <Button 
            mode="text" 
            onPress={() => router.replace('/login')} 
            style={styles.backButton}
            labelStyle={styles.backLabel}
          >
            Quay lại đăng nhập
          </Button>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 24,
    paddingTop: 80,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    backgroundColor: colors.card,
  },
  title: {
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 20,
  },
  input: {
    marginBottom: 12,
  },
  inputContent: {
    textAlign: 'center',
    fontSize: 28,
    letterSpacing: 10,
    fontWeight: '700',
    paddingVertical: 10,
  },
  error: {
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 13,
  },
  button: {
    paddingVertical: 4,
    borderRadius: 12,
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  resendLabel: {
    fontWeight: '700',
  },
  backButton: {
    marginTop: 24,
  },
  backLabel: {
    color: colors.textSecondary,
  },
});
