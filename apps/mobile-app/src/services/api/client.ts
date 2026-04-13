import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { AUTH_TOKEN_KEY, readWebToken } from "@/lib/web-token-storage";

export interface Envelope<T = any> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    statusCode: number;
  };
}

const client = axios.create({
  baseURL:
    process.env.EXPO_PUBLIC_API_URL ||
    process.env.API_BASE_URL ||
    "http://localhost:3001",
  timeout: 10000,
});

export async function readAccessToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return readWebToken();
  }

  const secureToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  if (secureToken) {
    return secureToken;
  }

  return null;
}

client.interceptors.request.use(async (config) => {
  const token = await readAccessToken();

  if (token) {
    config.headers = config.headers || {};
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

    throw {
      message: res.error?.message || "Unknown error",
      status: res.error?.statusCode,
    };
  },
  (error) => {
    return Promise.reject({
      message: error.response?.data?.error?.message || "Network error",
      status: error.response?.status,
    });
  }
);

export async function request<T>(promise: Promise<any>): Promise<T> {
  return promise;
}

export default client;
