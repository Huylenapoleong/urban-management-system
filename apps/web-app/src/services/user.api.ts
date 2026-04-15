import ApiClient from "@/lib/api-client";
import type { UserProfile } from "@urban/shared-types";

export interface PresenceState {
  userId: string;
  isActive: boolean;
  activeSocketCount: number;
  lastSeenAt?: string;
  occurredAt: string;
}

export async function getProfile(): Promise<UserProfile> {
  return await ApiClient.get("/users/me");
}

export type UpdateProfilePayload = {
  fullName?: string;
  phone?: string;
  email?: string;
  locationCode?: string;
  unit?: string;
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
  } = payload;

  const body: UpdateProfilePayload = {
    ...(fullName !== undefined ? { fullName } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(locationCode !== undefined ? { locationCode } : {}),
    ...(unit !== undefined ? { unit } : {}),
    ...(avatarKey ? { avatarKey } : {}),
  };

  return await ApiClient.patch("/users/me", body);
}

export async function changePassword(payload: { currentPassword?: string, newPassword?: string }): Promise<void> {
  return await ApiClient.post("/users/me/password", payload);
}

export async function getUserById(userId: string): Promise<UserProfile> {
  return await ApiClient.get(`/users/${encodeURIComponent(userId)}`);
}

export async function getUserPresence(userId: string): Promise<PresenceState> {
  return await ApiClient.get(`/users/${encodeURIComponent(userId)}/presence`);
}