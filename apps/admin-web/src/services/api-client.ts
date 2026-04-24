import { BrandingConfig } from '../config/branding';

type QueryParamValue = string | number | boolean | null | undefined;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
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

  constructor() {
    this.baseUrl = BrandingConfig.settings.apiBaseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    const raw = this.token || localStorage.getItem('authToken');
    if (!raw) return null;
    // Strip extra quotes if token was JSON.stringify'd when saved
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : raw;
    } catch {
      return raw;
    }
  }

  private getHeaders(headers?: Record<string, string>) {
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = localStorage.getItem('authToken');
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    return { ...defaultHeaders, ...headers };
  }

  async request<T = unknown, TBody = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    options?: {
      body?: TBody;
      headers?: Record<string, string>;
      params?: Record<string, QueryParamValue>;
    },
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

      const data = (await response.json()) as {
        data?: T;
        message?: string;
        meta?: ApiResponse<T>['meta'];
      };

      if (!response.ok) {
        return {
          success: false,
          error: data.message || `HTTP ${response.status}`,
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
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  get<T = unknown>(
    endpoint: string,
    options?: {
      headers?: Record<string, string>;
      params?: Record<string, QueryParamValue>;
    },
  ) {
    return this.request<T>('GET', endpoint, options);
  }

  post<T = unknown, TBody = unknown>(
    endpoint: string,
    body?: TBody,
    options?: { headers?: Record<string, string> },
  ) {
    return this.request<T, TBody>('POST', endpoint, { body, ...options });
  }

  put<T = unknown, TBody = unknown>(
    endpoint: string,
    body?: TBody,
    options?: { headers?: Record<string, string> },
  ) {
    return this.request<T, TBody>('PUT', endpoint, { body, ...options });
  }

  patch<T = unknown, TBody = unknown>(
    endpoint: string,
    body?: TBody,
    options?: { headers?: Record<string, string> },
  ) {
    return this.request<T, TBody>('PATCH', endpoint, { body, ...options });
  }

  delete<T = unknown>(
    endpoint: string,
    options?: { headers?: Record<string, string> },
  ) {
    return this.request<T>('DELETE', endpoint, options);
  }
}

export const apiClient = new ApiClient();
