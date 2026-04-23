import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, StatusBar, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Text, TextInput, Button, Surface, HelperText, Portal, Modal } from 'react-native-paper';
import { useAuth } from '../providers/AuthProvider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';
const LOGIN_HERO_IMAGE =
  'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=1470&auto=format&fit=crop';

export default function LoginScreen() {
  const { login, requestUnlockAccountOtp, confirmUnlockAccount } = useAuth();
  const router = useRouter();
  
  const [loginVal, setLoginVal] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockOtp, setUnlockOtp] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockStep, setUnlockStep] = useState<'PROMPT' | 'OTP'>('PROMPT');
  const [unlockError, setUnlockError] = useState('');

  const handleLogin = async () => {
    setErrorMsg('');
    if (!loginVal || !password) {
      setErrorMsg('Vui lòng nhập Tài khoản và mật khẩu');
      return;
    }

    try {
      setLoading(true);
      await login(loginVal, password);
    } catch (err: any) {
      if (err.errorCode === 'ACCOUNT_LOCKED') {
        setShowUnlockModal(true);
        setUnlockStep('PROMPT');
        setUnlockOtp('');
        setUnlockError('');
      } else {
        setErrorMsg(err.message || 'Đăng nhập không thành công');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestUnlock = async () => {
    try {
      setUnlockLoading(true);
      setUnlockError('');
      await requestUnlockAccountOtp(loginVal, password);
      setUnlockStep('OTP');
    } catch (e: any) {
      setUnlockError(e.message || 'Lỗi gửi mã OTP');
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleConfirmUnlock = async () => {
    if (!unlockOtp || unlockOtp.trim().length < 4) {
      setUnlockError('Vui lòng nhập mã OTP hợp lệ');
      return;
    }
    try {
      setUnlockLoading(true);
      setUnlockError('');
      await confirmUnlockAccount(loginVal, password, unlockOtp);
      setShowUnlockModal(false);
    } catch (e: any) {
      setUnlockError(e.message || 'Mã OTP không đúng hoặc đã hết hạn');
    } finally {
      setUnlockLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <View style={styles.headerImage}>
        <Image
          source={{ uri: LOGIN_HERO_IMAGE }}
          style={styles.headerPhoto}
          contentFit="cover"
          cachePolicy="memory-disk"
          placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
          transition={180}
        />
        <View style={styles.headerOverlay}>
          <MaterialCommunityIcons name="city-variant-outline" size={60} color="#fff" style={styles.logo} />
          <Text style={styles.brandTitle}>URBAN{'\n'}MANAGEMENT</Text>
          <Text style={styles.brandSubtitle}>Hệ thống vận hành Đô thị Thông minh</Text>
        </View>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Surface style={styles.loginCard} elevation={4}>
          <Text variant="headlineSmall" style={styles.cardTitle}>
            Đăng nhập
          </Text>
          <Text variant="bodyMedium" style={styles.cardSubtitle}>
            Nhập thông tin xác thực để tiếp tục
          </Text>

          <TextInput
            label="Số điện thoại hoặc Email"
            mode="outlined"
            value={loginVal}
            onChangeText={setLoginVal}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            contentStyle={styles.inputContent}
            disabled={loading}
            outlineColor="#e0e0e0"
            activeOutlineColor={colors.secondary}
            left={<TextInput.Icon icon="account-outline" color="#9e9e9e" />}
            placeholder="Nhập email hoặc số điện thoại"
            placeholderTextColor="#6b7280"
          />

          <TextInput
            label="Mật khẩu"
            mode="outlined"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            style={styles.input}
            contentStyle={styles.inputContent}
            disabled={loading}
            outlineColor="#e0e0e0"
            activeOutlineColor={colors.secondary}
            left={<TextInput.Icon icon="lock-outline" color="#9e9e9e" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword((prev) => !prev)}
              />
            }
            placeholder="Nhập mật khẩu"
            placeholderTextColor="#6b7280"
          />

          {!!errorMsg && (
            <HelperText type="error" visible={!!errorMsg} style={styles.errorText}>
              {errorMsg}
            </HelperText>
          )}

          <Button 
            mode="contained" 
            onPress={handleLogin} 
            disabled={loading}
            style={styles.loginButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            buttonColor={colors.secondary}
          >
            ĐĂNG NHẬP
          </Button>

          <View style={styles.forgotPasswordContainer}>
            <Button 
              mode="text" 
              onPress={() => {
                console.log('[Login] Navigating to forgot-password');
                router.push('/forgot-password');
              }}
              labelStyle={styles.forgotPasswordLink}
              compact
            >
              Quên mật khẩu?
            </Button>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Bạn chưa có tài khoản? </Text>
            <Pressable onPress={() => router.push('/register')}>
              <Text style={styles.footerLink}>Đăng ký ngay</Text>
            </Pressable>
          </View>
        </Surface>
      </KeyboardAvoidingView>

      <Portal>
        <Modal 
          visible={showUnlockModal} 
          onDismiss={() => {
            if (!unlockLoading) setShowUnlockModal(false);
          }}
          contentContainerStyle={styles.unlockModal}
          dismissable={!unlockLoading}
        >
          {unlockStep === 'PROMPT' ? (
            <View style={styles.unlockContainer}>
              <View style={styles.unlockIconWrapper}>
                <MaterialCommunityIcons name="lock-alert" size={48} color="#ef4444" />
              </View>
              <Text style={styles.unlockTitle}>Tài khoản bị khóa</Text>
              <Text style={styles.unlockDescription}>
                Tài khoản của bạn hiện đang bị khóa. Bạn có muốn sử dụng email đăng ký để nhận mã OTP và mở khóa tài khoản ngay không?
              </Text>
              
              {!!unlockError && (
                <Text style={styles.unlockErrorText}>{unlockError}</Text>
              )}

              <Button 
                mode="contained" 
                onPress={handleRequestUnlock} 
                disabled={unlockLoading}
                buttonColor={colors.secondary}
                style={styles.unlockBtn}
                contentStyle={styles.unlockBtnContent}
              >
                GỬI MÃ OTP MỞ KHÓA
              </Button>
              <Button 
                mode="text" 
                onPress={() => setShowUnlockModal(false)}
                disabled={unlockLoading}
                style={styles.unlockCancelBtn}
                textColor="#64748b"
              >
                HỦY
              </Button>
            </View>
          ) : (
            <View style={styles.unlockContainer}>
              <View style={styles.unlockIconWrapperSuccess}>
                <MaterialCommunityIcons name="email-fast" size={48} color="#10b981" />
              </View>
              <Text style={styles.unlockTitle}>Nhập mã OTP</Text>
              <Text style={styles.unlockDescription}>
                Mã xác thực đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư đến.
              </Text>

              <TextInput
                mode="outlined"
                label="Mã OTP"
                value={unlockOtp}
                onChangeText={setUnlockOtp}
                keyboardType="number-pad"
                style={styles.otpInput}
                disabled={unlockLoading}
                activeOutlineColor={colors.secondary}
                maxLength={6}
              />

              {!!unlockError && (
                <Text style={styles.unlockErrorText}>{unlockError}</Text>
              )}

              <Button 
                mode="contained" 
                onPress={handleConfirmUnlock} 
                disabled={unlockLoading}
                buttonColor={colors.secondary}
                style={styles.unlockBtn}
                contentStyle={styles.unlockBtnContent}
              >
                XÁC NHẬN MỞ KHÓA
              </Button>
              <Button 
                mode="text" 
                onPress={() => {
                  setUnlockStep('PROMPT');
                  setUnlockError('');
                }}
                disabled={unlockLoading}
                style={styles.unlockCancelBtn}
                textColor="#64748b"
              >
                QUAY LẠI
              </Button>
            </View>
          )}
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerImage: { width: '100%', height: 350, backgroundColor: colors.backgroundDark, overflow: 'hidden' },
  headerPhoto: { ...StyleSheet.absoluteFillObject },
  headerOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  logo: { marginBottom: 16 },
  brandTitle: { color: '#ffffff', fontSize: 32, fontWeight: '700', letterSpacing: 0, textAlign: 'center', lineHeight: 38 },
  brandSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 14, marginTop: 12, letterSpacing: 0, fontWeight: '600' },
  
  keyboardView: { flex: 1, marginTop: -60 },
  loginCard: {
    marginHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    paddingTop: 32,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
  },
  cardTitle: { fontWeight: '700', textAlign: 'center', color: colors.text, marginBottom: 6 },
  cardSubtitle: { textAlign: 'center', color: colors.textSecondary, marginBottom: 28, fontWeight: '600' },
  
  input: { marginBottom: 16, backgroundColor: colors.background },
  inputContent: { fontWeight: '600', color: colors.text },
  
  errorText: { paddingHorizontal: 0, marginTop: -8, marginBottom: 8, fontSize: 13, fontWeight: '700' },
  
  loginButton: { marginTop: 8, borderRadius: 12 },
  buttonContent: { height: 50 },
  buttonLabel: { fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  
  forgotPasswordContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  forgotPasswordLink: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: '#334155', fontSize: 14, fontWeight: '700' },
  footerLink: { color: colors.secondary, fontSize: 14, fontWeight: '700' },
  
  unlockModal: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 24,
    padding: 0,
    overflow: 'hidden'
  },
  unlockContainer: {
    padding: 24,
    alignItems: 'center',
  },
  unlockIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  unlockIconWrapperSuccess: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  unlockTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center'
  },
  unlockDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22
  },
  unlockErrorText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center'
  },
  unlockBtn: {
    width: '100%',
    borderRadius: 12,
  },
  unlockBtnContent: {
    height: 48,
  },
  unlockCancelBtn: {
    width: '100%',
    marginTop: 8,
  },
  otpInput: {
    width: '100%',
    marginBottom: 16,
    backgroundColor: '#fafafa',
    textAlign: 'center',
    fontSize: 20,
    letterSpacing: 8,
    fontWeight: '700'
  }
});
