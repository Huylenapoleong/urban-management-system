import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ApiClient } from '../lib/api-client';
import { jwtDecode } from 'jwt-decode';
import { JwtClaims } from '@urban/shared-types';
import { useRouter, useSegments } from 'expo-router';

interface AuthContextType {
  user: JwtClaims | null;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<JwtClaims | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const loadToken = async () => {
      try {
        let token;
        if (Platform.OS === 'web') {
          token = localStorage.getItem('auth_token');
        } else {
          token = await SecureStore.getItemAsync('auth_token');
        }
        if (token) {
          const decoded = jwtDecode<JwtClaims>(token);
          if (decoded.exp * 1000 < Date.now()) {
            // Token expired
            if (Platform.OS === 'web') {
              localStorage.removeItem('auth_token');
            } else {
              await SecureStore.deleteItemAsync('auth_token');
            }
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
      // Redirect to login if not authenticated
      router.replace('/login');
    } else if (user) {
      if (inAuthGroup || isRoot) {
        if (['ADMIN', 'PROVINCE_OFFICER', 'WARD_OFFICER'].includes(user.role)) {
          router.replace('/(official)');
        } else {
          router.replace('/(citizen)' as any);
        }
      }
    }
  }, [user, isLoading, segments]);

  const login = async (phone: string, password: string) => {
    try {
      const response = await ApiClient.post<{ tokens: { accessToken: string } }>('/auth/login', { login: phone, password });

      if (response && response.tokens && response.tokens.accessToken) {
        const token = response.tokens.accessToken;

        if (Platform.OS === 'web') {
          localStorage.setItem('auth_token', token);
        } else {
          await SecureStore.setItemAsync('auth_token', token);
        }

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
    if (Platform.OS === 'web') {
      localStorage.removeItem('auth_token');
    } else {
      await SecureStore.deleteItemAsync('auth_token');
    }
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
