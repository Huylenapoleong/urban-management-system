import axios from "axios";

export interface Envelope<T = any> {
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

export const AUTH_TOKEN_KEY = "auth_token";

export function readAccessToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function writeAccessToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

client.interceptors.request.use((config) => {
  const token = readAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
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
  (error) => {
    return Promise.reject({
      message: error.response?.data?.error?.message || error.message || "Network error",
      status: error.response?.status,
      originalError: error
    });
  }
);

export async function request<T>(promise: Promise<any>): Promise<T> {
  return promise;
}

export default client;
