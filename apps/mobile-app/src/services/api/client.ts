import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const ACCESS_TOKEN_KEY = "access_token";

/// 📦 Envelope type cho API response
export interface Envelope<T = any> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    statusCode: number;
  };
}

const client = axios.create({
  baseURL: process.env.API_BASE_URL || "http://localhost:3001/api",
  timeout: 10000,
});

/// 🔐 Request interceptor: tự động gắn token
client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/// 📦 Response interceptor: unwrap envelope
client.interceptors.response.use(
  (response) => {
    const res = response.data;

    if (res.success) {
      return res.data; // ✅ trả data luôn
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

/// 🔥 Helper để fix typing (QUAN TRỌNG)
export async function request<T>(promise: Promise<any>): Promise<T> {
  return promise;
}

export default client;