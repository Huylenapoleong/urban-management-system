import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { readWebToken } from './web-token-storage';
import { ENV_CONFIG } from '@/constants/env';

const rawUrl = ENV_CONFIG.API_BASE_URL;
// Ensure no trailing slash and has /api prefix
const API_BASE_URL = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
const FINAL_API_URL = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;

if (__DEV__) {
  console.log('[ApiClient] Base URL configured as:', FINAL_API_URL);
}

function extractErrorMessage(payload: any): string {
  if (!payload) {
    return 'API request failed';
  }

  // Handle NestJS validation errors where message is often an array
  if (Array.isArray(payload.message)) {
    return payload.message.join('\n');
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  // Handle nested error objects
  const nested = payload.error;
  if (nested) {
    if (Array.isArray(nested.message)) {
      return nested.message.join('\n');
    }
    if (typeof nested.message === 'string') {
      return nested.message;
    }
  }

  return 'API request failed';
}

export class ApiClient {
  static async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return readWebToken();
      }
      return await SecureStore.getItemAsync('auth_token');
    } catch (e) {
      return null;
    }
  }

  static async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const incomingHeaders =
      (options.headers as Record<string, string> | undefined) || {};
    const isFormDataBody =
      typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: Record<string, string> = {
      ...incomingHeaders,
    };

    if (!isFormDataBody && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const fullUrl = `${FINAL_API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    if (__DEV__) {
      console.log(`[ApiClient] Fetching: ${options.method || 'GET'} ${fullUrl}`);
    }

    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const error = new Error(extractErrorMessage(errorData));
      (error as any).status = response.status;
      (error as any).data = errorData;
      throw error;
    }

    const data = await response.json();
    // Assuming backend returns an envelope: { data: T, meta: any }
    return data.data !== undefined ? data.data : data;
  }

  static get<T = any>(
    endpoint: string,
    params?: Record<string, any>,
    options: RequestInit = {},
  ) {
    const searchParams = params
      ? '?' + new URLSearchParams(params as any).toString()
      : '';
    return this.request<T>(`${endpoint}${searchParams}`, {
      ...options,
      method: 'GET',
    });
  }

  static post<T = any>(endpoint: string, body?: any, options: RequestInit = {}) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static upload<T = any>(endpoint: string, formData: FormData) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
    });
  }

  static patch<T = any>(endpoint: string, body?: any, options: RequestInit = {}) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static delete<T = any>(endpoint: string, options: RequestInit = {}) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}
