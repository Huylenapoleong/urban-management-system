import { useEffect, useMemo, useState } from 'react';
import {
  locationsService,
  type ResolvedLocation,
} from '../services/locations.service';

export type ResolvedLocationMap = Record<string, ResolvedLocation>;

function normalizeLocationCode(
  locationCode?: string | null,
): string | undefined {
  const normalized = locationCode?.trim().toUpperCase();
  return normalized ? normalized : undefined;
}

export function useResolvedLocations(
  locationCodes: Array<string | null | undefined>,
) {
  const uniqueLocationCodes = useMemo(
    () =>
      [
        ...new Set(
          locationCodes
            .map(normalizeLocationCode)
            .filter((locationCode): locationCode is string =>
              Boolean(locationCode),
            ),
        ),
      ].sort(),
    [locationCodes],
  );
  const [locationMap, setLocationMap] = useState<ResolvedLocationMap>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (uniqueLocationCodes.length === 0) {
      setLocationMap({});
      setIsLoading(false);
      return;
    }

    let active = true;

    async function loadResolvedLocations() {
      setIsLoading(true);

      const entries = await Promise.all(
        uniqueLocationCodes.map(async (locationCode) => {
          const response =
            await locationsService.resolveLocationCode(locationCode);

          if (response.success && response.data) {
            return [locationCode, response.data] as const;
          }

          return [
            locationCode,
            {
              locationCode,
              scope: 'LEGACY' as const,
              isLegacy: true,
              displayName: locationCode,
            },
          ] as const;
        }),
      );

      if (!active) {
        return;
      }

      setLocationMap(Object.fromEntries(entries));
      setIsLoading(false);
    }

    void loadResolvedLocations();

    return () => {
      active = false;
    };
  }, [uniqueLocationCodes]);

  return { locationMap, isLoading };
}

export function getResolvedLocationLabel(
  locationMap: ResolvedLocationMap | undefined,
  locationCode?: string | null,
  fallback = '—',
): string {
  const normalized = normalizeLocationCode(locationCode);
  if (!normalized) {
    return fallback;
  }

  return locationMap?.[normalized]?.displayName || fallback;
}
