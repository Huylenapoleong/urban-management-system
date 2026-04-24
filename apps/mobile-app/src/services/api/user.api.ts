import client from "./client";
import type { UserBlockedItem, UserProfile } from "@urban/shared-types";

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

export async function listUsers(params?: any): Promise<UserProfile[]> {
  return await client.get("/users", { params });
}

export async function createUser(data: any): Promise<UserProfile> {
  return await client.post("/users", data);
}

export async function discoverUsers(params?: any): Promise<any[]> {
  return await client.get("/users/discover", { params });
}

export async function searchExactUser(query: string): Promise<UserProfile> {
  return await client.get("/users/search", { params: { q: query } });
}

export async function getUserPresence(userId: string): Promise<any> {
  return await client.get(`/users/${encodeURIComponent(userId)}/presence`);
}

export async function getMyPresence(): Promise<any> {
  return await client.get("/users/me/presence");
}

export async function updateUserStatus(userId: string, status: string): Promise<UserProfile> {
  return await client.patch(`/users/${encodeURIComponent(userId)}/status`, { status });
}

export async function listFriends(params?: any): Promise<any[]> {
  return await client.get("/users/me/friends", { params });
}

export async function listFriendRequests(params?: any): Promise<any[]> {
  return await client.get("/users/me/friend-requests", { params });
}

export async function sendFriendRequest(userId: string): Promise<any> {
  return await client.post(`/users/me/friends/${encodeURIComponent(userId)}/request`);
}

export async function acceptFriendRequest(userId: string): Promise<any> {
  return await client.post(`/users/me/friend-requests/${encodeURIComponent(userId)}/accept`);
}

export async function rejectFriendRequest(userId: string): Promise<any> {
  return await client.post(`/users/me/friend-requests/${encodeURIComponent(userId)}/reject`);
}

export async function cancelFriendRequest(userId: string): Promise<any> {
  return await client.post(`/users/me/friend-requests/${encodeURIComponent(userId)}/cancel`);
}

export async function removeFriend(userId: string): Promise<any> {
  return await client.delete(`/users/me/friends/${encodeURIComponent(userId)}`);
}

export async function listPushDevices(): Promise<any[]> {
  return await client.get("/users/me/push-devices");
}

export async function registerPushDevice(data: any): Promise<any> {
  return await client.post("/users/me/push-devices", data);
}

export async function deletePushDevice(deviceId: string): Promise<void> {
  await client.delete(`/users/me/push-devices/${encodeURIComponent(deviceId)}`);
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export async function deleteAvatar(): Promise<void> {
  await client.delete("/users/me/avatar");
}

// ─── Blocks ───────────────────────────────────────────────────────────────────

export async function listBlocks(): Promise<UserBlockedItem[]> {
  return await client.get("/users/me/blocks");
}

export async function blockUser(userId: string): Promise<UserBlockedItem> {
  return await client.post(`/users/me/blocks/${encodeURIComponent(userId)}`);
}

export async function unblockUser(userId: string): Promise<UserBlockedItem> {
  return await client.delete(`/users/me/blocks/${encodeURIComponent(userId)}`);
}

// ─── Contact alias ────────────────────────────────────────────────────────────

export async function setContactAlias(
  userId: string,
  alias: string,
): Promise<void> {
  await client.put(
    `/users/me/contacts/${encodeURIComponent(userId)}/alias`,
    { alias },
  );
}

export async function deleteContactAlias(userId: string): Promise<void> {
  await client.delete(
    `/users/me/contacts/${encodeURIComponent(userId)}/alias`,
  );
}
