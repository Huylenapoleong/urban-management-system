import { apiClient, ApiResponse, ListResponse } from "./api-client";

// ── enums matching backend REPORT_STATUSES / REPORT_PRIORITIES / REPORT_CATEGORIES ──
export type ReportStatus   = "NEW" | "IN_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "REJECTED";
export type ReportPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ReportCategory = "INFRASTRUCTURE" | "TRAFFIC" | "ENVIRONMENT" | "SECURITY" | "PUBLIC_ORDER" | "PUBLIC_SERVICES";

export interface Report {
  id: string;
  userId: string;
  groupId?: string;
  title: string;
  description?: string;
  category: ReportCategory;
  locationCode: string;
  status: ReportStatus;
  priority: ReportPriority;
  mediaUrls: string[];
  assignedOfficerId?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportRequest {
  title: string;
  description?: string;
  category: ReportCategory;
  locationCode: string;
  priority: ReportPriority;
  mediaUrls?: string[];
  groupId?: string;
}

export interface UpdateReportRequest {
  title?: string;
  description?: string;
  category?: ReportCategory;
  locationCode?: string;
  priority?: ReportPriority;
  mediaUrls?: string[];
}

export interface ListReportsQuery {
  status?:             ReportStatus;
  category?:           ReportCategory;
  priority?:           ReportPriority;
  locationCode?:       string;
  assignedOfficerId?:  string;
  mine?:               boolean;
  assignedToMe?:       boolean;
  q?:                  string;
  createdFrom?:        string;
  createdTo?:          string;
  cursor?:             string;
  limit?:              number;
}

class ReportsService {
  async getReports(
    page: number = 1,
    limit: number = 20,
    query: ListReportsQuery = {}
  ): Promise<ApiResponse<ListResponse<Report>>> {
    const params: Record<string, any> = { limit, ...query };
    // Remove undefined values
    Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);

    const response = await apiClient.get<any>("/reports", { params });

    if (response.success) {
      // Backend returns { data: Report[], meta: { count, nextCursor } }
      const raw = response.data;
      const items: Report[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      return {
        success: true,
        data: {
          items,
          total: items.length,
          page,
          limit,
          totalPages: Math.ceil(items.length / limit),
        },
      };
    }
    return {
      success: false,
      error: response.error || "Failed to fetch reports",
      data: { items: [], total: 0, page: 1, limit, totalPages: 0 },
    };
  }

  async getReportById(id: string): Promise<ApiResponse<Report>> {
    return apiClient.get<Report>(`/reports/${id}`);
  }

  async createReport(data: CreateReportRequest): Promise<ApiResponse<Report>> {
    return apiClient.post<Report>("/reports", data);
  }

  async updateReport(id: string, data: UpdateReportRequest): Promise<ApiResponse<Report>> {
    return apiClient.patch<Report>(`/reports/${id}`, data);
  }

  async updateStatus(id: string, status: ReportStatus): Promise<ApiResponse<Report>> {
    return apiClient.post<Report>(`/reports/${id}/status`, { status });
  }

  async assignReport(id: string, officerId: string): Promise<ApiResponse<Report>> {
    return apiClient.post<Report>(`/reports/${id}/assign`, { officerId });
  }

  async deleteReport(id: string): Promise<ApiResponse<Report>> {
    return apiClient.delete<Report>(`/reports/${id}`);
  }
}

export const reportsService = new ReportsService();