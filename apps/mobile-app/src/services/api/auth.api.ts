import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import client, { request } from "./client";
import type { UserProfile } from "@urban/shared-types";
import { AUTH_TOKEN_KEY, clearWebToken, writeWebToken } from "@/lib/web-token-storage";

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

type OtpRequest = {
  login: string;
};

type OtpVerifyRequest = {
  login: string;
  otpCode: string;
};

const persistToken = async (token: string) => {
  if (Platform.OS === "web") {
    writeWebToken(token);
    return;
  }

  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
};

const clearToken = async () => {
  if (Platform.OS === "web") {
    clearWebToken();
    return;
  }

  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
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
  return await request<UserProfile>(client.get("/auth/me"));
}

export async function requestRegisterOtp(params: { login: string }) {
  return await request(client.post("/auth/register/request-otp", params));
}

export async function verifyRegisterOtp(params: OtpVerifyRequest) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/register/verify-otp", params));

  await persistToken(data.tokens.accessToken);
  return data;
}

export async function requestLoginOtp(params: OtpRequest) {
  return await request(client.post("/auth/login/request-otp", params));
}

export async function verifyLoginOtp(params: OtpVerifyRequest) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/login/verify-otp", params));

  await persistToken(data.tokens.accessToken);
  return data;
}

export async function refresh(params: { refreshToken: string }) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/refresh", params));

  await persistToken(data.tokens.accessToken);
  return data;
}

export async function logout(params?: { refreshToken: string }) {
  if (params) {
    await request(client.post("/auth/logout", params));
  }
  await clearToken();
}

export async function requestForgotPasswordOtp(params: { login: string }) {
  return await request(client.post("/auth/password/forgot/request", params));
}

export async function confirmForgotPassword(params: any) {
  return await request(client.post("/auth/password/forgot/confirm", params));
}

export async function listSessions() {
  return await request<any[]>(client.get("/auth/sessions"));
}

export async function revokeSession(sessionId: string) {
  return await request(client.delete(`/auth/sessions/${sessionId}`));
}

export async function dismissSessionHistory(sessionId: string) {
  return await request(client.delete(`/auth/sessions/${sessionId}/history`));
}

export async function logoutAll() {
  await request(client.post("/auth/logout-all"));
  await clearToken();
}

export async function requestChangePasswordOtp() {
  return await request(client.post("/auth/password/change/request-otp"));
}

export async function changePassword(params: any) {
  return await request(client.post("/auth/password/change", params));
}

export async function requestDeactivateAccountOtp() {
  return await request(client.post("/auth/account/deactivate/request-otp"));
}

export async function confirmDeactivateAccount(params: { otpCode: string }) {
  return await request(client.post("/auth/account/deactivate/confirm", params));
}

export async function requestReactivateAccountOtp(params: { login: string }) {
  return await request(client.post("/auth/account/reactivate/request-otp", params));
}

export async function confirmReactivateAccount(params: OtpVerifyRequest) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/account/reactivate/confirm", params));

  await persistToken(data.tokens.accessToken);
  return data;
}

export async function requestDeleteAccountOtp() {
  return await request(client.post("/auth/account/delete/request-otp"));
}

export async function confirmDeleteAccount(params: { otpCode: string }) {
  return await request(client.post("/auth/account/delete/confirm", params));
}
