import React, { useMemo, useState, useEffect } from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { useI18n } from "../../i18n/I18nContext";
import { reportsService, AuditEventItem, Report } from "../../services/reports.service";
import {
  conversationsService,
  ConversationAuditEventItem,
  ConversationSummary,
} from "../../services/conversations.service";
import { maintenanceService, MaintenanceAuditEvent } from "../../services/maintenance.service";

type ScopeFilter = "ALL" | "REPORT" | "CONVERSATION" | "MAINTENANCE";

type CombinedAuditEvent = {
  id: string;
  scope: "REPORT" | "CONVERSATION" | "MAINTENANCE";
  action: string;
  actorUserId: string;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
  resource: string;
};

const MAX_REPORT_SOURCES = 8;
const MAX_CONVERSATION_SOURCES = 8;
const MAX_AUDIT_PAGES = 2;
const AUDIT_PAGE_SIZE = 25;

function normalizeReportAudit(report: Report, item: AuditEventItem): CombinedAuditEvent {
  return {
    ...item,
    resource: `${report.title} (${report.id})`,
  };
}

function normalizeConversationAudit(
  conversation: ConversationSummary,
  item: ConversationAuditEventItem
): CombinedAuditEvent {
  return {
    ...item,
    resource: `${conversation.groupName || conversation.conversationId}`,
  };
}

function normalizeMaintenanceAudit(event: MaintenanceAuditEvent): CombinedAuditEvent {
  const actionMap: Record<string, string> = {
    RETENTION_PREVIEW: "Preview Retention",
    RETENTION_PURGE: "Purge Retention",
    CHAT_PREVIEW: "Scan Chat Issues",
    CHAT_REPAIR: "Repair Chat",
  };

  const summary = `${actionMap[event.type] || event.type}: ${event.status}${event.details.error ? " - " + event.details.error : ""}`;
  const resource = event.details.candidates ? `${event.details.candidates} candidates` : "System Maintenance";

  return {
    id: event.id,
    scope: "MAINTENANCE",
    action: event.type,
    actorUserId: event.actorUserId || "System",
    occurredAt: event.timestamp,
    summary,
    resource,
    metadata: event.details,
  };
}

const AuditLogs: React.FC = () => {
  const { t } = useI18n();
  const [logs, setLogs] = useState<CombinedAuditEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAuditLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const [reportsResponse, conversationsResponse] = await Promise.all([
        reportsService.getReports(1, MAX_REPORT_SOURCES),
        conversationsService.getAllConversations({
          pageSize: MAX_CONVERSATION_SOURCES,
          maxPages: 1,
        }),
      ]);

      if (!reportsResponse.success && !conversationsResponse.success) {
        setError(t("auditLogs.error"));
        setLogs([]);
        return;
      }

      const reports = reportsResponse.data?.items ?? [];
      const conversations = conversationsResponse.data ?? [];

      const reportAuditPromises = reports.map(async (report) => {
        const response = await reportsService.getReportAuditEvents(report.id, {
          maxPages: MAX_AUDIT_PAGES,
          pageSize: AUDIT_PAGE_SIZE,
        });
        if (!response.success || !response.data) return [] as CombinedAuditEvent[];
        return response.data.map((event) => normalizeReportAudit(report, event));
      });

      const conversationAuditPromises = conversations.map(async (conversation) => {
        const response = await conversationsService.getConversationAuditEvents(
          conversation.conversationId,
          {
            maxPages: MAX_AUDIT_PAGES,
            pageSize: AUDIT_PAGE_SIZE,
          }
        );
        if (!response.success || !response.data) return [] as CombinedAuditEvent[];
        return response.data.map((event) => normalizeConversationAudit(conversation, event));
      });

      const [reportAuditGroups, conversationAuditGroups] = await Promise.all([
        Promise.all(reportAuditPromises),
        Promise.all(conversationAuditPromises),
      ]);

      // Fetch maintenance audit events
      const maintenanceEvents = maintenanceService.getAuditEvents();
      const maintenanceAuditGroups = maintenanceEvents.map(normalizeMaintenanceAudit);

      const merged = [
        ...reportAuditGroups.flat(),
        ...conversationAuditGroups.flat(),
        ...maintenanceAuditGroups,
      ].sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );

      setLogs(merged);
    } catch {
      setError(t("auditLogs.error"));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const filteredLogs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return logs.filter((log) => {
      if (scopeFilter !== "ALL" && log.scope !== scopeFilter) return false;

      if (!normalizedSearch) return true;

      return (
        log.actorUserId.toLowerCase().includes(normalizedSearch) ||
        log.action.toLowerCase().includes(normalizedSearch) ||
        log.resource.toLowerCase().includes(normalizedSearch) ||
        (log.summary || "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [logs, scopeFilter, searchTerm]);

  return (
    <>
      <PageMeta title={t("auditLogs.title")} description={t("auditLogs.description")} />
      <PageBreadCrumb pageTitle={t("auditLogs.title")} />

      <ComponentCard title={t("auditLogs.adminActivityHistory")}>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4 mb-6">
          <input
            type="text"
            placeholder={t("auditLogs.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          >
            <option value="ALL">All Scopes</option>
            <option value="REPORT">Report</option>
            <option value="CONVERSATION">Conversation</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
          <button
            type="button"
            onClick={loadAuditLogs}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {t("common.refresh")}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">{t("auditLogs.loading")}</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">{t("auditLogs.noLogs")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-4 text-left font-semibold text-gray-700">{t("auditLogs.timestamp")}</th>
                  <th className="p-4 text-left font-semibold text-gray-700">{t("auditLogs.admin")}</th>
                  <th className="p-4 text-left font-semibold text-gray-700">{t("auditLogs.action")}</th>
                  <th className="p-4 text-left font-semibold text-gray-700">{t("auditLogs.resource")}</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Scope</th>
                  <th className="p-4 text-left font-semibold text-gray-700">Summary</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={`${log.scope}-${log.id}`} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-600">{new Date(log.occurredAt).toLocaleString()}</td>
                    <td className="p-4 font-medium">{log.actorUserId}</td>
                    <td className="p-4">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">{log.resource}</td>
                    <td className="p-4">
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {log.scope}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ComponentCard>
    </>
  );
};

export default AuditLogs;
