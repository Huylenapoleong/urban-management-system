import React, { useState, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, Surface, HelperText, IconButton } from 'react-native-paper';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'expo-router';
import { OtpVerificationModal } from '@/components/auth/OtpVerificationModal';

type ForgotPasswordStep = 'IDENTITY' | 'RESET';

export default function ForgotPasswordScreen() {
  const { requestForgotPasswordOtp, verifyForgotPasswordOtp, confirmForgotPassword } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<ForgotPasswordStep>('IDENTITY');
  const [loginVal, setLoginVal] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifiedOtp, setVerifiedOtp] = useState('');
  
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
    if (newPassword.length < 10) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 10 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp');
      return;
    }

    try {
      setLoading(true);
      await confirmForgotPassword({
        login: loginVal,
        otpCode: verifiedOtp,
        newPassword
      });
      
      router.replace('/login');
    } catch (err: any) {
      setErrorMsg(err.message || 'Đặt lại mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton 
          icon="arrow-left" 
          onPress={() => router.back()} 
          iconColor="#1a1a1a"
        />
        <Text variant="titleLarge" style={styles.headerTitle}>Quên mật khẩu</Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Surface style={styles.card} elevation={2}>
            
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

                <TextInput
                  label="Mật khẩu mới"
                  mode="outlined"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  style={styles.input}
                  disabled={loading}
                  left={<TextInput.Icon icon="lock-outline" />}
                  placeholder="Tối thiểu 10 ký tự"
                />

                <TextInput
                  label="Xác nhận mật khẩu"
                  mode="outlined"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.input}
                  disabled={loading}
                  left={<TextInput.Icon icon="lock-check-outline" />}
                />

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
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingTop: Platform.OS === 'ios' ? 54 : 34,
    paddingBottom: 12,
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: { fontWeight: '900', marginLeft: 4, color: '#1a1a1a' },
  keyboardView: { flex: 1 },
  scrollContent: { padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    marginTop: 10,
  },
  instruction: {
    color: '#475467',
    marginBottom: 24,
    lineHeight: 22,
    fontWeight: '500',
  },
  input: { marginBottom: 12, backgroundColor: '#fff' },
  actionButton: { 
    marginTop: 16, 
    borderRadius: 14, 
    height: 52, 
    justifyContent: 'center',
    elevation: 2,
  },
});
