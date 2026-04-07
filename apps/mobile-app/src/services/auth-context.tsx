import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "expo-router";
import type { UserProfile } from "@urban/shared-types";
import {
  getMe,
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
} from "./api/auth.api";
import { disconnectChatSocket } from "./chat-socket";

type AuthState = {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  login: (payload: { login: string; password: string }) => Promise<void>; // 🔥 FIX
  logout: () => Promise<void>;
  register: (payload: {
    fullName: string;
    email?: string;
    phone?: string;
    password: string;
    locationCode: string;
    avatarUrl?: string;
  }) => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  /// 🔥 chuẩn hóa error
  const getErrorMessage = (err: any) => {
    return err?.message || "Có lỗi xảy ra";
  };

const refreshUser = useCallback(async () => {
    try {
      setLoading(true);
      const profile = await getMe();
      setUser(profile);
      setError(null);
    } catch (err: any) {
      setUser(null);

      // 🔥 nếu 401 → không cần show lỗi
      if (err?.status !== 401) {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (payload: { login: string; password: string }) => {
    setLoading(true);
    try {
      const { user: u } = await loginApi(payload);
      setUser(u);
      setError(null);

      router.replace("/home");
    } catch (err: any) {
      setError(getErrorMessage(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const register = useCallback(async (payload: {
    fullName: string;
    email?: string;
    phone?: string;
    password: string;
    locationCode: string;
    avatarUrl?: string;
  }) => {
    setLoading(true);
    try {
      const { user: u } = await registerApi(payload);
      setUser(u);
      setError(null);

      router.replace("/home");
    } catch (err: any) {
      setError(getErrorMessage(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(async () => {
    await logoutApi();
    disconnectChatSocket();
    setUser(null);
    setError(null);

    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, error, login, logout, register, refreshUser }),
    [user, loading, error, login, logout, register, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
