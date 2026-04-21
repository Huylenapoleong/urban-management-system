import ApiClient from "@/lib/api-client";
import type {
  GroupMemberRole,
  GroupType,
} from "@urban/shared-constants";
import type { GroupMembership, GroupMetadata } from "@urban/shared-types";

type ManageMemberAction = "add" | "update" | "remove";

export interface GroupListParams {
  mine?: boolean;
  q?: string;
}

export interface CreateGroupInput {
  groupName: string;
  groupType: GroupType;
  locationCode: string;
  description?: string;
  isOfficial?: boolean;
}

export interface ManageGroupMemberInput {
  action: ManageMemberAction;
  roleInGroup?: GroupMemberRole;
}

export async function getGroups(params?: GroupListParams): Promise<GroupMetadata[]> {
  const qParams = new URLSearchParams();
  if (params?.mine !== undefined) qParams.append('mine', String(params.mine));
  if (params?.q) qParams.append('q', params.q);
  
  return await ApiClient.get(`/groups?${qParams.toString()}`);
}

export async function createGroup(payload: CreateGroupInput): Promise<GroupMetadata> {
  return await ApiClient.post("/groups", payload);
}

export async function joinGroup(groupId: string): Promise<GroupMembership> {
  return await ApiClient.post(`/groups/${encodeURIComponent(groupId)}/join`);
}

export async function leaveGroup(groupId: string): Promise<GroupMembership> {
  return await ApiClient.post(`/groups/${encodeURIComponent(groupId)}/leave`);
}

export async function listGroupMembers(groupId: string): Promise<GroupMembership[]> {
  return await ApiClient.get(`/groups/${encodeURIComponent(groupId)}/members`);
}

export async function manageGroupMember(
  groupId: string,
  userId: string,
  payload: ManageGroupMemberInput,
): Promise<GroupMembership> {
  return await ApiClient.patch(
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    payload,
  );
}