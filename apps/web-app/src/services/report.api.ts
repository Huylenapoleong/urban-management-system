import ApiClient from "@/lib/api-client";
import type { ReportItem } from "@urban/shared-types";

export type ReportPayload = {
  title: string;
  description: string;
  category: string;
  priority: string;
  locationCode: string;
  mediaUrls?: string[];
};

export type WebReportItem = Omit<ReportItem, "status"> & {
  status: string;
};

export async function submitReport(payload: ReportPayload): Promise<WebReportItem> {
  return await ApiClient.post("/reports", payload);
}

export async function getReports(): Promise<WebReportItem[]> {
  return await ApiClient.get("/reports");
}

export async function getAllReports(): Promise<WebReportItem[]> {
  return await ApiClient.get("/reports/all");
}

export async function updateReportStatus(reportId: string, status: string): Promise<WebReportItem> {
  return await ApiClient.patch(`/reports/${reportId}/status`, { status });
}

export async function assignReport(reportId: string, officerId: string): Promise<WebReportItem> {
  return await ApiClient.post(`/reports/${reportId}/assign`, { officerId });
}
