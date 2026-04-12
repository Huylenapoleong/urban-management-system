import { apiClient, ApiResponse, ListResponse } from "./api-client";

export interface Region {
  id: string;
  name: string;
  code?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRegionRequest {
  name: string;
  code?: string;
  description?: string;
}

export interface UpdateRegionRequest {
  name?: string;
  code?: string;
  description?: string;
}

class RegionsService {
  async getRegions(
    page: number = 1,
    limit: number = 10
  ): Promise<ApiResponse<ListResponse<Region>>> {
    // Note: /regions endpoint doesn't exist in the backend
    // Returning mock data for UI development
    const mockRegions: Region[] = [
      {
        id: "region-1",
        name: "District 1",
        description: "Central district",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "region-2",
        name: "District 2",
        description: "East district",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "region-3",
        name: "District 3",
        description: "South district",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const startIdx = (page - 1) * limit;
    const endIdx = startIdx + limit;
    return {
      success: true,
      data: {
        items: mockRegions.slice(startIdx, endIdx),
        total: mockRegions.length,
        page,
        limit,
        totalPages: Math.ceil(mockRegions.length / limit),
      },
    };
  }

  async getRegionById(id: string): Promise<ApiResponse<Region>> {
    return apiClient.get<Region>(`/regions/${id}`);
  }

  async createRegion(data: CreateRegionRequest): Promise<ApiResponse<Region>> {
    return apiClient.post<Region>("/regions", data);
  }

  async updateRegion(id: string, data: UpdateRegionRequest): Promise<ApiResponse<Region>> {
    return apiClient.patch<Region>(`/regions/${id}`, data);
  }

  async deleteRegion(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete<void>(`/regions/${id}`);
  }
}

export const regionsService = new RegionsService();
