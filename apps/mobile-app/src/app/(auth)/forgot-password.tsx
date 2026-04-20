import React, { useState, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Share, Alert } from 'react-native';
import { Text, TextInput, Button, Surface, HelperText, IconButton } from 'react-native-paper';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'expo-router';
import { OtpVerificationModal } from '@/components/auth/OtpVerificationModal';
import * as SecureStore from 'expo-secure-store';

type ForgotPasswordStep = 'IDENTITY' | 'RESET';
const GENERATED_PASSWORD_STORAGE_KEY = 'auth.forgotPassword.generated.latest';

function validateNewPassword(password: string, confirmPassword: string): string | null {
  if (!password.trim()) {
    return 'Vui lòng nhập mật khẩu mới.';
  }

  if (password.length < 10 || password.length > 64) {
    return 'Mật khẩu mới phải có từ 10 đến 64 ký tự.';
  }

  if (/\s/.test(password)) {
    return 'Mật khẩu mới không được chứa khoảng trắng.';
  }

  if (/(.)\1{3,}/.test(password)) {
    return 'Mật khẩu mới không được lặp cùng 1 ký tự quá 3 lần liên tiếp.';
  }

  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const classCount = [hasLowercase, hasUppercase, hasDigit, hasSymbol].filter(Boolean).length;

  if (classCount < 3) {
    return 'Mật khẩu mới cần có ít nhất 3 trong 4 nhóm: chữ hoa, chữ thường, số, ký tự đặc biệt.';
  }

  if (password !== confirmPassword) {
    return 'Mật khẩu xác nhận không khớp.';
  }

  return null;
}

function translateForgotPasswordError(rawMessage: string | undefined): string {
  const message = (rawMessage || '').trim();
  const normalized = message.toLowerCase();

  if (!message) {
    return 'Đặt lại mật khẩu thất bại. Vui lòng thử lại.';
  }

  if (normalized.includes('newpassword must be different from the current password')) {
    return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  }

  if (normalized.includes('password must be between')) {
    return 'Mật khẩu mới phải có từ 10 đến 64 ký tự.';
  }

  if (normalized.includes('password must not contain whitespace')) {
    return 'Mật khẩu mới không được chứa khoảng trắng.';
  }

  if (normalized.includes('password must not contain repeated characters')) {
    return 'Mật khẩu mới không được lặp cùng 1 ký tự quá 3 lần liên tiếp.';
  }

  if (normalized.includes('password must include at least') && normalized.includes('uppercase')) {
    return 'Mật khẩu mới cần có ít nhất 3 trong 4 nhóm: chữ hoa, chữ thường, số, ký tự đặc biệt.';
  }

  if (normalized.includes('password must include at least one special character')) {
    return 'Mật khẩu mới phải có ít nhất 1 ký tự đặc biệt.';
  }

  if (normalized.includes('password is too common or predictable')) {
    return 'Mật khẩu mới quá phổ biến hoặc dễ đoán. Vui lòng chọn mật khẩu mạnh hơn.';
  }

  if (normalized.includes('password must not contain your personal account information')) {
    return 'Mật khẩu mới không được chứa thông tin cá nhân (tên, email, số điện thoại).';
  }

  if (normalized.includes('otp') && normalized.includes('expired')) {
    return 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.';
  }

  if (normalized.includes('otp') && normalized.includes('invalid')) {
    return 'Mã OTP không hợp lệ. Vui lòng kiểm tra lại.';
  }

  return message;
}

function generateStrongPassword(length = 14): string {
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '@#$%&*!?';
  const allChars = lowercase + uppercase + digits + symbols;

  const pick = (charset: string) => charset[Math.floor(Math.random() * charset.length)];
  const chars = [pick(lowercase), pick(uppercase), pick(digits), pick(symbols)];

  for (let i = chars.length; i < length; i += 1) {
    chars.push(pick(allChars));
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
}

export default function ForgotPasswordScreen() {
  const { requestForgotPasswordOtp, verifyForgotPasswordOtp, confirmForgotPassword } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<ForgotPasswordStep>('IDENTITY');
  const [loginVal, setLoginVal] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifiedOtp, setVerifiedOtp] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const handleRequestOtp = async () => {
    setErrorMsg('');
    const cleanLogin = loginVal.trim();
    if (!cleanLogin) {
      setErrorMsg('Vui lòng nhập Email của bạn');
      return;
    }

    try {
      setLoading(true);
      await requestForgotPasswordOtp(cleanLogin);
      setShowOtpModal(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể gửi yêu cầu xác thực');
    } finally {
      setLoading(false);
    }
  };

  const onOtpVerified = useCallback(async (otpCode: string) => {
    try {
      setOtpLoading(true);
      const cleanLogin = loginVal.trim();
      await verifyForgotPasswordOtp(cleanLogin, otpCode);
      setVerifiedOtp(otpCode);
      setShowOtpModal(false);
      setStep('RESET');
    } catch (err: any) {
      // Re-throw so the modal shows the error
      throw err;
    } finally {
      setOtpLoading(false);
    }
  }, [loginVal, verifyForgotPasswordOtp]);

  const handleFinalReset = async () => {
    setErrorMsg('');
    const validationMessage = validateNewPassword(newPassword, confirmPassword);
    if (validationMessage) {
      setErrorMsg(validationMessage);
      return;
    }

    try {
      setLoading(true);
      await confirmForgotPassword({
        login: loginVal,
        otpCode: verifiedOtp,
        newPassword
      });

      setLoading(false);
      Alert.alert('Thành công', 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.', [
        {
          text: 'Đăng nhập ngay',
          onPress: () => {
            router.replace('/login' as any);
          },
        },
      ]);

      // Fallback in case the user dismisses alert unexpectedly.
      setTimeout(() => {
        router.replace('/login' as any);
      }, 600);
    } catch (err: any) {
      setErrorMsg(translateForgotPasswordError(err?.message));
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePassword = () => {
    const generated = generateStrongPassword();
    setNewPassword(generated);
    setConfirmPassword(generated);
    setGeneratedPassword(generated);
    setShowNewPassword(true);
    setShowConfirmPassword(true);
    setErrorMsg('');
  };

  const handleCopyPassword = async () => {
    const value = generatedPassword || newPassword;
    if (!value) {
      setErrorMsg('Chưa có mật khẩu để sao chép. Vui lòng bấm Tạo mật khẩu.');
      return;
    }

    try {
      const webClipboard =
        typeof navigator !== 'undefined' && (navigator as any).clipboard
          ? (navigator as any).clipboard
          : null;

      if (webClipboard?.writeText) {
        await webClipboard.writeText(value);
        return;
      }

      // Optional native clipboard path to avoid hard crash when module is unavailable.
      try {
        const expoClipboard = require('expo-clipboard') as {
          setStringAsync?: (text: string) => Promise<void>;
        };

        if (expoClipboard?.setStringAsync) {
          await expoClipboard.setStringAsync(value);
          return;
        }
      } catch {
        // no-op, fallback to Share below
      }

      await Share.share({ message: value });
    } catch {
      setErrorMsg('Không thể sao chép mật khẩu. Vui lòng thử lại.');
    }
  };

  const handleSavePassword = async () => {
    const value = generatedPassword || newPassword;
    if (!value) {
      setErrorMsg('Chưa có mật khẩu để lưu. Vui lòng bấm Tạo mật khẩu.');
      return;
    }

    try {
      await SecureStore.setItemAsync(
        GENERATED_PASSWORD_STORAGE_KEY,
        JSON.stringify({ value, savedAt: new Date().toISOString() }),
      );
    } catch {
      setErrorMsg('Không thể lưu mật khẩu trên thiết bị.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton 
          icon="arrow-left" 
          onPress={() => router.back()} 
          iconColor="#111827"
        />
        <Text variant="titleLarge" style={styles.headerTitle}>Quên mật khẩu</Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Surface style={styles.card} elevation={4}>
            
            {step === 'IDENTITY' && (
              <View>
                <Text variant="bodyMedium" style={styles.instruction}>
                  Nhập email xác thực. Chúng tôi sẽ gửi mã OTP để bắt đầu quy trình đặt lại mật khẩu.
                </Text>

                <TextInput
                  label="Email của bạn"
                  mode="outlined"
                  value={loginVal}
                  onChangeText={setLoginVal}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                  disabled={loading}
                  left={<TextInput.Icon icon="email-outline" />}
                />

                {!!errorMsg && (
                  <HelperText type="error" visible={!!errorMsg}>
                    {errorMsg}
                  </HelperText>
                )}

                <Button 
                  mode="contained" 
                  onPress={handleRequestOtp} 
                  loading={loading}
                  disabled={loading}
                  style={styles.actionButton}
                  contentStyle={styles.actionButtonContent}
                  labelStyle={styles.actionButtonLabel}
                >
                  GỬI MÃ OTP
                </Button>
              </View>
            )}

            {step === 'RESET' && (
              <View>
                <Text variant="bodyMedium" style={styles.instruction}>
                  Xác thực thành công. Vui lòng nhập mật khẩu mới cho tài khoản của bạn.
                </Text>

                <Text style={styles.passwordHintTitle}>Yêu cầu mật khẩu mới:</Text>
                <Text style={styles.passwordHint}>- Từ 10 đến 64 ký tự</Text>
                <Text style={styles.passwordHint}>- Không chứa khoảng trắng, không lặp cùng 1 ký tự quá 3 lần liên tiếp</Text>
                <Text style={styles.passwordHint}>- Có ít nhất 3 trong 4 nhóm: chữ hoa, chữ thường, số, ký tự đặc biệt</Text>

                <TextInput
                  label="Mật khẩu mới"
                  mode="outlined"
                  secureTextEntry={!showNewPassword}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  style={styles.input}
                  disabled={loading}
                  left={<TextInput.Icon icon="lock-outline" />}
                  right={
                    <TextInput.Icon
                      icon={showNewPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowNewPassword((prev) => !prev)}
                    />
                  }
                  placeholder="Từ 10 đến 64 ký tự"
                />

                <TextInput
                  label="Xác nhận mật khẩu"
                  mode="outlined"
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.input}
                  disabled={loading}
                  left={<TextInput.Icon icon="lock-check-outline" />}
                  right={
                    <TextInput.Icon
                      icon={showConfirmPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowConfirmPassword((prev) => !prev)}
                    />
                  }
                />

                <View style={styles.passwordActionsRow}>
                  <Button mode="outlined" compact icon="auto-fix" onPress={handleGeneratePassword} disabled={loading}>
                    Tạo mật khẩu
                  </Button>
                  <Button mode="outlined" compact icon="content-copy" onPress={() => void handleCopyPassword()} disabled={loading}>
                    Copy
                  </Button>
                  <Button mode="outlined" compact icon="content-save-outline" onPress={() => void handleSavePassword()} disabled={loading}>
                    Lưu
                  </Button>
                </View>
                {generatedPassword ? (
                  <Text style={styles.passwordGeneratedNote}>Đã tạo mật khẩu tự động. Bạn có thể Copy hoặc Lưu để dùng sau.</Text>
                ) : null}

                {!!errorMsg && (
                  <HelperText type="error" visible={!!errorMsg}>
                    {errorMsg}
                  </HelperText>
                )}

                <Button 
                  mode="contained" 
                  onPress={handleFinalReset} 
                  loading={loading}
                  disabled={loading}
                  style={styles.actionButton}
                  contentStyle={styles.actionButtonContent}
                  labelStyle={styles.actionButtonLabel}
                  buttonColor="green"
                >
                  XÁC NHẬN ĐẶT LẠI
                </Button>
              </View>
            )}

          </Surface>
        </ScrollView>
      </KeyboardAvoidingView>

      <OtpVerificationModal
        visible={showOtpModal}
        onDismiss={() => setShowOtpModal(false)}
        onVerify={async (code) => onOtpVerified(code)}
        onResend={handleRequestOtp}
        loading={otpLoading}
        loginIdentifier={loginVal}
        title="Xác thực OTP"
        subtitle="Mã 6 số đã được gửi vào hòm thư của bạn."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e5e7eb' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingTop: Platform.OS === 'ios' ? 54 : 34,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  headerTitle: { fontWeight: '900', marginLeft: 4, color: '#0f172a' },
  keyboardView: { flex: 1 },
  scrollContent: { padding: 20 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  instruction: {
    color: '#1f2937',
    marginBottom: 16,
    lineHeight: 22,
    fontWeight: '700',
    fontSize: 14,
  },
  input: { marginBottom: 12, backgroundColor: '#ffffff' },
  passwordHintTitle: {
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    fontSize: 14,
  },
  passwordHint: {
    color: '#334155',
    fontSize: 13,
    marginBottom: 3,
    fontWeight: '600',
  },
  passwordActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 8,
  },
  passwordGeneratedNote: {
    color: '#1d4ed8',
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '700',
  },
  actionButton: { 
    marginTop: 16, 
    borderRadius: 14, 
    justifyContent: 'center',
    elevation: 3,
  },
  actionButtonContent: {
    height: 52,
  },
  actionButtonLabel: {
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
