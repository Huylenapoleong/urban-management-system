import client, { request } from "@/lib/api-client";

export type LocationProvince = {
  code: string;
  name: string;
  fullName: string;
  unitType: "MUNICIPALITY" | "PROVINCE";
};

export type LocationWard = {
  code: string;
  name: string;
  fullName: string;
  provinceCode: string;
  unitType: "WARD" | "COMMUNE" | "SPECIAL_ZONE";
};

export type ResolvedLocation = {
  locationCode: string;
  scope: "PROVINCE" | "WARD" | "LEGACY";
  isLegacy: boolean;
  displayName: string;
  province?: LocationProvince;
  ward?: LocationWard;
};

export async function listLocationProvinces() {
  return request<LocationProvince[]>(client.get("/locations/provinces"));
}

export async function listLocationWards(provinceCode: string) {
  return request<LocationWard[]>(
    client.get("/locations/wards", { params: { provinceCode } }),
  );
}

export async function resolveLocationCode(locationCode: string) {
  return request<ResolvedLocation>(
    client.get("/locations/resolve", { params: { locationCode } }),
  );
}
