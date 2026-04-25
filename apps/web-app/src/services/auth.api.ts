import client, {
  clearStoredTokens,
  request,
  writeAccessToken,
  writeRefreshToken,
} from "@/lib/api-client";
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

export type ForgotPasswordRequest = {
  login: string;
};

export type ForgotPasswordConfirmRequest = {
  login: string;
  otpCode: string;
  newPassword: string;
};

export type ChangePasswordWithOtpRequest = {
  currentPassword: string;
  newPassword: string;
  otpCode: string;
};

export async function login(params: LoginRequest) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/login", params));

  writeAccessToken(data.tokens.accessToken);
  writeRefreshToken(data.tokens.refreshToken);
  return data;
}

export async function register(params: RegisterRequest) {
  const data = await request<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserProfile;
  }>(client.post("/auth/register", params));

  writeAccessToken(data.tokens.accessToken);
  writeRefreshToken(data.tokens.refreshToken);
  return data;
}

export async function getMe(): Promise<UserProfile> {
  return await request<UserProfile>(client.get("/users/me"));
}

export async function requestForgotPasswordOtp(params: ForgotPasswordRequest) {
  return await request<{ requested: boolean }>(
    client.post("/auth/password/forgot/request", params),
  );
}

export async function confirmForgotPassword(
  params: ForgotPasswordConfirmRequest,
) {
  return await request<{
    passwordResetAt: string;
    revokedSessionCount?: number;
  }>(client.post("/auth/password/forgot/confirm", params));
}

export async function requestChangePasswordOtp() {
  return await request<{
    otpRequested: boolean;
    purpose: string;
    maskedEmail: string;
    expiresAt: string;
    resendAvailableAt: string;
  }>(client.post("/auth/password/change/request-otp"));
}

export async function changePasswordWithOtp(
  params: ChangePasswordWithOtpRequest,
) {
  return await request<{
    passwordChangedAt: string;
    revokedSessionCount: number;
    currentSessionRevoked: boolean;
  }>(client.post("/auth/password/change", params));
}

export async function logout() {
  clearStoredTokens();
}
