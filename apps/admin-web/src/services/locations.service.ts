import { apiClient, ApiResponse } from './api-client';

export interface LocationProvince {
  code: string;
  name: string;
  fullName: string;
  unitType: 'MUNICIPALITY' | 'PROVINCE';
}

export interface LocationWard {
  code: string;
  name: string;
  fullName: string;
  provinceCode: string;
  unitType: 'WARD' | 'COMMUNE' | 'SPECIAL_ZONE';
}

export interface ResolvedLocation {
  locationCode: string;
  scope: 'PROVINCE' | 'WARD' | 'LEGACY';
  isLegacy: boolean;
  displayName: string;
  province?: LocationProvince;
  ward?: LocationWard;
}

class LocationsService {
  async listProvinces(): Promise<ApiResponse<LocationProvince[]>> {
    return apiClient.get<LocationProvince[]>('/locations/provinces');
  }

  async listWards(provinceCode: string): Promise<ApiResponse<LocationWard[]>> {
    return apiClient.get<LocationWard[]>('/locations/wards', {
      params: { provinceCode },
    });
  }

  async resolveLocationCode(
    locationCode: string,
  ): Promise<ApiResponse<ResolvedLocation>> {
    return apiClient.get<ResolvedLocation>('/locations/resolve', {
      params: { locationCode },
    });
  }
}

export const locationsService = new LocationsService();
