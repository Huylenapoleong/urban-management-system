import client, { request, writeAccessToken, clearAccessToken } from "@/lib/api-client";
import type { UserProfile } from "@urban/shared-types";

export type LoginRequest = {
  login: string;
  password: string;
};

export type RegisterRequest = {
  fullName: string;
  email?: string;
  phone?: string;
  password: string;
  locationCode: string;
  avatarUrl?: string;
};

export async function login(params: LoginRequest) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/login", params));

  writeAccessToken(data.tokens.accessToken);
  return data;
}

export async function register(params: RegisterRequest) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/register", params));

  writeAccessToken(data.tokens.accessToken);
  return data;
}

export async function getMe(): Promise<UserProfile> {
  return await request<UserProfile>(client.get("/users/me"));
}

export async function logout() {
  clearAccessToken();
}
