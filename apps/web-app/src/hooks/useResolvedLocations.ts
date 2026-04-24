import {
  resolveLocationCode,
  type ResolvedLocation,
} from "@/services/location.api";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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

  return useQuery({
    queryKey: ["locations", "resolved", uniqueLocationCodes],
    enabled: uniqueLocationCodes.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ResolvedLocationMap> => {
      const entries = await Promise.all(
        uniqueLocationCodes.map(async (locationCode) => {
          try {
            const resolved = await resolveLocationCode(locationCode);
            return [locationCode, resolved] as const;
          } catch {
            return [
              locationCode,
              {
                locationCode,
                scope: "LEGACY" as const,
                isLegacy: true,
                displayName: locationCode,
              },
            ] as const;
          }
        }),
      );

      return Object.fromEntries(entries);
    },
  });
}

export function getResolvedLocationLabel(
  locationMap: ResolvedLocationMap | undefined,
  locationCode?: string | null,
  fallback = "Chưa xác định",
): string {
  const normalized = normalizeLocationCode(locationCode);
  if (!normalized) {
    return fallback;
  }

  return locationMap?.[normalized]?.displayName || fallback;
}
