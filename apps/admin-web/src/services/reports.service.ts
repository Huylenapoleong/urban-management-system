import { apiClient, ApiResponse, ListResponse } from "./api-client";

// ── enums matching backend REPORT_STATUSES / REPORT_PRIORITIES / REPORT_CATEGORIES ──
export type ReportStatus   = "NEW" | "IN_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "REJECTED";
export type ReportPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ReportCategory = "INFRASTRUCTURE" | "TRAFFIC" | "ENVIRONMENT" | "SECURITY" | "PUBLIC_ORDER" | "PUBLIC_SERVICES";

export interface MediaAsset {
  key: string;
  bucket?: string;
  target: string;
  entityId?: string;
  originalFileName?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  uploadedBy?: string;
  uploadedAt?: string;
  resolvedUrl?: string;
  expiresAt?: string;
}

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
  mediaAssets?: MediaAsset[];
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
  mediaKeys?: string[];
  mediaUrls?: string[];
  groupId?: string;
}

export interface UpdateReportRequest {
  title?: string;
  description?: string;
  category?: ReportCategory;
  locationCode?: string;
  priority?: ReportPriority;
  mediaKeys?: string[];
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

export interface AuditEventItem {
  id: string;
  scope: "REPORT" | "CONVERSATION";
  action: string;
  actorUserId: string;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface ReportConversationLink {
  reportId: string;
  groupId: string;
  conversationId: string;
  linkedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListAuditQuery {
  cursor?: string;
  limit?: number;
}

class ReportsService {
  async listReportsRaw(query: ListReportsQuery = {}): Promise<ApiResponse<Report[]>> {
    const params: Record<string, any> = { limit: query.limit ?? 100, ...query };
    Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);
    return apiClient.get<Report[]>("/reports", { params });
  }

  async getAllReports(query: ListReportsQuery = {}, options?: { maxPages?: number; pageSize?: number }): Promise<ApiResponse<Report[]>> {
    const all: Report[] = [];
    let cursor: string | undefined = query.cursor;
    const maxPages = options?.maxPages ?? 20;
    const pageSize = options?.pageSize ?? 100;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.listReportsRaw({
        ...query,
        cursor,
        limit: pageSize,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error || "Failed to fetch reports",
          data: all,
        };
      }

      const chunk = response.data || [];
      all.push(...chunk);

      const nextCursor = response.meta?.nextCursor;
      if (!nextCursor || chunk.length === 0) {
        break;
      }
      cursor = nextCursor;
    }

    return {
      success: true,
      data: all,
    };
  }

  async getReports(
    page: number = 1,
    limit: number = 20,
    query: ListReportsQuery = {}
  ): Promise<ApiResponse<ListResponse<Report>>> {
    const response = await this.getAllReports(query, {
      pageSize: 100,
      maxPages: 20,
    });

    if (response.success) {
      const raw = response.data;
      const items: Report[] = Array.isArray(raw) ? raw : [];

      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      const paginated = items.slice(startIdx, endIdx);

      return {
        success: true,
        data: {
          items: paginated,
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

  async listReportAuditEventsRaw(
    reportId: string,
    query: ListAuditQuery = {}
  ): Promise<ApiResponse<AuditEventItem[]>> {
    return apiClient.get<AuditEventItem[]>(`/reports/${encodeURIComponent(reportId)}/audit`, {
      params: {
        cursor: query.cursor,
        limit: query.limit ?? 50,
      },
    });
  }

  async getReportAuditEvents(
    reportId: string,
    options?: { maxPages?: number; pageSize?: number }
  ): Promise<ApiResponse<AuditEventItem[]>> {
    const all: AuditEventItem[] = [];
    let cursor: string | undefined;
    const maxPages = options?.maxPages ?? 5;
    const pageSize = options?.pageSize ?? 50;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.listReportAuditEventsRaw(reportId, {
        cursor,
        limit: pageSize,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error || "Failed to fetch report audit events",
          data: all,
        };
      }

      const chunk = response.data || [];
      all.push(...chunk);

      const nextCursor = response.meta?.nextCursor;
      if (!nextCursor || chunk.length === 0) {
        break;
      }
      cursor = nextCursor;
    }

    return {
      success: true,
      data: all,
    };
  }

  async listReportLinkedConversationsRaw(
    reportId: string,
    query: ListAuditQuery = {}
  ): Promise<ApiResponse<ReportConversationLink[]>> {
    return apiClient.get<ReportConversationLink[]>(`/reports/${encodeURIComponent(reportId)}/conversations`, {
      params: {
        cursor: query.cursor,
        limit: query.limit ?? 50,
      },
    });
  }

  async getReportLinkedConversations(
    reportId: string,
    options?: { maxPages?: number; pageSize?: number }
  ): Promise<ApiResponse<ReportConversationLink[]>> {
    const all: ReportConversationLink[] = [];
    let cursor: string | undefined;
    const maxPages = options?.maxPages ?? 5;
    const pageSize = options?.pageSize ?? 50;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.listReportLinkedConversationsRaw(reportId, {
        cursor,
        limit: pageSize,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error || "Failed to fetch linked conversations",
          data: all,
        };
      }

      const chunk = response.data || [];
      all.push(...chunk);

      const nextCursor = response.meta?.nextCursor;
      if (!nextCursor || chunk.length === 0) {
        break;
      }
      cursor = nextCursor;
    }

    return {
      success: true,
      data: all,
    };
  }
}

export const reportsService = new ReportsService();