export type LocationSelection = {
  provinceCode: string;
  wardCode: string;
  isLegacy: boolean;
  scope: 'PROVINCE' | 'WARD' | 'UNKNOWN';
};

const PROVINCE_LOCATION_CODE_PATTERN = /^VN-(\d{2})$/;
const WARD_LOCATION_CODE_PATTERN = /^VN-(\d{2})-(\d{5})$/;

export function buildProvinceLocationCode(provinceCode: string): string {
  return `VN-${provinceCode}`;
}

export function buildWardLocationCode(
  provinceCode: string,
  wardCode: string,
): string {
  return `VN-${provinceCode}-${wardCode}`;
}

export function inferLocationSelection(
  locationCode?: string,
): LocationSelection {
  const normalized = locationCode?.trim().toUpperCase() ?? '';

  const provinceMatch = normalized.match(PROVINCE_LOCATION_CODE_PATTERN);
  if (provinceMatch) {
    return {
      provinceCode: provinceMatch[1],
      wardCode: '',
      isLegacy: false,
      scope: 'PROVINCE',
    };
  }

  const wardMatch = normalized.match(WARD_LOCATION_CODE_PATTERN);
  if (wardMatch) {
    return {
      provinceCode: wardMatch[1],
      wardCode: wardMatch[2],
      isLegacy: false,
      scope: 'WARD',
    };
  }

  return {
    provinceCode: '',
    wardCode: '',
    isLegacy: normalized.length > 0,
    scope: 'UNKNOWN',
  };
}

export function isWardScopedRole(role: string): boolean {
  return role === 'CITIZEN' || role === 'WARD_OFFICER';
}
