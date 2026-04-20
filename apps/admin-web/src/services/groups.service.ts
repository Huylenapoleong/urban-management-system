import type { GroupType } from "@urban/shared-constants";
import { apiClient, ApiResponse } from "./api-client";

export const GROUP_TYPES: readonly GroupType[] = ["AREA", "TOPIC", "OFFICIAL", "PRIVATE"];

export interface GroupMetadata {
  id: string;
  groupName: string;
  groupType: GroupType;
  locationCode: string;
  createdBy: string;
  description?: string;
  memberCount: number;
  isOfficial: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupRequest {
  groupName: string;
  groupType: GroupType;
  locationCode: string;
  description?: string;
  isOfficial?: boolean;
}

export interface UpdateGroupRequest {
  groupName?: string;
  groupType?: GroupType;
  locationCode?: string;
  description?: string;
  isOfficial?: boolean;
}

class GroupsService {
  async listGroupsRaw(params?: {
    mine?: boolean;
    groupType?: GroupType;
    locationCode?: string;
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ApiResponse<GroupMetadata[]>> {
    return apiClient.get<GroupMetadata[]>('/groups', {
      params: {
        mine: params?.mine,
        groupType: params?.groupType,
        locationCode: params?.locationCode,
        q: params?.q,
        cursor: params?.cursor,
        limit: params?.limit ?? 100,
      },
    });
  }

  async getAllGroups(options?: {
    mine?: boolean;
    groupType?: GroupType;
    locationCode?: string;
    q?: string;
    maxPages?: number;
    pageSize?: number;
  }): Promise<ApiResponse<GroupMetadata[]>> {
    const all: GroupMetadata[] = [];
    let cursor: string | undefined;
    const maxPages = options?.maxPages ?? 20;
    const pageSize = options?.pageSize ?? 100;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.listGroupsRaw({
        mine: options?.mine,
        groupType: options?.groupType,
        locationCode: options?.locationCode,
        q: options?.q,
        cursor,
        limit: pageSize,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to fetch groups',
          data: all,
        };
      }

      const chunk = response.data || [];
      all.push(...chunk);

      const nextCursor = response.meta?.nextCursor;
      if (!nextCursor || chunk.length === 0) {
        break;
      }
      cursor = nextCursor;
    }

    return {
      success: true,
      data: all,
    };
  }

  async createGroup(data: CreateGroupRequest): Promise<ApiResponse<GroupMetadata>> {
    return apiClient.post<GroupMetadata>('/groups', data);
  }

  async updateGroup(id: string, data: UpdateGroupRequest): Promise<ApiResponse<GroupMetadata>> {
    return apiClient.patch<GroupMetadata>(`/groups/${encodeURIComponent(id)}`, data);
  }

  async deleteGroup(id: string): Promise<ApiResponse<GroupMetadata>> {
    return apiClient.delete<GroupMetadata>(`/groups/${encodeURIComponent(id)}`);
  }
}

export const groupsService = new GroupsService();
