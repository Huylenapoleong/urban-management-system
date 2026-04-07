import client from "./client";
import type { UserProfile } from "@urban/shared-types";

export async function getProfile(): Promise<UserProfile> {
  return await client.get("/users/me");
}

export async function updateProfile(payload: Partial<UserProfile>): Promise<UserProfile> {
  return await client.patch("/users/me", payload);
}

