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

export async function updateProfile(
  payload: UpdateProfilePayload,
): Promise<UserProfile> {
  const { fullName, phone, email, locationCode, unit, avatarKey } = payload;

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

/** Remove the current user's avatar and reset to default. */
export async function deleteAvatar(): Promise<void> {
  return await ApiClient.delete("/users/me/avatar");
}

export async function changePassword(payload: {
  currentPassword?: string;
  newPassword?: string;
}): Promise<void> {
  return await ApiClient.post("/users/me/password", payload);
}

export async function getUserById(userId: string): Promise<UserProfile> {
  return await ApiClient.get(`/users/${encodeURIComponent(userId)}`);
}

export async function getUserPresence(userId: string): Promise<PresenceState> {
  return await ApiClient.get(`/users/${encodeURIComponent(userId)}/presence`);
}

/** Own presence state — same shape as getUserPresence but for the current user. */
export async function getMyPresence(): Promise<PresenceState> {
  return await ApiClient.get("/users/me/presence");
}

export async function searchUserExactByContact(
  query: string,
): Promise<UserProfile> {
  return await ApiClient.get(
    `/users/search?q=${encodeURIComponent(query.trim())}`,
  );
}

// ─── Contact alias ────────────────────────────────────────────────────────────

/**
 * Set a local alias (nickname) for a contact so they appear with a custom
 * display name in the conversation list.
 */
export async function setContactAlias(
  userId: string,
  alias: string,
): Promise<void> {
  return await ApiClient.put(
    `/users/me/contacts/${encodeURIComponent(userId)}/alias`,
    { alias },
  );
}

/** Remove the alias for a contact, reverting to their real display name. */
export async function deleteContactAlias(userId: string): Promise<void> {
  return await ApiClient.delete(
    `/users/me/contacts/${encodeURIComponent(userId)}/alias`,
  );
}
