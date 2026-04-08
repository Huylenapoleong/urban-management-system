import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import client, { request } from "./client";
import type { UserProfile } from "@urban/shared-types";
import { ACCESS_TOKEN_KEY, clearWebToken, writeWebToken } from "@/lib/web-token-storage";

type LoginRequest = {
  login: string;
  password: string;
};

type RegisterRequest = {
  fullName: string;
  email?: string;
  phone?: string;
  password: string;
  locationCode: string;
  avatarUrl?: string;
};

const persistToken = async (token: string) => {
  if (Platform.OS === "web") {
    writeWebToken(token);
    return;
  }

  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
};

const clearToken = async () => {
  if (Platform.OS === "web") {
    clearWebToken();
    return;
  }

  await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
};

export async function login(params: LoginRequest) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/login", params));

  await persistToken(data.tokens.accessToken);

  return data;
}

export async function register(params: RegisterRequest) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/register", params));

  await persistToken(data.tokens.accessToken);

  return data;
}

export async function getMe(): Promise<UserProfile> {
  return await request<UserProfile>(client.get("/users/me"));
}

export async function logout() {
  await clearToken();
}
