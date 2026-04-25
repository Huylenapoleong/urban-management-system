import { JwtClaims } from "@urban/shared-types";
import { useRouter, useSegments } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { jwtDecode } from "jwt-decode";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { ApiClient } from "../lib/api-client";
import { socketClient } from "../lib/socket-client";
import {
  AUTH_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  clearWebToken,
  readWebRefreshToken,
  readWebToken,
  writeWebTokens,
} from "../lib/web-token-storage";
import {
  connectChatSocket,
  disconnectChatSocket,
} from "../services/chat-socket";

type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
};

type AuthResponse = {
  tokens: AuthTokens;
};

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
  requestRegisterOtp: (
    payload:
      | {
          fullName: string;
          password: string;
          locationCode: string;
          email?: string;
          phone?: string;
          avatarUrl?: string;
        }
      | string,
  ) => Promise<void>;
  verifyRegisterOtp: (email: string, otpCode: string) => Promise<void>;
  requestForgotPasswordOtp: (login: string) => Promise<void>;
  verifyForgotPasswordOtp: (login: string, otpCode: string) => Promise<void>;
  confirmForgotPassword: (payload: any) => Promise<void>;
  changePassword: (payload: any) => Promise<void>;
  requestChangePasswordOtp: () => Promise<void>;
  requestDeactivateAccountOtp: () => Promise<void>;
  deactivateAccount: (otpCode: string) => Promise<void>;
  requestDeleteAccountOtp: () => Promise<void>;
  deleteAccount: (otpCode: string) => Promise<void>;
  listSessions: (options?: { signal?: AbortSignal }) => Promise<any[]>;
  revokeSession: (sessionId: string) => Promise<void>;
  requestUnlockAccountOtp: (login: string, password: string) => Promise<void>;
  confirmUnlockAccount: (
    login: string,
    password: string,
    otpCode: string,
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

type ApiErrorLike = {
  message?: string;
  status?: number;
  response?: {
    status?: number;
  };
};

function getApiErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as ApiErrorLike;
  return candidate.status ?? candidate.response?.status;
}

function getApiErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const candidate = error as ApiErrorLike;
  return (candidate.message ?? "").trim().toLowerCase();
}

function isExpectedRefreshFailure(error: unknown): boolean {
  const status = getApiErrorStatus(error);
  const message = getApiErrorMessage(error);

  if (status !== 401) {
    return false;
  }

  return (
    message.includes("refresh token session has been revoked") ||
    message.includes("refresh token session has expired") ||
    message.includes("user account is unavailable")
  );
}

async function readStoredToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return readWebToken();
  }

  const secureToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  if (secureToken) {
    return secureToken;
  }

  return null;
}

async function readStoredRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return readWebRefreshToken();
  }

  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

async function persistTokens(
  accessToken: string,
  refreshToken?: string,
): Promise<void> {
  if (Platform.OS === "web") {
    writeWebTokens(accessToken, refreshToken);
    return;
  }

  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, accessToken);
  if (refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  }
}

async function clearStoredTokens(): Promise<void> {
  if (Platform.OS === "web") {
    clearWebToken();
    return;
  }

  await Promise.all([
    SecureStore.deleteItemAsync(AUTH_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<JwtClaims | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();
  const currentSegments = useMemo(() => [...segments] as string[], [segments]);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const loadToken = async () => {
      try {
        const token = await readStoredToken();
        const refreshToken = await readStoredRefreshToken();

        if (token) {
          const decoded = jwtDecode<JwtClaims>(token);
          if (decoded.exp * 1000 < Date.now()) {
            if (!refreshToken) {
              await clearStoredTokens();
              setUser(null);
              return;
            }

            const refreshed = await ApiClient.post<AuthResponse>(
              "/auth/refresh",
              { refreshToken },
            );
            if (!refreshed?.tokens?.accessToken) {
              throw new Error(
                "Refresh token response did not include an access token.",
              );
            }

            await persistTokens(
              refreshed.tokens.accessToken,
              refreshed.tokens.refreshToken ?? refreshToken,
            );
            setUser(jwtDecode<JwtClaims>(refreshed.tokens.accessToken));
            return;
          }

          setUser(decoded);
          return;
        }

        if (refreshToken) {
          const refreshed = await ApiClient.post<AuthResponse>(
            "/auth/refresh",
            { refreshToken },
          );
          if (!refreshed?.tokens?.accessToken) {
            throw new Error(
              "Refresh token response did not include an access token.",
            );
          }

          await persistTokens(
            refreshed.tokens.accessToken,
            refreshed.tokens.refreshToken ?? refreshToken,
          );
          setUser(jwtDecode<JwtClaims>(refreshed.tokens.accessToken));
        }
      } catch (e) {
        if (isExpectedRefreshFailure(e)) {
          console.info(
            "[AuthProvider] Stored refresh token is no longer valid. Clearing local auth state.",
          );
        } else {
          console.error("Failed to load token", e);
        }
        await clearStoredTokens();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadToken();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const publicRoutes = ["login", "register", "forgot-password"];

    // Check if we are in any public/auth-related route (handling possible group prefixes)
    const inAuthGroup =
      currentSegments.some((s) => publicRoutes.includes(s)) ||
      currentSegments.includes("(auth)");
    const isAtLogin = currentSegments.includes("login");
    const isRoot =
      currentSegments.length === 0 ||
      (currentSegments.length === 1 && currentSegments[0] === "");

    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated and not on an auth page
      if (!isAtLogin) {
        router.replace("/login");
      }
    } else if (user) {
      // Redirect to dashboard if authenticated but still on an auth page or root
      if (inAuthGroup || isRoot) {
        if (["ADMIN", "PROVINCE_OFFICER", "WARD_OFFICER"].includes(user.role)) {
          router.replace("/(official)" as any);
        } else {
          router.replace("/(citizen)" as any);
        }
      }
    }
  }, [currentSegments, isLoading, router, user]);

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

  useEffect(() => {
    if (isLoading || !user?.sub) {
      return;
    }

    void connectChatSocket().catch((error) => {
      console.warn(
        "[AuthProvider] Failed to connect chat socket on auth",
        error,
      );
    });
  }, [user?.sub, isLoading]);

  const login = useCallback(async (phone: string, password: string) => {
    try {
      const response = await ApiClient.post<AuthResponse>("/auth/login", {
        login: phone,
        password,
      });

      if (response && response.tokens && response.tokens.accessToken) {
        const token = response.tokens.accessToken;

        socketClient.disconnect();
        disconnectChatSocket();
        await persistTokens(token, response.tokens.refreshToken);

        const decoded = jwtDecode<JwtClaims>(token);
        setUser(decoded);
      } else {
        throw new Error("Đăng nhập thất bại.");
      }
    } catch (e: any) {
      const error: any = new Error(e.message || "Lỗi kết nối.");
      if (e.response?.data?.errorCode) {
        error.errorCode = e.response.data.errorCode;
      } else if (e.errorCode) {
        error.errorCode = e.errorCode;
      }
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    socketClient.disconnect();
    disconnectChatSocket();
    const refreshToken = await readStoredRefreshToken();
    if (refreshToken) {
      await ApiClient.post("/auth/logout", { refreshToken }).catch(() => {});
    }
    await clearStoredTokens();
    setUser(null);
  }, []);

  const register = useCallback(
    async (payload: {
      fullName: string;
      password: string;
      locationCode: string;
      email?: string;
      phone?: string;
      avatarUrl?: string;
    }) => {
      try {
        const response = await ApiClient.post<AuthResponse>(
          "/auth/register",
          payload,
        );

        if (response && response.tokens && response.tokens.accessToken) {
          const token = response.tokens.accessToken;

          socketClient.disconnect();
          disconnectChatSocket();
          await persistTokens(token, response.tokens.refreshToken);

          const decoded = jwtDecode<JwtClaims>(token);
          setUser(decoded);
        } else {
          throw new Error("Đăng ký thất bại.");
        }
      } catch (e: any) {
        throw new Error(e.message || "Lỗi kết nối.");
      }
    },
    [],
  );

  const requestLoginOtp = useCallback(async (login: string) => {
    await ApiClient.post("/auth/login/request-otp", { login });
  }, []);

  const verifyLoginOtp = useCallback(async (login: string, otpCode: string) => {
    const response = await ApiClient.post<AuthResponse>(
      "/auth/login/verify-otp",
      { login, otpCode },
    );
    if (response?.tokens?.accessToken) {
      const token = response.tokens.accessToken;
      await persistTokens(token, response.tokens.refreshToken);
      setUser(jwtDecode<JwtClaims>(token));
    }
  }, []);

  const requestRegisterOtp = useCallback(
    async (
      payload:
        | {
            fullName: string;
            password: string;
            locationCode: string;
            email?: string;
            phone?: string;
            avatarUrl?: string;
          }
        | string,
    ) => {
      const body = typeof payload === "string" ? { email: payload } : payload;

      await ApiClient.post("/auth/register/request-otp", body);
    },
    [],
  );

  const verifyRegisterOtp = useCallback(
    async (email: string, otpCode: string) => {
      const response = await ApiClient.post<AuthResponse>(
        "/auth/register/verify-otp",
        {
          email,
          otpCode,
        },
      );
      if (response?.tokens?.accessToken) {
        const token = response.tokens.accessToken;
        await persistTokens(token, response.tokens.refreshToken);
        setUser(jwtDecode<JwtClaims>(token));
      }
    },
    [],
  );

  const requestForgotPasswordOtp = useCallback(async (login: string) => {
    await ApiClient.post("/auth/password/forgot/request", { login });
  }, []);

  const verifyForgotPasswordOtp = useCallback(
    async (login: string, otpCode: string) => {
      await ApiClient.post("/auth/password/forgot/verify", { login, otpCode });
    },
    [],
  );

  const confirmForgotPassword = useCallback(async (payload: any) => {
    await ApiClient.post("/auth/password/forgot/confirm", payload);
  }, []);

  const changePassword = useCallback(async (payload: any) => {
    await ApiClient.post("/auth/password/change", payload);
  }, []);

  const requestChangePasswordOtp = useCallback(async () => {
    await ApiClient.post("/auth/password/change/request-otp");
  }, []);

  const requestDeactivateAccountOtp = useCallback(async () => {
    await ApiClient.post("/auth/account/deactivate/request-otp");
  }, []);

  const deactivateAccount = useCallback(async (otpCode: string) => {
    await ApiClient.post("/auth/account/deactivate/confirm", { otpCode });
  }, []);

  const requestDeleteAccountOtp = useCallback(async () => {
    await ApiClient.post("/auth/account/delete/request-otp");
  }, []);

  const deleteAccount = useCallback(async (otpCode: string) => {
    await ApiClient.post("/auth/account/delete/confirm", { otpCode });
  }, []);

  const listSessions = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      return await ApiClient.get<any[]>("/auth/sessions", undefined, {
        signal: options?.signal,
      });
    },
    [],
  );

  const revokeSession = useCallback(async (sessionId: string) => {
    await ApiClient.delete(`/auth/sessions/${sessionId}`);
  }, []);

  const requestUnlockAccountOtp = useCallback(
    async (login: string, password: string) => {
      await ApiClient.post("/auth/unlock/request-otp", { login, password });
    },
    [],
  );

  const confirmUnlockAccount = useCallback(
    async (login: string, password: string, otpCode: string) => {
      const response = await ApiClient.post<AuthResponse>(
        "/auth/unlock/confirm",
        { login, password, otpCode },
      );
      if (response?.tokens?.accessToken) {
        const token = response.tokens.accessToken;
        socketClient.disconnect();
        disconnectChatSocket();
        await persistTokens(token, response.tokens.refreshToken);
        setUser(jwtDecode<JwtClaims>(token));
      }
    },
    [],
  );

  const contextValue = useMemo(
    () => ({
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
      requestUnlockAccountOtp,
      confirmUnlockAccount,
    }),
    [
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
      requestUnlockAccountOtp,
      confirmUnlockAccount,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
