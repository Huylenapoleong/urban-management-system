import { BrandingConfig } from "../config/branding";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    count?: number;
    nextCursor?: string;
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.baseUrl = BrandingConfig.settings.apiBaseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    const raw = this.token || localStorage.getItem("authToken");
    if (!raw) return null;
    // Strip extra quotes if token was JSON.stringify'd when saved
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : raw;
    } catch {
      return raw;
    }
  }

  private async parseResponseBody(response: Response): Promise<any> {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return text ? { message: text } : null;
    }

    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        return null;
      }

      try {
        const refreshResponse = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken }),
        });

        const refreshData = await this.parseResponseBody(refreshResponse);
        if (!refreshResponse.ok || !refreshData?.success || !refreshData?.data?.tokens?.accessToken) {
          localStorage.removeItem("authToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("currentUser");
          this.setToken(null);
          return null;
        }

        const newAccessToken = refreshData.data.tokens.accessToken as string;
        localStorage.setItem("authToken", newAccessToken);
        this.setToken(newAccessToken);

        if (refreshData.data.tokens.refreshToken) {
          localStorage.setItem("refreshToken", refreshData.data.tokens.refreshToken);
        }

        return newAccessToken;
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private getHeaders(headers?: Record<string, string>) {
    const defaultHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const token = localStorage.getItem("authToken");
    if (token) {
      defaultHeaders["Authorization"] = `Bearer ${token}`;
    }

    return { ...defaultHeaders, ...headers };
  }

  async request<T = any>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    endpoint: string,
    options?: {
      body?: any;
      headers?: Record<string, string>;
      params?: Record<string, any>;
      retryOn401?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    try {
      let url = `${this.baseUrl}${endpoint}`;

      // Add query parameters
      if (options?.params) {
        const queryParams = new URLSearchParams();
        Object.entries(options.params).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            queryParams.append(key, String(value));
          }
        });
        url += `?${queryParams.toString()}`;
      }

      const response = await fetch(url, {
        method,
        headers: this.getHeaders(options?.headers),
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      const data = await this.parseResponseBody(response);

      const isAuthEndpoint = endpoint.startsWith("/auth/");
      const shouldRetry = options?.retryOn401 !== false;
      if (response.status === 401 && shouldRetry && !isAuthEndpoint) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.request<T>(method, endpoint, {
            ...options,
            retryOn401: false,
          });
        }
      }

      if (!response.ok) {
        const errorMessage =
          data?.error?.message || data?.message || data?.error || `HTTP ${response.status}`;
        return {
          success: false,
          error: Array.isArray(errorMessage) ? errorMessage.join(", ") : String(errorMessage),
        };
      }

      return {
        success: true,
        data: data.data,
        message: data.message,
        meta: data.meta,
      };
    } catch (error) {
      console.error(`API Error [${method} ${endpoint}]:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  get<T = any>(
    endpoint: string,
    options?: { headers?: Record<string, string>; params?: Record<string, any> }
  ) {
    return this.request<T>("GET", endpoint, options);
  }

  post<T = any>(
    endpoint: string,
    body?: any,
    options?: { headers?: Record<string, string> }
  ) {
    return this.request<T>("POST", endpoint, { body, ...options });
  }

  put<T = any>(
    endpoint: string,
    body?: any,
    options?: { headers?: Record<string, string> }
  ) {
    return this.request<T>("PUT", endpoint, { body, ...options });
  }

  patch<T = any>(
    endpoint: string,
    body?: any,
    options?: { headers?: Record<string, string> }
  ) {
    return this.request<T>("PATCH", endpoint, { body, ...options });
  }

  delete<T = any>(
    endpoint: string,
    options?: { headers?: Record<string, string> }
  ) {
    return this.request<T>("DELETE", endpoint, options);
  }
}

export const apiClient = new ApiClient();
