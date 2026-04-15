import client from "./client";
import type { UserProfile } from "@urban/shared-types";

export type UpdateProfilePayload = Partial<UserProfile> & {
  avatarKey?: string;
};

export async function getProfile(): Promise<UserProfile> {
  return await client.get("/users/me");
}

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

  if (__DEV__) {
    console.debug('[updateProfile] /users/me payload', body);
  }

  return await client.patch("/users/me", body);
}

export async function getUserById(userId: string): Promise<UserProfile> {
  return await client.get(`/users/${encodeURIComponent(userId)}`);
}

