import ApiClient, {
  buildSessionMetadataHeaders,
  readAccessToken,
} from "@/lib/api-client";
import type {
  UserBlockedItem,
  UserDirectoryItem,
  UserFriendItem,
  UserFriendRequestItem,
} from "@urban/shared-types";

export type DiscoverFriendItem = UserDirectoryItem & {
  email?: string;
  phone?: string;
  exactMatch?: boolean;
};

export interface CursorPage<T> {
  items: T[];
  nextCursor?: string;
}

export interface FriendListParams {
  cursor?: string;
  limit?: number;
}

export interface BlockActionResult {
  userId: string;
  blockedAt?: string;
  unblockedAt?: string;
}

function buildQuery(
  params?: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  if (!params) {
    return "";
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    search.append(key, String(value));
  });

  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

async function getCursorPage<T>(path: string): Promise<CursorPage<T>> {
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
  const token = readAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      ...buildSessionMetadataHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const message =
      payload?.error?.message || payload?.message || "Request failed";
    throw {
      message,
      status: response.status,
    };
  }

  return {
    items: Array.isArray(payload?.data) ? payload.data : [],
    nextCursor:
      typeof payload?.meta?.nextCursor === "string"
        ? payload.meta.nextCursor
        : undefined,
  };
}

export async function discoverFriendCandidates(params?: {
  q?: string;
  cursor?: string;
  limit?: number;
}): Promise<DiscoverFriendItem[]> {
  const query = buildQuery({
    mode: "friend",
    q: params?.q?.trim(),
    cursor: params?.cursor,
    limit: params?.limit ?? 20,
  });
  return (await ApiClient.get(`/users/discover${query}`, {
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  })) as DiscoverFriendItem[];
}

export async function listMyFriends(
  params?: FriendListParams,
): Promise<UserFriendItem[]> {
  const page = await listMyFriendsPage(params);
  return page.items;
}

export async function listMyFriendsPage(
  params?: FriendListParams,
): Promise<CursorPage<UserFriendItem>> {
  const query = buildQuery({
    cursor: params?.cursor,
    limit: params?.limit ?? 50,
  });
  return await getCursorPage<UserFriendItem>(`/users/me/friends${query}`);
}

export async function listMyFriendRequests(params?: {
  direction: "INCOMING" | "OUTGOING";
  cursor?: string;
  limit?: number;
}): Promise<UserFriendRequestItem[]> {
  const page = await listMyFriendRequestsPage(params);
  return page.items;
}

export async function listMyFriendRequestsPage(params?: {
  direction: "INCOMING" | "OUTGOING";
  cursor?: string;
  limit?: number;
}): Promise<CursorPage<UserFriendRequestItem>> {
  const query = buildQuery({
    direction: params?.direction,
    cursor: params?.cursor,
    limit: params?.limit ?? 50,
  });
  return await getCursorPage<UserFriendRequestItem>(
    `/users/me/friend-requests${query}`,
  );
}

export async function listMyBlockedUsers(
  params?: FriendListParams,
): Promise<UserBlockedItem[]> {
  const page = await listMyBlockedUsersPage(params);
  return page.items;
}

export async function listMyBlockedUsersPage(
  params?: FriendListParams,
): Promise<CursorPage<UserBlockedItem>> {
  const query = buildQuery({
    cursor: params?.cursor,
    limit: params?.limit ?? 50,
  });
  return await getCursorPage<UserBlockedItem>(`/users/me/blocks${query}`);
}

export async function sendFriendRequest(
  userId: string,
): Promise<UserFriendRequestItem> {
  return await ApiClient.post(
    `/users/me/friends/${encodeURIComponent(userId)}/request`,
  );
}

export async function acceptFriendRequest(
  userId: string,
): Promise<UserFriendItem> {
  return await ApiClient.post(
    `/users/me/friend-requests/${encodeURIComponent(userId)}/accept`,
  );
}

export async function rejectFriendRequest(
  userId: string,
): Promise<{ success: boolean }> {
  return await ApiClient.post(
    `/users/me/friend-requests/${encodeURIComponent(userId)}/reject`,
  );
}

export async function cancelFriendRequest(
  userId: string,
): Promise<{ success: boolean }> {
  return await ApiClient.post(
    `/users/me/friend-requests/${encodeURIComponent(userId)}/cancel`,
  );
}

export async function removeFriend(
  userId: string,
): Promise<{ success: boolean }> {
  return await ApiClient.delete(
    `/users/me/friends/${encodeURIComponent(userId)}`,
  );
}

export async function blockUser(userId: string): Promise<BlockActionResult> {
  return await ApiClient.post(`/users/me/blocks/${encodeURIComponent(userId)}`);
}

export async function unblockUser(userId: string): Promise<BlockActionResult> {
  return await ApiClient.delete(
    `/users/me/blocks/${encodeURIComponent(userId)}`,
  );
}
