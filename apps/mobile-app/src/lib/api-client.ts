import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

let API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001') + '/api';

if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  API_BASE_URL = 'http://localhost:3001/api';
}

export class ApiClient {
  static async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem('auth_token');
      }
      return await SecureStore.getItemAsync('auth_token');
    } catch (e) {
      return null;
    }
  }

  static async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[ApiClient] Request failed:', {
        endpoint,
        status: response.status,
        errorData
      });
      
      const errorMessage = Array.isArray(errorData.message) 
        ? errorData.message.join(', ') 
        : (errorData.message || 'API request failed');
        
      throw new Error(errorMessage);
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
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static upload<T = any>(endpoint: string, formData: FormData) {
    // Note: When uploading FormData, Fetch will automatically set the correct 
    // Content-Type with boundary if we DON'T set it manually.
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
    });
  }

  static patch<T = any>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static delete<T = any>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}
