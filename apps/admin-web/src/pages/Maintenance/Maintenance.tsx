import React, { useState, useCallback, useMemo } from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  maintenanceService,
  RetentionPreviewResult,
  ChatReconciliationPreviewResult,
} from "../../services/maintenance.service";
import { useI18n } from "../../i18n/I18nContext";

type MaintenanceOperation = "RETENTION_PREVIEW" | "RETENTION_PURGE" | "CHAT_PREVIEW" | "CHAT_REPAIR" | null;

interface OperationResult {
  type: MaintenanceOperation;
  timestamp: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export const Maintenance: React.FC = () => {
  const { t } = useI18n();
  const [retentionPreview, setRetentionPreview] = useState<RetentionPreviewResult | null>(null);
  const [chatPreview, setChatPreview] = useState<ChatReconciliationPreviewResult | null>(null);
  const [executing, setExecuting] = useState<MaintenanceOperation>(null);
  const [operationHistory, setOperationHistory] = useState<OperationResult[]>([]);
  const [error, setError] = useState<string>("");
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);

  const addToHistory = useCallback((result: OperationResult) => {
    setOperationHistory((prev) => [result, ...prev.slice(0, 19)]);
  }, []);

  // ── Retention Preview ────────────────────────────────────────────────────────────
  const handleRetentionPreview = async () => {
    try {
      setExecuting("RETENTION_PREVIEW");
      setError("");
      const response = await maintenanceService.previewRetention();
      setRetentionPreview(response);
      maintenanceService.recordAuditEvent({
        type: "RETENTION_PREVIEW",
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        details: { candidates: response.totalCandidates },
      });
      addToHistory({
        type: "RETENTION_PREVIEW",
        timestamp: new Date().toISOString(),
        success: true,
        data: response,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("maintenance.errors.previewRetention");
      setError(message);
      maintenanceService.recordAuditEvent({
        type: "RETENTION_PREVIEW",
        status: "FAILURE",
        timestamp: new Date().toISOString(),
        details: { error: message },
      });
      addToHistory({
        type: "RETENTION_PREVIEW",
        timestamp: new Date().toISOString(),
        success: false,
        error: message,
      });
    } finally {
      setExecuting(null);
    }
  };

  // ── Retention Purge ─────────────────────────────────────────────────────────────
  const handleRetentionPurge = async () => {
    try {
      setExecuting("RETENTION_PURGE");
      setError("");
      const response = await maintenanceService.purgeRetention();
      setRetentionPreview(null);
      setConfirmPurge(false);
      maintenanceService.recordAuditEvent({
        type: "RETENTION_PURGE",
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        details: { candidates: response.totalCandidates, deleted: response.totalDeleted },
      });
      addToHistory({
        type: "RETENTION_PURGE",
        timestamp: new Date().toISOString(),
        success: true,
        data: response,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("maintenance.errors.purgeRetention");
      setError(message);
      maintenanceService.recordAuditEvent({
        type: "RETENTION_PURGE",
        status: "FAILURE",
        timestamp: new Date().toISOString(),
        details: { error: message },
      });
      addToHistory({
        type: "RETENTION_PURGE",
        timestamp: new Date().toISOString(),
        success: false,
        error: message,
      });
    } finally {
      setExecuting(null);
    }
  };

  // ── Chat Reconciliation Preview ──────────────────────────────────────────────────
  const handleChatPreview = async () => {
    try {
      setExecuting("CHAT_PREVIEW");
      setError("");
      const response = await maintenanceService.previewChatReconciliation();
      setChatPreview(response);
      maintenanceService.recordAuditEvent({
        type: "CHAT_PREVIEW",
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        details: { candidates: response.totalCandidates },
      });
      addToHistory({
        type: "CHAT_PREVIEW",
        timestamp: new Date().toISOString(),
        success: true,
        data: response,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("maintenance.errors.previewChat");
      setError(message);
      maintenanceService.recordAuditEvent({
        type: "CHAT_PREVIEW",
        status: "FAILURE",
        timestamp: new Date().toISOString(),
        details: { error: message },
      });
      addToHistory({
        type: "CHAT_PREVIEW",
        timestamp: new Date().toISOString(),
        success: false,
        error: message,
      });
    } finally {
      setExecuting(null);
    }
  };

  // ── Chat Reconciliation Repair ──────────────────────────────────────────────────
  const handleChatRepair = async () => {
    try {
      setExecuting("CHAT_REPAIR");
      setError("");
      const response = await maintenanceService.repairChatReconciliation();
      setChatPreview(null);
      setConfirmRepair(false);
      maintenanceService.recordAuditEvent({
        type: "CHAT_REPAIR",
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        details: { candidates: response.totalCandidates, repaired: response.totalRepaired },
      });
      addToHistory({
        type: "CHAT_REPAIR",
        timestamp: new Date().toISOString(),
        success: true,
        data: response,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("maintenance.errors.repairChat");
      setError(message);
      maintenanceService.recordAuditEvent({
        type: "CHAT_REPAIR",
        status: "FAILURE",
        timestamp: new Date().toISOString(),
        details: { error: message },
      });
      addToHistory({
        type: "CHAT_REPAIR",
        timestamp: new Date().toISOString(),
        success: false,
        error: message,
      });
    } finally {
      setExecuting(null);
    }
  };

  // ── Stats ────────────────────────────────────────────────────────────────────────
  const retentionStats = useMemo(() => ({
    candidates: retentionPreview?.totalCandidates ?? 0,
    generatedAt: retentionPreview?.generatedAt,
  }), [retentionPreview]);

  const chatStats = useMemo(() => ({
    candidates: chatPreview?.totalCandidates ?? 0,
    issues: chatPreview?.issues?.length ?? 0,
    generatedAt: chatPreview?.generatedAt,
  }), [chatPreview]);

  const tr = (key: string, params?: Record<string, string>) => {
    let text = t(key);
    if (!params) return text;
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    });
    return text;
  };

  const operationLabel = (operation: MaintenanceOperation) => {
    if (!operation) return "-";
    return t(`maintenance.operations.${operation}`);
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="mx-auto max-w-7xl p-6">
        <PageMeta title={t("maintenance.title")} description={t("maintenance.description")} />
        <PageBreadCrumb pageTitle={t("maintenance.title")} />

        <div className="space-y-6 mt-8">
          {/* Error Alert */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Retention Maintenance Section */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("maintenance.retentionTitle")}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("maintenance.retentionDescription")}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Retention Preview Button */}
              <button
                onClick={handleRetentionPreview}
                disabled={executing !== null}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-colors"
              >
                {executing === "RETENTION_PREVIEW" ? t("maintenance.previewing") : t("maintenance.previewRetention")}
              </button>

              {/* Retention Preview Results */}
              {retentionPreview && (
                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">{t("maintenance.totalCandidates")}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{retentionStats.candidates}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">{t("maintenance.generatedAt")}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {retentionStats.generatedAt ? new Date(retentionStats.generatedAt).toLocaleString() : t("maintenance.notAvailable")}
                      </p>
                    </div>
                  </div>
                  {retentionPreview.buckets?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("maintenance.purgeBreakdown")}</p>
                      <div className="space-y-1">
                        {retentionPreview.buckets.map((bucket, idx) => (
                          <div key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex justify-between">
                            <span>{Object.entries(bucket)[0]?.[0] || `${t("maintenance.bucket")} ${idx + 1}`}:</span>
                            <span className="font-mono">{Object.entries(bucket)[0]?.[1]?.toString() || "0"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Purge Button with Confirmation */}
                  {!confirmPurge ? (
                    <button
                      onClick={() => setConfirmPurge(true)}
                      className="w-full mt-3 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                    >
                      {tr("maintenance.purgeRecords", { count: retentionStats.candidates.toString() })}
                    </button>
                  ) : (
                    <div className="w-full mt-3 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-700 dark:text-red-300 mb-2 font-semibold">
                        {tr("maintenance.purgeConfirm", { count: retentionStats.candidates.toString() })}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleRetentionPurge}
                          disabled={executing === "RETENTION_PURGE"}
                          className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 rounded-lg transition-colors"
                        >
                          {executing === "RETENTION_PURGE" ? t("maintenance.purging") : t("maintenance.yesPurge")}
                        </button>
                        <button
                          onClick={() => setConfirmPurge(false)}
                          className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Chat Reconciliation Section */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("maintenance.chatTitle")}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("maintenance.chatDescription")}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Chat Preview Button */}
              <button
                onClick={handleChatPreview}
                disabled={executing !== null}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-colors"
              >
                {executing === "CHAT_PREVIEW" ? t("maintenance.scanning") : t("maintenance.previewChat")}
              </button>

              {/* Chat Preview Results */}
              {chatPreview && (
                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">{t("maintenance.candidates")}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{chatStats.candidates}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">{t("maintenance.issues")}</p>
                      <p className="text-2xl font-bold text-orange-600">{chatStats.issues}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">{t("maintenance.scannedAt")}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {chatStats.generatedAt ? new Date(chatStats.generatedAt).toLocaleString() : t("maintenance.notAvailable")}
                      </p>
                    </div>
                  </div>
                  {chatPreview.buckets?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("maintenance.repairBreakdown")}</p>
                      <div className="space-y-1">
                        {chatPreview.buckets.map((bucket, idx) => (
                          <div key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex justify-between">
                            <span>{Object.entries(bucket)[0]?.[0] || `${t("maintenance.bucket")} ${idx + 1}`}:</span>
                            <span className="font-mono">{Object.entries(bucket)[0]?.[1]?.toString() || "0"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatPreview.issues?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-2">{t("maintenance.issuesFound")}</p>
                      <div className="space-y-1">
                        {chatPreview.issues.map((issue, idx) => (
                          <div key={idx} className="text-xs text-gray-600 dark:text-gray-400 p-2 bg-orange-50 dark:bg-orange-900/20 rounded border border-orange-200 dark:border-orange-800">
                            {JSON.stringify(issue)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Repair Button with Confirmation */}
                  {!confirmRepair ? (
                    <button
                      onClick={() => setConfirmRepair(true)}
                      className="w-full mt-3 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
                    >
                      {tr("maintenance.repairInboxes", { count: chatStats.candidates.toString() })}
                    </button>
                  ) : (
                    <div className="w-full mt-3 p-3 bg-orange-100 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-800 rounded-lg">
                      <p className="text-sm text-orange-700 dark:text-orange-300 mb-2 font-semibold">
                        {tr("maintenance.repairConfirm", { count: chatStats.candidates.toString() })}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleChatRepair}
                          disabled={executing === "CHAT_REPAIR"}
                          className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 rounded-lg transition-colors"
                        >
                          {executing === "CHAT_REPAIR" ? t("maintenance.repairing") : t("maintenance.yesRepair")}
                        </button>
                        <button
                          onClick={() => setConfirmRepair(false)}
                          className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Operation History */}
          {operationHistory.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("maintenance.operationHistory")}</h2>
              </div>
              <div className="px-6 py-5">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {operationHistory.map((operation, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs ${
                        operation.success
                          ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                          : "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800 text-red-700 dark:text-red-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold">{operationLabel(operation.type)}</span>
                        <span className="text-[11px] opacity-75">
                          {new Date(operation.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      {operation.error && <p className="text-[11px] mt-1">{operation.error}</p>}
                      {operation.success && !operation.error && (
                        <p className="text-[11px] mt-1 opacity-75">{t("maintenance.completed")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Maintenance;
