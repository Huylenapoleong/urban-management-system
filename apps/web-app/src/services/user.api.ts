import ApiClient from "@/lib/api-client";
import type { UserProfile } from "@urban/shared-types";

export async function getProfile(): Promise<UserProfile> {
  return await ApiClient.get("/users/me");
}

export type UpdateProfilePayload = Partial<UserProfile> & {
  avatarKey?: string;
};

export async function updateProfile(payload: UpdateProfilePayload): Promise<UserProfile> {
  const {
    fullName,
    phone,
    email,
    locationCode,
    unit,
    avatarKey,
    avatarUrl,
  } = payload;

  const body: UpdateProfilePayload = {
    ...(fullName !== undefined ? { fullName } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(locationCode !== undefined ? { locationCode } : {}),
    ...(unit !== undefined ? { unit } : {}),
    ...(avatarKey ? { avatarKey } : avatarUrl ? { avatarUrl } : {}),
  };

  if (import.meta.env.DEV) {
    console.debug('[updateProfile] /users/me payload', body);
  }

  return await ApiClient.patch("/users/me", body);
}

export async function changePassword(payload: { currentPassword?: string, newPassword?: string }): Promise<void> {
  return await ApiClient.post("/users/me/password", payload);
}

export async function getUserById(userId: string): Promise<UserProfile> {
  return await ApiClient.get(`/users/${encodeURIComponent(userId)}`);
}