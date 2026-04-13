import ApiClient from "@/lib/api-client";
import { readAccessToken } from "@/lib/api-client";
import type {
  UserDirectoryItem,
  UserFriendItem,
  UserFriendRequestItem,
  UserProfile,
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

function isExactLookupKeyword(input?: string): boolean {
  const value = input?.trim() ?? "";
  if (!value) {
    return false;
  }

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const digitsOnly = value.replace(/\D/g, "");
  const looksLikePhone = digitsOnly.length >= 10;
  return looksLikeEmail || looksLikePhone;
}

function toDirectoryItemFromProfile(profile: UserProfile): DiscoverFriendItem {
  return {
    userId: profile.id,
    fullName: profile.fullName,
    role: profile.role,
    locationCode: profile.locationCode,
    avatarAsset: profile.avatarAsset,
    avatarUrl: profile.avatarUrl,
    status: profile.status,
    relationState: "NONE",
    canMessage: false,
    canSendFriendRequest: true,
    email: profile.email,
    phone: profile.phone,
    exactMatch: true,
  };
}

async function searchExactUserByPhoneOrEmail(keyword: string): Promise<DiscoverFriendItem | null> {
  try {
    const profile = await ApiClient.get(`/users/search?q=${encodeURIComponent(keyword)}`, {
      headers: {
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    }) as UserProfile;
    if (!profile?.id) {
      return null;
    }
    return toDirectoryItemFromProfile(profile);
  } catch {
    return null;
  }
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
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
  const keyword = params?.q?.trim();
  const query = buildQuery({
    mode: "friend",
    q: keyword,
    cursor: params?.cursor,
    limit: params?.limit ?? 20,
  });
  const discovered = await ApiClient.get(`/users/discover${query}`, {
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  }) as DiscoverFriendItem[];

  if (!keyword || !isExactLookupKeyword(keyword)) {
    return discovered;
  }

  const exactUser = await searchExactUserByPhoneOrEmail(keyword);
  if (!exactUser) {
    return discovered;
  }

  if (discovered.some((item) => item.userId === exactUser.userId)) {
    return discovered;
  }

  return [exactUser, ...discovered];
}

export async function listMyFriends(params?: FriendListParams): Promise<UserFriendItem[]> {
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
  return await getCursorPage<UserFriendRequestItem>(`/users/me/friend-requests${query}`);
}

export async function sendFriendRequest(userId: string): Promise<UserFriendRequestItem> {
  return await ApiClient.post(`/users/me/friends/${encodeURIComponent(userId)}/request`);
}

export async function acceptFriendRequest(userId: string): Promise<UserFriendItem> {
  return await ApiClient.post(`/users/me/friend-requests/${encodeURIComponent(userId)}/accept`);
}

export async function rejectFriendRequest(userId: string): Promise<{ success: boolean }> {
  return await ApiClient.post(`/users/me/friend-requests/${encodeURIComponent(userId)}/reject`);
}

export async function cancelFriendRequest(userId: string): Promise<{ success: boolean }> {
  return await ApiClient.post(`/users/me/friend-requests/${encodeURIComponent(userId)}/cancel`);
}

export async function removeFriend(userId: string): Promise<{ success: boolean }> {
  return await ApiClient.delete(`/users/me/friends/${encodeURIComponent(userId)}`);
}
