import client from "./client";
import type { GroupMetadata, GroupMembership } from "@urban/shared-types";

export async function listGroups(params?: {
  mine?: boolean;
  q?: string;
  groupType?: string;
  locationCode?: string;
  limit?: number;
}): Promise<GroupMetadata[]> {
  return await client.get("/groups", { params });
}

export async function createGroup(data: {
  groupName: string;
  groupType: string;
  locationCode: string;
  description?: string;
}): Promise<GroupMetadata> {
  return await client.post("/groups", data);
}

export async function getGroup(groupId: string): Promise<GroupMetadata> {
  return await client.get(`/groups/${encodeURIComponent(groupId)}`);
}

export async function updateGroup(
  groupId: string,
  data: {
    groupName?: string;
    description?: string;
    groupType?: string;
    locationCode?: string;
    isOfficial?: boolean;
  },
): Promise<GroupMetadata> {
  return await client.patch(`/groups/${encodeURIComponent(groupId)}`, data);
}

export async function joinGroup(groupId: string): Promise<GroupMembership> {
  return await client.post(`/groups/${encodeURIComponent(groupId)}/join`);
}

export async function leaveGroup(groupId: string): Promise<void> {
  await client.post(`/groups/${encodeURIComponent(groupId)}/leave`);
}

export async function listMembers(groupId: string): Promise<GroupMembership[]> {
  const path = `/groups/${encodeURIComponent(groupId)}/members`;
  return await client.get(path);
}

export async function updateMember(groupId: string, userId: string, role: string): Promise<GroupMembership> {
  return await client.patch(`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, { role });
}

