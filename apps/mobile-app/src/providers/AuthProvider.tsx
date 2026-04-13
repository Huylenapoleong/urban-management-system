import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ApiClient } from '../lib/api-client';
import { jwtDecode } from 'jwt-decode';
import { JwtClaims } from '@urban/shared-types';
import { useRouter, useSegments } from 'expo-router';
import { socketClient } from '../lib/socket-client';
import { ACCESS_TOKEN_KEY, AUTH_TOKEN_KEY, clearWebToken, readWebToken, writeWebToken } from '../lib/web-token-storage';
import { disconnectChatSocket } from '../services/chat-socket';

interface AuthContextType {
  user: JwtClaims | null;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (payload: {
    fullName: string;
    password: string;
    locationCode: string;
    email?: string;
    phone?: string;
    avatarUrl?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;

  // New OTP & Account methods
  requestLoginOtp: (login: string) => Promise<void>;
  verifyLoginOtp: (login: string, otpCode: string) => Promise<void>;
  requestRegisterOtp: (login: string) => Promise<void>;
  verifyRegisterOtp: (login: string, otpCode: string) => Promise<void>;
  requestForgotPasswordOtp: (login: string) => Promise<void>;
  verifyForgotPasswordOtp: (login: string, otpCode: string) => Promise<void>;
  confirmForgotPassword: (payload: any) => Promise<void>;
  changePassword: (payload: any) => Promise<void>;
  requestChangePasswordOtp: () => Promise<void>;
  requestDeactivateAccountOtp: () => Promise<void>;
  deactivateAccount: (otpCode: string) => Promise<void>;
  requestDeleteAccountOtp: () => Promise<void>;
  deleteAccount: (otpCode: string) => Promise<void>;
  listSessions: () => Promise<any[]>;
  revokeSession: (sessionId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function readStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return readWebToken();
  }

  const secureToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  if (secureToken) {
    return secureToken;
  }

  return null;
}

async function persistToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    writeWebToken(token);
    return;
  }

  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

async function clearStoredToken(): Promise<void> {
  if (Platform.OS === 'web') {
    clearWebToken();
    return;
  }

  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<JwtClaims | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const loadToken = async () => {
      try {
        const token = await readStoredToken();
        if (token) {
          const decoded = jwtDecode<JwtClaims>(token);
          if (decoded.exp * 1000 < Date.now()) {
            await clearStoredToken();
            setUser(null);
          } else {
            setUser(decoded);
          }
        }
      } catch (e) {
        console.error('Failed to load token', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadToken();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const publicRoutes = ['login', 'register', 'forgot-password'];
    
    const currentSegments = segments as string[];
    // Check if we are in any public/auth-related route (handling possible group prefixes)
    const inAuthGroup = currentSegments.some(s => publicRoutes.includes(s)) || currentSegments.includes('(auth)');
    const isAtLogin = currentSegments.includes('login');
    const isRoot = currentSegments.length === 0 || (currentSegments.length === 1 && currentSegments[0] === '');

    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated and not on an auth page
      if (!isAtLogin) {
        router.replace('/login');
      }
    } else if (user) {
      // Redirect to dashboard if authenticated but still on an auth page or root
      if (inAuthGroup || isRoot) {
        if (['ADMIN', 'PROVINCE_OFFICER', 'WARD_OFFICER'].includes(user.role)) {
          router.replace('/(official)' as any);
        } else {
          router.replace('/(citizen)' as any);
        }
      }
    }
  }, [user, isLoading, segments.join('/')]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const nextUserId = user?.sub ?? null;

    if (
      previousUserIdRef.current !== null &&
      previousUserIdRef.current !== nextUserId
    ) {
      socketClient.disconnect();
      disconnectChatSocket();
    }

    previousUserIdRef.current = nextUserId;
  }, [user?.sub, isLoading]);

  const login = useCallback(async (phone: string, password: string) => {
    try {
      const response = await ApiClient.post<{ tokens: { accessToken: string } }>('/auth/login', { login: phone, password });

      if (response && response.tokens && response.tokens.accessToken) {
        const token = response.tokens.accessToken;

        socketClient.disconnect();
        disconnectChatSocket();
        await persistToken(token);

        const decoded = jwtDecode<JwtClaims>(token);
        setUser(decoded);
      } else {
        throw new Error('Đăng nhập thất bại.');
      }
    } catch (e: any) {
      throw new Error(e.message || 'Lỗi kết nối.');
    }
  }, []);

  const logout = useCallback(async () => {
    socketClient.disconnect();
    disconnectChatSocket();
    await clearStoredToken();
    setUser(null);
  }, []);

  const register = useCallback(async (payload: {
    fullName: string;
    password: string;
    locationCode: string;
    email?: string;
    phone?: string;
    avatarUrl?: string;
  }) => {
    try {
      const response = await ApiClient.post<{ tokens: { accessToken: string } }>('/auth/register', payload);

      if (response && response.tokens && response.tokens.accessToken) {
        const token = response.tokens.accessToken;

        socketClient.disconnect();
        disconnectChatSocket();
        await persistToken(token);

        const decoded = jwtDecode<JwtClaims>(token);
        setUser(decoded);
      } else {
        throw new Error('Đăng ký thất bại.');
      }
    } catch (e: any) {
      throw new Error(e.message || 'Lỗi kết nối.');
    }
  }, []);

  const requestLoginOtp = useCallback(async (login: string) => {
    await ApiClient.post('/auth/login/request-otp', { login });
  }, []);

  const verifyLoginOtp = useCallback(async (login: string, otpCode: string) => {
    const response = await ApiClient.post<{ tokens: { accessToken: string } }>('/auth/login/verify-otp', { login, otpCode });
    if (response?.tokens?.accessToken) {
      const token = response.tokens.accessToken;
      await persistToken(token);
      setUser(jwtDecode<JwtClaims>(token));
    }
  }, []);

  const requestRegisterOtp = useCallback(async (login: string) => {
    await ApiClient.post('/auth/register/request-otp', { login });
  }, []);

  const verifyRegisterOtp = useCallback(async (login: string, otpCode: string) => {
    const response = await ApiClient.post<{ tokens: { accessToken: string } }>('/auth/register/verify-otp', { login, otpCode });
    if (response?.tokens?.accessToken) {
      const token = response.tokens.accessToken;
      await persistToken(token);
      setUser(jwtDecode<JwtClaims>(token));
    }
  }, []);

  const requestForgotPasswordOtp = useCallback(async (login: string) => {
    await ApiClient.post('/auth/password/forgot/request', { login });
  }, []);

  const verifyForgotPasswordOtp = useCallback(async (login: string, otpCode: string) => {
    await ApiClient.post('/auth/password/forgot/verify', { login, otpCode });
  }, []);

  const confirmForgotPassword = useCallback(async (payload: any) => {
    await ApiClient.post('/auth/password/forgot/confirm', payload);
  }, []);

  const changePassword = useCallback(async (payload: any) => {
    await ApiClient.post('/auth/password/change', payload);
  }, []);

  const requestChangePasswordOtp = useCallback(async () => {
    await ApiClient.post('/auth/password/change/request-otp');
  }, []);

  const requestDeactivateAccountOtp = useCallback(async () => {
    await ApiClient.post('/auth/account/deactivate/request-otp');
  }, []);

  const deactivateAccount = useCallback(async (otpCode: string) => {
    await ApiClient.post('/auth/account/deactivate/confirm', { otpCode });
  }, []);

  const requestDeleteAccountOtp = useCallback(async () => {
    await ApiClient.post('/auth/account/delete/request-otp');
  }, []);

  const deleteAccount = useCallback(async (otpCode: string) => {
    await ApiClient.post('/auth/account/delete/confirm', { otpCode });
  }, []);

  const listSessions = useCallback(async () => {
    return await ApiClient.get<any[]>('/auth/sessions');
  }, []);

  const revokeSession = useCallback(async (sessionId: string) => {
    await ApiClient.delete(`/auth/sessions/${sessionId}`);
  }, []);

  const contextValue = useMemo(() => ({
    user,
    isLoading,
    login,
    register,
    logout,
    requestLoginOtp,
    verifyLoginOtp,
    requestRegisterOtp,
    verifyRegisterOtp,
    requestForgotPasswordOtp,
    verifyForgotPasswordOtp,
    confirmForgotPassword,
    changePassword,
    requestChangePasswordOtp,
    requestDeactivateAccountOtp,
    deactivateAccount,
    requestDeleteAccountOtp,
    deleteAccount,
    listSessions,
    revokeSession,
  }), [
    user, 
    isLoading, 
    login, 
    register, 
    logout, 
    requestLoginOtp, 
    verifyLoginOtp, 
    requestRegisterOtp, 
    verifyRegisterOtp, 
    requestForgotPasswordOtp, 
    verifyForgotPasswordOtp,
    confirmForgotPassword,
    changePassword,
    requestChangePasswordOtp,
    requestDeactivateAccountOtp,
    deactivateAccount,
    requestDeleteAccountOtp,
    deleteAccount,
    listSessions,
    revokeSession
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
