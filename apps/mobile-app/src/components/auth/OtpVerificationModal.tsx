import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Modal, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, Surface, Button, TextInput, useTheme, IconButton } from 'react-native-paper';

interface OtpVerificationModalProps {
  visible: boolean;
  onDismiss: () => void;
  onVerify: (otpCode: string) => Promise<void>;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  loginIdentifier?: string; // e.g. Email or Phone for display
  onResend?: () => Promise<void>;
}

export function OtpVerificationModal({
  visible,
  onDismiss,
  onVerify,
  loading = false,
  title = 'Xác thực mã OTP',
  subtitle = 'Vui lòng nhập mã 6 số đã được gửi đến bạn.',
  loginIdentifier,
  onResend,
}: OtpVerificationModalProps) {
  const theme = useTheme();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    if (visible) {
      setOtp('');
      setError(null);
      setTimer(60);
    }
  }, [visible]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (visible && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [visible, timer]);

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError('Vui lòng nhập đủ 6 chữ số.');
      return;
    }

    try {
      setError(null);
      await onVerify(otp);
    } catch (err: any) {
      setError(err?.message || 'Mã xác thực không hợp lệ hoặc đã hết hạn.');
    }
  };

  const handleResend = async () => {
    if (timer > 0 || !onResend) return;

    try {
      setResending(true);
      setError(null);
      await onResend();
      setTimer(60);
    } catch (err: any) {
      setError(err?.message || 'Không thể gửi lại mã.');
    } finally {
      setResending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={() => {
        Keyboard.dismiss();
        if (!loading) onDismiss();
      }}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Surface style={styles.container} elevation={5}>
              <View style={styles.header}>
                <Text variant="titleLarge" style={styles.title}>{title}</Text>
                <IconButton icon="close" size={24} onPress={onDismiss} disabled={loading} />
              </View>

              <Text variant="bodyMedium" style={styles.subtitle}>
                {subtitle} {loginIdentifier ? `(${loginIdentifier})` : ''}
              </Text>

              <TextInput
                mode="outlined"
                value={otp}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9]/g, '').slice(0, 6);
                  setOtp(cleaned);
                  if (error) setError(null);
                }}
                keyboardType="number-pad"
                placeholder="000000"
                style={styles.input}
                maxLength={6}
                disabled={loading}
                autoFocus
                outlineStyle={error ? { borderColor: theme.colors.error } : undefined}
                contentStyle={styles.inputContent}
              />

              {error && (
                <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
                  {error}
                </Text>
              )}

              <Button
                mode="contained"
                onPress={handleVerify}
                disabled={loading || otp.length !== 6}
                style={styles.button}
                contentStyle={styles.buttonContent}
              >
                Xác nhận
              </Button>

              <View style={styles.resendRow}>
                <Text variant="bodySmall">Không nhận được mã?</Text>
                <Button
                  mode="text"
                  onPress={handleResend}
                  disabled={timer > 0 || resending || loading}
                  compact
                  labelStyle={styles.resendLabel}
                >
                  {timer > 0 ? `Gửi lại sau ${timer}s` : 'Gửi lại mã'}
                </Button>
              </View>
            </Surface>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    color: '#667085',
    marginBottom: 24,
  },
  input: {
    marginBottom: 8,
    fontSize: 24,
    textAlign: 'center',
  },
  inputContent: {
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: '700',
  },
  errorText: {
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    borderRadius: 12,
    marginTop: 8,
  },
  buttonContent: {
    height: 48,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  resendLabel: {
    fontWeight: '700',
    fontSize: 13,
  },
});
