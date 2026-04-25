import axios, { type AxiosError } from "axios";

export interface Envelope<T = unknown> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    statusCode: number;
  };
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001/api",
  timeout: 10000,
});
const refreshClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001/api",
  timeout: 10000,
});

export const AUTH_TOKEN_KEY = "auth_token";
export const REFRESH_TOKEN_KEY = "refresh_token";
const WEB_APP_VARIANT = "citizen-web";
let refreshAccessTokenPromise: Promise<string | null> | null = null;

type ApiErrorEnvelope = {
  error?: {
    message?: string;
    statusCode?: number;
  };
};

function detectWebSessionScope(): "WEB_DESKTOP" | "WEB_MOBILE" {
  if (typeof navigator === "undefined") {
    return "WEB_DESKTOP";
  }

  const userAgent = navigator.userAgent?.toLowerCase() ?? "";
  const isMobile =
    /android|iphone|ipad|ipod|mobile|ios|blackberry|iemobile|opera mini/.test(
      userAgent,
    );
  return isMobile ? "WEB_MOBILE" : "WEB_DESKTOP";
}

export function buildSessionMetadataHeaders(): Record<string, string> {
  return {
    "x-app-variant": WEB_APP_VARIANT,
    "x-session-scope": detectWebSessionScope(),
  };
}

export function readAccessToken(): string | null {
  return (
    sessionStorage.getItem(AUTH_TOKEN_KEY) ??
    localStorage.getItem(AUTH_TOKEN_KEY)
  );
}

export function writeAccessToken(token: string): void {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function readRefreshToken(): string | null {
  return (
    sessionStorage.getItem(REFRESH_TOKEN_KEY) ??
    localStorage.getItem(REFRESH_TOKEN_KEY)
  );
}

export function writeRefreshToken(token: string): void {
  sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearRefreshToken(): void {
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearStoredTokens(): void {
  clearAccessToken();
  clearRefreshToken();
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshAccessTokenPromise) {
    return refreshAccessTokenPromise;
  }

  refreshAccessTokenPromise = (async () => {
    const refreshToken = readRefreshToken();
    if (!refreshToken) {
      clearStoredTokens();
      return null;
    }

    try {
      const sessionHeaders = buildSessionMetadataHeaders();
      const response = await refreshClient.post(
        "/auth/refresh",
        {
          refreshToken,
        },
        {
          headers: {
            "x-app-variant": sessionHeaders["x-app-variant"],
            "x-session-scope": sessionHeaders["x-session-scope"],
          },
        },
      );

      const payload = response?.data;
      const accessToken = payload?.data?.tokens?.accessToken;
      const nextRefreshToken = payload?.data?.tokens?.refreshToken;

      if (!accessToken || !nextRefreshToken) {
        clearStoredTokens();
        return null;
      }

      writeAccessToken(accessToken);
      writeRefreshToken(nextRefreshToken);
      return accessToken;
    } catch {
      clearStoredTokens();
      return null;
    } finally {
      refreshAccessTokenPromise = null;
    }
  })();

  return refreshAccessTokenPromise;
}

function normalizeConversationRoute(url?: string): string | undefined {
  if (!url) {
    return url;
  }

  const match = url.match(/(\/conversations\/)([^/?#]+)(.*)/i);
  if (!match) {
    return url;
  }

  const [, prefix, encodedId, suffix] = match;
  let rawId = encodedId;

  try {
    rawId = decodeURIComponent(encodedId);
  } catch {
    rawId = encodedId;
  }

  if (!/^grp#/i.test(rawId)) {
    return url;
  }

  const groupId = rawId.replace(/^grp#/i, "").trim();
  if (!groupId) {
    return url;
  }

  const normalizedId = `group:${groupId}`;
  return `${prefix}${encodeURIComponent(normalizedId)}${suffix}`;
}

client.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};

  const sessionHeaders = buildSessionMetadataHeaders();
  config.headers["x-app-variant"] = sessionHeaders["x-app-variant"];
  config.headers["x-session-scope"] = sessionHeaders["x-session-scope"];

  const token = readAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.url = normalizeConversationRoute(config.url);
  return config;
});

client.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res.success) {
      return res.data;
    }
    return Promise.reject({
      message: res.error?.message || "Unknown error",
      status: res.error?.statusCode,
    });
  },
  async (error: AxiosError<ApiErrorEnvelope>) => {
    const originalRequest = error?.config as
      | (typeof error.config & { _retry?: boolean })
      | undefined;
    const status = error?.response?.status;
    const requestUrl = String(originalRequest?.url || "");
    const isAuthEndpoint = /\/auth\/(login|register|refresh|logout)/i.test(
      requestUrl,
    );

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;
      const nextAccessToken = await refreshAccessToken();
      if (nextAccessToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
        return client(originalRequest);
      }
    }

    return Promise.reject({
      message:
        error.response?.data?.error?.message ||
        error.message ||
        "Network error",
      status: error.response?.status,
      originalError: error,
    });
  },
);

export async function request<T>(promise: Promise<T>): Promise<T> {
  return await promise;
}

export default client;
