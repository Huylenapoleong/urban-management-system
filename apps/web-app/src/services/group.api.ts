import ApiClient from "@/lib/api-client";
import type {
  GroupMemberRole,
  GroupMessagePolicy,
  GroupType,
} from "@urban/shared-constants";
import type { GroupBan, GroupInviteLink, GroupMembership, GroupMetadata } from "@urban/shared-types";

type ManageMemberAction = "add" | "update" | "remove";

export interface GroupListParams {
  mine?: boolean;
  q?: string;
  groupType?: GroupType;
  locationCode?: string;
  cursor?: string;
  limit?: number;
}

export interface CreateGroupInput {
  groupName: string;
  groupType: GroupType;
  locationCode: string;
  description?: string;
  isOfficial?: boolean;
  messagePolicy?: GroupMessagePolicy;
}

export interface UpdateGroupInput {
  groupName?: string;
  groupType?: GroupType;
  locationCode?: string;
  description?: string;
  isOfficial?: boolean;
  messagePolicy?: GroupMessagePolicy;
}

export interface ManageGroupMemberInput {
  action: ManageMemberAction;
  roleInGroup?: GroupMemberRole;
}

export interface LeaveGroupInput {
  successorUserId?: string;
}

export interface AddGroupMemberInput {
  userId: string;
  roleInGroup?: Extract<GroupMemberRole, "DEPUTY" | "MEMBER">;
}

export interface UpdateGroupMemberRoleInput {
  roleInGroup: Extract<GroupMemberRole, "DEPUTY" | "MEMBER">;
}

export interface CreateInviteLinkInput {
  expiresAt?: string;
  maxUses?: number;
}

export interface BanGroupMemberInput {
  reason?: string;
  expiresAt?: string;
}

export async function getGroups(params?: GroupListParams): Promise<GroupMetadata[]> {
  const qParams = new URLSearchParams();
  if (params?.mine !== undefined) qParams.append('mine', String(params.mine));
  if (params?.q) qParams.append('q', params.q);
  if (params?.groupType) qParams.append('groupType', params.groupType);
  if (params?.locationCode) qParams.append('locationCode', params.locationCode);
  if (params?.cursor) qParams.append('cursor', params.cursor);
  if (typeof params?.limit === 'number') qParams.append('limit', String(params.limit));
  
  return await ApiClient.get(`/groups?${qParams.toString()}`);
}

export async function createGroup(payload: CreateGroupInput): Promise<GroupMetadata> {
  return await ApiClient.post("/groups", payload);
}

export async function updateGroup(groupId: string, payload: UpdateGroupInput): Promise<GroupMetadata> {
  return await ApiClient.patch(`/groups/${encodeURIComponent(groupId)}`, payload);
}

export async function joinGroup(groupId: string): Promise<GroupMembership> {
  return await ApiClient.post(`/groups/${encodeURIComponent(groupId)}/join`);
}

export async function leaveGroup(groupId: string): Promise<GroupMembership> {
  return await leaveGroupWithPayload(groupId);
}

export async function leaveGroupWithPayload(groupId: string, payload?: LeaveGroupInput): Promise<GroupMembership> {
  return await ApiClient.post(`/groups/${encodeURIComponent(groupId)}/leave`, payload ?? {});
}

export async function listGroupMembers(groupId: string): Promise<GroupMembership[]> {
  return await ApiClient.get(`/groups/${encodeURIComponent(groupId)}/members`);
}

export async function manageGroupMember(
  groupId: string,
  userId: string,
  payload: ManageGroupMemberInput,
): Promise<GroupMembership> {
  if (payload.action === "add") {
    return addGroupMember(groupId, {
      userId,
      roleInGroup: payload.roleInGroup === "DEPUTY" ? "DEPUTY" : "MEMBER",
    });
  }

  if (payload.action === "update") {
    const nextRole = payload.roleInGroup === "DEPUTY" ? "DEPUTY" : "MEMBER";
    return updateGroupMemberRole(groupId, userId, { roleInGroup: nextRole });
  }

  if (payload.action === "remove") {
    return removeGroupMember(groupId, userId);
  }

  return await ApiClient.patch(
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    payload,
  );
}

export async function addGroupMember(
  groupId: string,
  payload: AddGroupMemberInput,
): Promise<GroupMembership> {
  return await ApiClient.post(`/groups/${encodeURIComponent(groupId)}/members`, payload);
}

export async function updateGroupMemberRole(
  groupId: string,
  userId: string,
  payload: UpdateGroupMemberRoleInput,
): Promise<GroupMembership> {
  return await ApiClient.patch(
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/role`,
    payload,
  );
}

export async function removeGroupMember(
  groupId: string,
  userId: string,
): Promise<GroupMembership> {
  return await ApiClient.delete(
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
  );
}

export async function listGroupBans(groupId: string): Promise<GroupBan[]> {
  return await ApiClient.get(`/groups/${encodeURIComponent(groupId)}/bans`);
}

export async function banGroupMember(
  groupId: string,
  userId: string,
  payload?: BanGroupMemberInput,
): Promise<GroupBan> {
  return await ApiClient.post(
    `/groups/${encodeURIComponent(groupId)}/bans/${encodeURIComponent(userId)}`,
    payload ?? {},
  );
}

export async function unbanGroupMember(groupId: string, userId: string): Promise<GroupBan> {
  return await ApiClient.delete(
    `/groups/${encodeURIComponent(groupId)}/bans/${encodeURIComponent(userId)}`,
  );
}

export async function listGroupInviteLinks(groupId: string): Promise<GroupInviteLink[]> {
  return await ApiClient.get(`/groups/${encodeURIComponent(groupId)}/invite-links`);
}

export async function createGroupInviteLink(
  groupId: string,
  payload?: CreateInviteLinkInput,
): Promise<GroupInviteLink> {
  return await ApiClient.post(`/groups/${encodeURIComponent(groupId)}/invite-links`, payload ?? {});
}

export async function revokeGroupInviteLink(groupId: string, inviteId: string): Promise<GroupInviteLink> {
  return await ApiClient.delete(
    `/groups/${encodeURIComponent(groupId)}/invite-links/${encodeURIComponent(inviteId)}`,
  );
}

export async function joinGroupByInvite(code: string): Promise<GroupMembership> {
  return await ApiClient.post(`/groups/invite-links/${encodeURIComponent(code)}/join`);
}