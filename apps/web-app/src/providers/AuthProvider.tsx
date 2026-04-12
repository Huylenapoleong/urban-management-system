import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import type { JwtClaims } from '@urban/shared-types';
import { socketClient } from '../lib/socket-client';

export const AUTH_TOKEN_KEY = 'auth_token';

interface AuthContextType {
  user: JwtClaims | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function readStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function persistToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearStoredToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<JwtClaims | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const loadToken = () => {
      try {
        const token = readStoredToken();
        if (token) {
          const decoded = jwtDecode<JwtClaims>(token);
          if (decoded.exp * 1000 < Date.now()) {
            clearStoredToken();
            setUser(null);
          } else {
            setUser(decoded);
          }
        }
      } catch (e) {
        console.error('Failed to load token', e);
        clearStoredToken();
      } finally {
        setIsLoading(false);
      }
    };
    loadToken();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const nextUserId = user?.sub ?? null;

    if (
      previousUserIdRef.current !== null &&
      previousUserIdRef.current !== nextUserId
    ) {
      if (socketClient.socket?.connected) {
        socketClient.disconnect();
      }
    }

    // Connect socket if user is logged in
    if (user?.sub) {
      socketClient.connect().catch(console.error);
    }

    previousUserIdRef.current = nextUserId;
  }, [user?.sub, isLoading]);

  const login = (token: string) => {
    try {
      if (socketClient.socket?.connected) {
        socketClient.disconnect();
      }
      
      persistToken(token);
      const decoded = jwtDecode<JwtClaims>(token);
      setUser(decoded);
      socketClient.connect().catch(console.error);
    } catch (e) {
      console.error("Invalid token format on login", e);
      clearStoredToken();
      throw new Error("Phiên đăng nhập không hợp lệ");
    }
  };

  const logout = () => {
    if (socketClient.socket?.connected) {
      socketClient.disconnect();
    }
    clearStoredToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
