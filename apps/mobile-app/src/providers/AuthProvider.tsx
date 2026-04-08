import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  logout: () => Promise<void>;
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

  return await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

async function persistToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    writeWebToken(token);
    return;
  }

  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
}

async function clearStoredToken(): Promise<void> {
  if (Platform.OS === 'web') {
    clearWebToken();
    return;
  }

  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
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

    const inAuthGroup = segments[0] === 'login';
    const isRoot = !segments[0];

    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user) {
      if (inAuthGroup || isRoot) {
        if (['ADMIN', 'PROVINCE_OFFICER', 'WARD_OFFICER'].includes(user.role)) {
          router.replace('/(official)' as any);
        } else {
          router.replace('/(citizen)' as any);
        }
      }
    }
  }, [user, isLoading, segments]);

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

  const login = async (phone: string, password: string) => {
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
  };

  const logout = async () => {
    socketClient.disconnect();
    disconnectChatSocket();
    await clearStoredToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
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
