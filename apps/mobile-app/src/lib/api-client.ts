import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { readWebToken } from './web-token-storage';
import { ENV_CONFIG } from '@/constants/env';

const API_BASE_URL = ENV_CONFIG.API_BASE_URL;

function extractErrorMessage(payload: any): string {
  if (!payload) {
    return 'API request failed';
  }

  const directMessage =
    typeof payload.message === 'string' ? payload.message : undefined;
  const nestedMessage =
    typeof payload.error?.message === 'string'
      ? payload.error.message
      : Array.isArray(payload.error?.message)
        ? payload.error.message.join(', ')
        : undefined;

  return nestedMessage || directMessage || 'API request failed';
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

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(extractErrorMessage(errorData));
    }

    const data = await response.json();
    // Assuming backend returns an envelope: { data: T, meta: any }
    return data.data !== undefined ? data.data : data;
  }

  static get<T = any>(endpoint: string, params?: Record<string, any>) {
    const searchParams = params
      ? '?' + new URLSearchParams(params as any).toString()
      : '';
    return this.request<T>(`${endpoint}${searchParams}`, { method: 'GET' });
  }

  static post<T = any>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, {
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

  static patch<T = any>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static delete<T = any>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}
