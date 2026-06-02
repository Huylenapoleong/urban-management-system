import type { JwtClaims } from "@urban/shared-types";
import { jwtDecode } from "jwt-decode";
import React, { useEffect, useRef, useState } from "react";
import {
  clearStoredTokens,
  readAccessToken,
  refreshAccessToken,
  writeAccessToken,
} from "../lib/api-client";
import { socketClient } from "../lib/socket-client";
import { AuthContext } from "./auth-context";
import { AlertCircle, LogOut } from "lucide-react";

function readStoredToken(): string | null {
  return readAccessToken();
}

function persistToken(token: string): void {
  writeAccessToken(token);
}

function clearStoredToken(): void {
  clearStoredTokens();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<JwtClaims | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isKicked, setIsKicked] = useState(false);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const loadToken = () => {
      const tryLoad = async () => {
        try {
          const token = readStoredToken();
          if (token) {
            const decoded = jwtDecode<JwtClaims>(token);
            if (decoded.exp * 1000 >= Date.now()) {
              setUser(decoded);
              return;
            }
          }

          const refreshedToken = await refreshAccessToken();
          if (!refreshedToken) {
            clearStoredToken();
            setUser(null);
            return;
          }

          const refreshedClaims = jwtDecode<JwtClaims>(refreshedToken);
          setUser(refreshedClaims);
        } catch (e) {
          console.error("Failed to load token", e);
          clearStoredToken();
          setUser(null);
        } finally {
          setIsLoading(false);
        }
      };

      void tryLoad();
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
      socketClient.connect().then(() => {
        if (socketClient.socket) {
          socketClient.socket.on("auth.kick", () => {
            console.warn("[Auth] Session kicked by another device");
            setIsKicked(true);
            logout();
          });
        }
      }).catch(console.error);
    }

    return () => {
      socketClient.socket?.off("auth.kick");
    };

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
      
      {isKicked && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
              <AlertCircle size={32} />
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
              Phiên đăng nhập hết hạn
            </h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Tài khoản của bạn vừa được đăng nhập từ một thiết bị hoặc trình duyệt khác. Để bảo mật, phiên hiện tại đã bị đăng xuất.
            </p>
            <button
              onClick={() => {
                setIsKicked(false);
                window.location.href = "/login";
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-all hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98]"
            >
              <LogOut size={18} />
              Đăng nhập lại
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
