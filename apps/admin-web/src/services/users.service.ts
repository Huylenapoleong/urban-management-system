import { apiClient, ApiResponse, ListResponse } from "./api-client";

export interface User {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: string;
  status: string;
  locationCode?: string;
  unit?: string;
  avatarUrl?: string;
  createdAt: string;
  deletedAt?: string | null;
}

export interface CreateUserRequest {
  fullName: string;
  email?: string;
  phone?: string;
  password: string;
  role: "CITIZEN" | "WARD_OFFICER" | "PROVINCE_OFFICER" | "ADMIN";
  locationCode: string;
  unit?: string;
  avatarUrl?: string;
}

export interface UpdateUserRequest {
  status?: "ACTIVE" | "INACTIVE" | "DEACTIVATED";
}

class UsersService {
  async listUsersRaw(params?: {
    limit?: number;
    cursor?: string;
    search?: string;
    locationCode?: string;
  }): Promise<ApiResponse<User[]>> {
    return apiClient.get<User[]>("/users", {
      params: {
        limit: params?.limit ?? 100,
        cursor: params?.cursor,
        q: params?.search || undefined,
        locationCode: params?.locationCode || undefined,
      },
    });
  }

  async getAllUsers(options?: {
    search?: string;
    locationCode?: string;
    maxPages?: number;
    pageSize?: number;
  }): Promise<ApiResponse<User[]>> {
    const all: User[] = [];
    let cursor: string | undefined;
    const maxPages = options?.maxPages ?? 20;
    const pageSize = options?.pageSize ?? 100;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.listUsersRaw({
        limit: pageSize,
        cursor,
        search: options?.search,
        locationCode: options?.locationCode,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error || "Failed to fetch users",
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

  async getUsers(
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<ApiResponse<ListResponse<User>>> {
    const response = await this.getAllUsers({
      search,
      pageSize: 100,
      maxPages: 20,
    });

    if (response.success && Array.isArray(response.data)) {
      const users = response.data;
      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      const paginatedUsers = users.slice(startIdx, endIdx);

      return {
        success: true,
        data: {
          items: paginatedUsers,
          total: users.length,
          page,
          limit,
          totalPages: Math.ceil(users.length / limit),
        },
      };
    }

    return {
      success: false,
      error: response.error || "Failed to fetch users",
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      },
    };
  }

  async getUserById(id: string): Promise<ApiResponse<User>> {
    return apiClient.get<User>(`/users/${id}`);
  }

  async createUser(data: CreateUserRequest): Promise<ApiResponse<User>> {
    return apiClient.post<User>("/users", data);
  }

  async updateUser(id: string, data: UpdateUserRequest): Promise<ApiResponse<User>> {
    return apiClient.patch<User>(`/users/${id}/status`, data);
  }

  async deleteUser(id: string): Promise<ApiResponse<void>> {
    const response = await apiClient.patch<void>(`/users/${id}/status`, { status: "DELETED" });
    return response;
  }

  async changeUserStatus(
    id: string,
    status: "ACTIVE" | "INACTIVE" | "DEACTIVATED"
  ): Promise<ApiResponse<User>> {
    return apiClient.patch<User>(`/users/${id}/status`, { status });
  }
}

export const usersService = new UsersService();