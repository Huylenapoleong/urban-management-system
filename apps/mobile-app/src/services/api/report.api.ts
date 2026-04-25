import client from "./client";
import type { ReportItem } from "@urban/shared-types";

export async function listReports(params?: {
  mine?: boolean;
  assignedToMe?: boolean;
  status?: string;
  category?: string;
  priority?: string;
  locationCode?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}): Promise<ReportItem[]> {
  return await client.get("/reports", { params });
}

export async function createReport(data: {
  title: string;
  description?: string;
  category: string;
  priority: string;
  locationCode: string;
  mediaUrls?: string[];
}): Promise<ReportItem> {
  return await client.post("/reports", data);
}

export async function getReport(reportId: string): Promise<ReportItem> {
  return await client.get(`/reports/${encodeURIComponent(reportId)}`);
}

export async function updateReport(reportId: string, data: Partial<ReportItem>): Promise<ReportItem> {
  return await client.patch(`/reports/${encodeURIComponent(reportId)}`, data);
}

export async function deleteReport(reportId: string): Promise<void> {
  await client.delete(`/reports/${encodeURIComponent(reportId)}`);
}

export async function assignReport(reportId: string, officerId: string): Promise<ReportItem> {
  return await client.post(`/reports/${encodeURIComponent(reportId)}/assign`, { officerId });
}

export async function updateReportStatus(reportId: string, status: string): Promise<ReportItem> {
  return await client.post(`/reports/${encodeURIComponent(reportId)}/status`, { status });
}

export async function listReportAuditEvents(reportId: string): Promise<any[]> {
  return await client.get(`/reports/${encodeURIComponent(reportId)}/audit`);
}

export async function listLinkedConversations(reportId: string): Promise<any[]> {
  return await client.get(`/reports/${encodeURIComponent(reportId)}/conversations`);
}

export async function linkGroupConversation(reportId: string, groupId: string): Promise<void> {
  await client.post(`/reports/${encodeURIComponent(reportId)}/conversations`, { groupId });
}

