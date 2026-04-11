import { apiClient, ApiResponse } from "./api-client";

export interface RetentionPreviewResult {
  generatedAt: string;
  totalCandidates: number;
  buckets: Array<Record<string, unknown>>;
}

export interface RetentionPurgeResult {
  generatedAt: string;
  purgedAt: string;
  totalCandidates: number;
  totalDeleted: number;
  buckets: Array<Record<string, unknown>>;
}

export interface ChatReconciliationPreviewResult {
  generatedAt: string;
  totalCandidates: number;
  buckets: Array<Record<string, unknown>>;
  issues: Array<Record<string, unknown>>;
}

export interface ChatReconciliationRepairResult {
  generatedAt: string;
  repairedAt: string;
  totalCandidates: number;
  totalRepaired: number;
  buckets: Array<Record<string, unknown>>;
  issues: Array<Record<string, unknown>>;
}

export interface MaintenanceAuditEvent {
  id: string;
  type: "RETENTION_PREVIEW" | "RETENTION_PURGE" | "CHAT_PREVIEW" | "CHAT_REPAIR";
  status: "SUCCESS" | "FAILURE";
  timestamp: string;
  actorUserId?: string;
  details: {
    candidates?: number;
    deleted?: number;
    repaired?: number;
    error?: string;
  };
}

const MAINTENANCE_AUDIT_KEY = "maintenance_audit_events";

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export class MaintenanceService {
  async previewRetention(): Promise<RetentionPreviewResult> {
    const response = await apiClient.get<ApiResponse<RetentionPreviewResult>>(
      "/maintenance/retention/preview"
    );
    if (!response.data) {
      throw new Error("Failed to preview retention: no data returned");
    }
    return response.data;
  }

  async purgeRetention(): Promise<RetentionPurgeResult> {
    const response = await apiClient.post<ApiResponse<RetentionPurgeResult>>(
      "/maintenance/retention/purge",
      {}
    );
    if (!response.data) {
      throw new Error("Failed to purge retention: no data returned");
    }
    return response.data;
  }

  async previewChatReconciliation(): Promise<ChatReconciliationPreviewResult> {
    const response = await apiClient.get<ApiResponse<ChatReconciliationPreviewResult>>(
      "/maintenance/chat-reconciliation/preview"
    );
    if (!response.data) {
      throw new Error("Failed to preview chat reconciliation: no data returned");
    }
    return response.data;
  }

  async repairChatReconciliation(): Promise<ChatReconciliationRepairResult> {
    const response = await apiClient.post<ApiResponse<ChatReconciliationRepairResult>>(
      "/maintenance/chat-reconciliation/repair",
      {}
    );
    if (!response.data) {
      throw new Error("Failed to repair chat reconciliation: no data returned");
    }
    return response.data;
  }

  // ── Audit Event Storage ──────────────────────────────────────────────────────
  recordAuditEvent(event: Omit<MaintenanceAuditEvent, "id">): MaintenanceAuditEvent {
    const fullEvent: MaintenanceAuditEvent = {
      ...event,
      id: generateId(),
    };

    try {
      const existing = this.getAuditEvents();
      const updated = [fullEvent, ...existing].slice(0, 100); // Keep last 100 events
      localStorage.setItem(MAINTENANCE_AUDIT_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to store maintenance audit event:", err);
    }

    return fullEvent;
  }

  getAuditEvents(): MaintenanceAuditEvent[] {
    try {
      const stored = localStorage.getItem(MAINTENANCE_AUDIT_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (err) {
      console.error("Failed to retrieve maintenance audit events:", err);
      return [];
    }
  }

  clearAuditEvents(): void {
    try {
      localStorage.removeItem(MAINTENANCE_AUDIT_KEY);
    } catch (err) {
      console.error("Failed to clear maintenance audit events:", err);
    }
  }
}

export const maintenanceService = new MaintenanceService();
