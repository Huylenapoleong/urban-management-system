import ApiClient from "@/lib/api-client";

export async function getGroups(params?: { mine?: boolean; q?: string }): Promise<any[]> {
  const qParams = new URLSearchParams();
  if (params?.mine !== undefined) qParams.append('mine', String(params.mine));
  if (params?.q) qParams.append('q', params.q);
  
  return await ApiClient.get(`/groups?${qParams.toString()}`);
}

export async function createGroup(payload: { name: string; description?: string; locationCode: string }): Promise<any> {
  return await ApiClient.post("/groups", payload);
}

export async function joinGroup(groupId: string): Promise<void> {
  return await ApiClient.post(`/groups/${encodeURIComponent(groupId)}/join`);
}