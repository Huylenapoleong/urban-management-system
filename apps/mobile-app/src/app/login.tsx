import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ImageBackground, StatusBar, Pressable } from 'react-native';
import { Text, TextInput, Button, Surface, HelperText } from 'react-native-paper';
import { useAuth } from '../providers/AuthProvider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  
  const [loginVal, setLoginVal] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
      setErrorMsg(err.message || 'Đăng nhập không thành công');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <ImageBackground 
        source={{ uri: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=1470&auto=format&fit=crop' }} 
        style={styles.headerImage}
      >
        <View style={styles.headerOverlay}>
          <MaterialCommunityIcons name="city-variant-outline" size={60} color="#fff" style={styles.logo} />
          <Text style={styles.brandTitle}>URBAN{'\n'}MANAGEMENT</Text>
          <Text style={styles.brandSubtitle}>Hệ thống vận hành Đô thị Thông minh</Text>
        </View>
      </ImageBackground>

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
            disabled={loading}
            outlineColor="#e0e0e0"
            activeOutlineColor="#1976D2"
            left={<TextInput.Icon icon="account-outline" color="#9e9e9e" />}
          />

          <TextInput
            label="Mật khẩu"
            mode="outlined"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            disabled={loading}
            outlineColor="#e0e0e0"
            activeOutlineColor="#1976D2"
            left={<TextInput.Icon icon="lock-outline" color="#9e9e9e" />}
          />

          {!!errorMsg && (
            <HelperText type="error" visible={!!errorMsg} style={styles.errorText}>
              {errorMsg}
            </HelperText>
          )}

          <Button 
            mode="contained" 
            onPress={handleLogin} 
            loading={loading}
            disabled={loading}
            style={styles.loginButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            buttonColor="#1976D2"
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  headerImage: { width: '100%', height: 350, backgroundColor: '#024285' },
  headerOverlay: { flex: 1, backgroundColor: 'rgba(0,35,90,0.65)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  logo: { marginBottom: 16 },
  brandTitle: { color: '#ffffff', fontSize: 32, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 38 },
  brandSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 12, letterSpacing: 0.5 },
  
  keyboardView: { flex: 1, marginTop: -60 },
  loginCard: {
    marginHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    paddingTop: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
  },
  cardTitle: { fontWeight: '800', textAlign: 'center', color: '#1a1a1a', marginBottom: 6 },
  cardSubtitle: { textAlign: 'center', color: '#757575', marginBottom: 28 },
  
  input: { marginBottom: 16, backgroundColor: '#fafafa' },
  
  errorText: { paddingHorizontal: 0, marginTop: -8, marginBottom: 8, fontSize: 13 },
  
  loginButton: { marginTop: 8, borderRadius: 12 },
  buttonContent: { height: 50 },
  buttonLabel: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  
  forgotPasswordContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  forgotPasswordLink: {
    color: '#757575',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: '#757575', fontSize: 14 },
  footerLink: { color: '#1976D2', fontSize: 14, fontWeight: '700' }
});
