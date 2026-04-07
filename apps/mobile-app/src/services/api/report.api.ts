import client from "./client";
import type { ReportItem } from "@urban/shared-types";

export async function listReports(): Promise<ReportItem[]> {
  return await client.get("/reports", { params: { mine: true } });
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

