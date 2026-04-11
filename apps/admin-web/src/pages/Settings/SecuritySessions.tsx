import React, { useEffect, useState } from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { useI18n } from "../../i18n/I18nContext";
import {
  authService,
  AuthSessionInfo,
  LogoutAllResult,
  RevokeSessionResult,
} from "../../services/auth.service";

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const formatTimeLeft = (expiresAt: string) => {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day(s)`;
  if (hours > 0) return `${hours} hour(s)`;

  const minutes = Math.floor(ms / (1000 * 60));
  return `${Math.max(minutes, 1)} min`;
};

const SecuritySessions: React.FC = () => {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<AuthSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authService.getSessions();
      if (response.success && response.data) {
        setSessions(response.data);
      } else {
        setError(response.error || t("securitySessions.failedToLoadSessions"));
      }
    } catch {
      setError(t("securitySessions.failedToLoadSessions"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevoke = async (sessionId: string) => {
    setBusySessionId(sessionId);
    setError(null);
    setNotice(null);
    try {
      const response = await authService.revokeSession(sessionId);
      if (response.success && response.data) {
        const data = response.data as RevokeSessionResult;
        setNotice(data.currentSessionRevoked ? t("securitySessions.currentSessionRevoked") : t("securitySessions.sessionRevoked"));
        if (data.currentSessionRevoked) {
          await authService.logout();
          window.location.href = "/signin";
          return;
        }
        await loadSessions();
      } else {
        setError(response.error || t("securitySessions.failedToRevokeSession"));
      }
    } catch {
      setError(t("securitySessions.failedToRevokeSession"));
    } finally {
      setBusySessionId(null);
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm(t("securitySessions.confirmRevokeAll"))) return;

    setBusySessionId("ALL");
    setError(null);
    setNotice(null);
    try {
      const response = await authService.logoutAll();
      if (response.success && response.data) {
        const data = response.data as LogoutAllResult;
        setNotice(`${t("securitySessions.revokedPrefix")} ${data.revokedSessionCount} ${t("securitySessions.revokedSuffix")}`);
        if (data.currentSessionRevoked) {
          await authService.logout();
          window.location.href = "/signin";
          return;
        }
        await loadSessions();
      } else {
        setError(response.error || t("securitySessions.failedToRevokeAllSessions"));
      }
    } catch {
      setError(t("securitySessions.failedToRevokeAllSessions"));
    } finally {
      setBusySessionId(null);
    }
  };

  return (
    <>
      <PageMeta
        title={t("securitySessions.pageTitle")}
        description={t("securitySessions.pageDescription")}
      />
      <PageBreadCrumb pageTitle={t("securitySessions.pageTitle")} />

      <ComponentCard title={t("securitySessions.cardTitle")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? t("securitySessions.loadingSessions") : `${sessions.length} ${t("securitySessions.sessionsFound")}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSessions}
              disabled={loading || busySessionId === "ALL"}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {t("common.refresh")}
            </button>
            <button
              type="button"
              onClick={handleLogoutAll}
              disabled={loading || sessions.length === 0 || busySessionId === "ALL"}
              className="px-3 py-2 rounded-lg bg-red-600 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busySessionId === "ALL" ? t("securitySessions.revoking") : t("securitySessions.revokeAllSessions")}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300">
            {notice}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Session</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Device</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Last Used</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Expires In</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && sessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    {t("securitySessions.noActiveSessions")}
                  </td>
                </tr>
              )}

              {sessions.map((session) => (
                <tr key={session.sessionId} className="border-b border-gray-100 dark:border-gray-800/70">
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {session.isCurrent ? t("securitySessions.currentSession") : t("securitySessions.signedInDevice")}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{session.sessionId}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-200">
                    <div className="flex flex-col gap-1">
                      <span>{session.appVariant || t("securitySessions.unknownApp")}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{session.deviceId || t("securitySessions.unknownDevice")}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{session.ipAddress || t("securitySessions.unknownIp")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-200">
                    {formatDateTime(session.lastUsedAt)}
                  </td>
                  <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-200">
                    {formatTimeLeft(session.expiresAt)}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    <button
                      type="button"
                      onClick={() => handleRevoke(session.sessionId)}
                      disabled={busySessionId === session.sessionId}
                      className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                    >
                        {busySessionId === session.sessionId ? t("securitySessions.revoking") : t("securitySessions.revoke")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ComponentCard>
    </>
  );
};

export default SecuritySessions;
