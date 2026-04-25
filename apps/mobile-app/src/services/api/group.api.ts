import type {
  GroupBan,
  GroupInviteLink,
  GroupMembership,
  GroupMetadata,
} from "@urban/shared-types";
import client from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupMemberRole = "OWNER" | "DEPUTY" | "MEMBER";
export type GroupMessagePolicy = "ALL" | "ADMIN_ONLY";

export interface GroupListParams {
  mine?: boolean;
  q?: string;
  groupType?: string;
  locationCode?: string;
  cursor?: string;
  limit?: number;
}

export interface CreateGroupInput {
  groupName: string;
  groupType: string;
  locationCode: string;
  description?: string;
  isOfficial?: boolean;
  messagePolicy?: GroupMessagePolicy;
}

export interface UpdateGroupInput {
  groupName?: string;
  groupType?: string;
  locationCode?: string;
  description?: string;
  isOfficial?: boolean;
  messagePolicy?: GroupMessagePolicy;
}

export interface AddGroupMemberInput {
  userId: string;
  roleInGroup?: Extract<GroupMemberRole, "DEPUTY" | "MEMBER">;
}

export interface UpdateGroupMemberRoleInput {
  roleInGroup: Extract<GroupMemberRole, "DEPUTY" | "MEMBER">;
}

export interface LeaveGroupInput {
  successorUserId?: string;
}

export interface TransferOwnershipInput {
  newOwnerUserId: string;
}

export interface CreateInviteLinkInput {
  expiresAt?: string;
  maxUses?: number;
}

export interface BanGroupMemberInput {
  reason?: string;
  expiresAt?: string;
}

// ─── Group CRUD ───────────────────────────────────────────────────────────────

export async function listGroups(
  params?: GroupListParams,
): Promise<GroupMetadata[]> {
  return await client.get("/groups", { params });
}

export async function createGroup(
  data: CreateGroupInput,
): Promise<GroupMetadata> {
  return await client.post("/groups", data);
}

export async function getGroup(groupId: string): Promise<GroupMetadata> {
  return await client.get(`/groups/${encodeURIComponent(groupId)}`);
}

export async function updateGroup(
  groupId: string,
  data: UpdateGroupInput,
): Promise<GroupMetadata> {
  return await client.patch(`/groups/${encodeURIComponent(groupId)}`, data);
}

/** Hard delete — prefer dissolveGroup for production use */
export async function deleteGroup(groupId: string): Promise<GroupMetadata> {
  return await client.delete(`/groups/${encodeURIComponent(groupId)}`);
}

/**
 * Production-friendly alias for deletion.
 * Marks the group deleted, schedules cleanup, and revokes member chat access.
 */
export async function dissolveGroup(groupId: string): Promise<GroupMetadata> {
  return await client.post(`/groups/${encodeURIComponent(groupId)}/dissolve`);
}

// ─── Ownership ────────────────────────────────────────────────────────────────

export async function transferOwnership(
  groupId: string,
  data: TransferOwnershipInput,
): Promise<{ previousOwner: GroupMembership; newOwner: GroupMembership }> {
  return await client.post(
    `/groups/${encodeURIComponent(groupId)}/ownership-transfer`,
    data,
  );
}

// ─── Membership ───────────────────────────────────────────────────────────────

export async function joinGroup(groupId: string): Promise<GroupMembership> {
  return await client.post(`/groups/${encodeURIComponent(groupId)}/join`);
}

export async function leaveGroup(
  groupId: string,
  payload?: LeaveGroupInput,
): Promise<GroupMembership> {
  return await client.post(
    `/groups/${encodeURIComponent(groupId)}/leave`,
    payload ?? {},
  );
}

export async function listMembers(groupId: string): Promise<GroupMembership[]> {
  return await client.get(`/groups/${encodeURIComponent(groupId)}/members`);
}

export async function addMember(
  groupId: string,
  payload: AddGroupMemberInput,
): Promise<GroupMembership> {
  return await client.post(
    `/groups/${encodeURIComponent(groupId)}/members`,
    payload,
  );
}

export async function updateMemberRole(
  groupId: string,
  userId: string,
  payload: UpdateGroupMemberRoleInput,
): Promise<GroupMembership> {
  return await client.patch(
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/role`,
    payload,
  );
}

export async function removeMember(
  groupId: string,
  userId: string,
): Promise<GroupMembership> {
  return await client.delete(
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
  );
}

// ─── Bans ─────────────────────────────────────────────────────────────────────

export async function listBans(groupId: string): Promise<GroupBan[]> {
  return await client.get(`/groups/${encodeURIComponent(groupId)}/bans`);
}

export async function banMember(
  groupId: string,
  userId: string,
  payload?: BanGroupMemberInput,
): Promise<GroupBan> {
  return await client.post(
    `/groups/${encodeURIComponent(groupId)}/bans/${encodeURIComponent(userId)}`,
    payload ?? {},
  );
}

export async function unbanMember(
  groupId: string,
  userId: string,
): Promise<GroupBan> {
  return await client.delete(
    `/groups/${encodeURIComponent(groupId)}/bans/${encodeURIComponent(userId)}`,
  );
}

// ─── Invite links ─────────────────────────────────────────────────────────────

export async function listInviteLinks(
  groupId: string,
): Promise<GroupInviteLink[]> {
  return await client.get(
    `/groups/${encodeURIComponent(groupId)}/invite-links`,
  );
}

export async function createInviteLink(
  groupId: string,
  payload?: CreateInviteLinkInput,
): Promise<GroupInviteLink> {
  return await client.post(
    `/groups/${encodeURIComponent(groupId)}/invite-links`,
    payload ?? {},
  );
}

export async function revokeInviteLink(
  groupId: string,
  inviteId: string,
): Promise<GroupInviteLink> {
  return await client.delete(
    `/groups/${encodeURIComponent(groupId)}/invite-links/${encodeURIComponent(inviteId)}`,
  );
}

export async function joinGroupByInvite(
  code: string,
): Promise<GroupMembership> {
  return await client.post(
    `/groups/invite-links/${encodeURIComponent(code)}/join`,
  );
}
