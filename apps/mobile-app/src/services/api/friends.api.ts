import client from "./client";
import type { UserFriendItem } from "@urban/shared-types";

export interface FriendListParams {
  cursor?: string;
  limit?: number;
}

export async function listMyFriends(params?: FriendListParams): Promise<UserFriendItem[]> {
  const response: any = await client.get("/users/me/friends", { params: { limit: params?.limit || 100 } });
  
  // Handling backend envelope structure if custom
  if (response && Array.isArray(response.items)) {
    return response.items;
  }
  
  return Array.isArray(response) ? response : [];
}
