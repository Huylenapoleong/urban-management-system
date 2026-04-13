import ApiClient from "@/lib/api-client";
import type { UserProfile } from "@urban/shared-types";

export async function getProfile(): Promise<UserProfile> {
  return await ApiClient.get("/users/me");
}

export async function updateProfile(payload: Partial<UserProfile>): Promise<UserProfile> {
  return await ApiClient.patch("/users/me", payload);
}

export async function changePassword(payload: { currentPassword?: string, newPassword?: string }): Promise<void> {
  return await ApiClient.post("/users/me/password", payload);
}

export async function getUserById(userId: string): Promise<UserProfile> {
  return await ApiClient.get(`/users/${encodeURIComponent(userId)}`);
}