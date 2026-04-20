import ApiClient from "@/lib/api-client";

export type ReportPayload = {
  title: string;
  description: string;
  category: string;
  priority: string;
  locationCode: string;
  mediaUrls?: string[];
};

export async function submitReport(payload: ReportPayload): Promise<any> {
  return await ApiClient.post("/reports", payload);
}

export async function getReports(): Promise<any[]> {
  return await ApiClient.get("/reports");
}

export async function getAllReports(): Promise<any[]> {
  return await ApiClient.get("/reports/all");
}

export async function updateReportStatus(reportId: string, status: string): Promise<any> {
  return await ApiClient.patch(`/reports/${reportId}/status`, { status });
}

export async function assignReport(reportId: string, officerId: string): Promise<any> {
  return await ApiClient.post(`/reports/${reportId}/assign`, { officerId });
}