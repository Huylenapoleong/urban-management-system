import React, { useEffect, useMemo, useState } from "react";
import ComponentCard from "../../components/common/ComponentCard";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useI18n } from "../../i18n/I18nContext";
import { Report, ReportStatus, reportsService } from "../../services/reports.service";

interface Ranking {
  rank: number;
  region: string;
  totalReports: number;
  resolved: number;
  avgResolutionTimeDays: number;
  slaCompliance: number;
  satisfactionScore: number;
  rankingScore: number;
}

const RESOLVED_STATUSES: ReportStatus[] = ["RESOLVED", "CLOSED"];
const DAY_MS = 24 * 60 * 60 * 1000;

function diffInDays(from: string, to: string) {
  return Math.max(0, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS));
}

function getSlaTargetDays(priority: Report["priority"]) {
  if (priority === "URGENT") return 1;
  if (priority === "HIGH") return 2;
  if (priority === "MEDIUM") return 4;
  return 7;
}

const Rankings: React.FC = () => {
  const { t } = useI18n();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await reportsService.getReports(1, 300);
        if (response.success && response.data) {
          setReports(response.data.items);
        } else {
          setError(response.error || t("rankings.error"));
        }
      } catch {
        setError(t("rankings.error"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const rankings = useMemo<Ranking[]>(() => {
    const byRegion = new Map<string, Report[]>();
    reports.forEach((report) => {
      const key = report.locationCode || "UNKNOWN";
      const list = byRegion.get(key) || [];
      list.push(report);
      byRegion.set(key, list);
    });

    const rows: Ranking[] = Array.from(byRegion.entries()).map(([region, items]) => {
      const resolvedItems = items.filter((r) => RESOLVED_STATUSES.includes(r.status));
      const resolved = resolvedItems.length;
      const totalReports = items.length;
      const totalResolutionDays = resolvedItems.reduce((sum, item) => sum + diffInDays(item.createdAt, item.updatedAt), 0);
      const avgResolutionTimeDays = resolved > 0 ? Number((totalResolutionDays / resolved).toFixed(1)) : 0;
      const withinSlaCount = items.filter(
        (item) =>
          diffInDays(item.createdAt, RESOLVED_STATUSES.includes(item.status) ? item.updatedAt : new Date().toISOString()) <=
          getSlaTargetDays(item.priority)
      ).length;
      const slaCompliance = totalReports > 0 ? Number(((withinSlaCount / totalReports) * 100).toFixed(1)) : 0;
      const satisfactionScore = Number(
        (slaCompliance * 0.6 + (resolved > 0 ? Math.max(0, 100 - avgResolutionTimeDays * 10) : 0) * 0.4).toFixed(1)
      );
      const rankingScore = Number((satisfactionScore * 0.5 + slaCompliance * 0.5).toFixed(1));

      return {
        rank: 0,
        region,
        totalReports,
        resolved,
        avgResolutionTimeDays,
        slaCompliance,
        satisfactionScore,
        rankingScore,
      };
    });

    return rows
      .sort((a, b) => {
        if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
        if (a.avgResolutionTimeDays !== b.avgResolutionTimeDays) return a.avgResolutionTimeDays - b.avgResolutionTimeDays;
        return b.resolved - a.resolved;
      })
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }, [reports]);

  const getMedalColor = (rank: number) => {
    if (rank === 1) return "bg-yellow-400 text-white shadow-yellow-200 shadow-md";
    if (rank === 2) return "bg-gray-400 text-white shadow-gray-200 shadow-md";
    if (rank === 3) return "bg-orange-500 text-white shadow-orange-200 shadow-md";
    return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  };

  const getSlaColor = (sla: number) => {
    if (sla >= 95) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (sla >= 90) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  };

  const getResolutionRate = (resolved: number, total: number) => (total > 0 ? Math.round((resolved / total) * 100) : 0);

  const totalResolved = rankings.reduce((sum, item) => sum + item.resolved, 0);

  return (
    <>
      <PageMeta title={t("rankings.title")} description={t("rankings.description")} />
      <PageBreadCrumb pageTitle={t("rankings.title")} />

      <div className="grid gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: t("rankings.topPerformer"),
              value: rankings[0]?.region ?? "—",
              sub: `${rankings[0]?.slaCompliance ?? 0}% ${t("rankings.slaCompliance")}`,
              color: "text-yellow-600",
              bg: "bg-yellow-50 dark:bg-yellow-900/10",
              icon: (
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ),
            },
            {
              label: t("rankings.avgSlaCompliance"),
              value: rankings.length > 0 ? `${(rankings.reduce((sum, item) => sum + item.slaCompliance, 0) / rankings.length).toFixed(1)}%` : "0%",
              sub: t("rankings.acrossAllDistricts"),
              color: "text-blue-600",
              bg: "bg-blue-50 dark:bg-blue-900/10",
              icon: (
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              ),
            },
            {
              label: t("rankings.totalReports"),
              value: rankings.reduce((sum, item) => sum + item.totalReports, 0).toLocaleString(),
              sub: `${totalResolved} ${t("rankings.resolved")}`,
              color: "text-emerald-600",
              bg: "bg-emerald-50 dark:bg-emerald-900/10",
              icon: (
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
            },
          ].map(({ label, value, sub, color, bg, icon }) => (
            <div key={label} className={`rounded-2xl border border-gray-200 dark:border-gray-800 ${bg} p-5 flex items-center gap-4`}>
              <div className="p-2.5 bg-white dark:bg-gray-900 rounded-xl shadow-sm">{icon}</div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                <p className={`text-xl font-bold ${color} dark:text-current`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        <ComponentCard title={t("rankings.tableTitle")}>
          {error && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("rankings.rank")}</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("rankings.region")}</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("rankings.totalReports")}</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("rankings.resolved")}</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("rankings.resolutionRate")}</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("rankings.avgTime")}</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("rankings.slaCompliance")}</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("rankings.satisfaction")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                      {t("rankings.loading")}
                    </td>
                  </tr>
                ) : rankings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                      {t("rankings.noData")}
                    </td>
                  </tr>
                ) : (
                  rankings.map((item) => {
                    const rate = getResolutionRate(item.resolved, item.totalReports);
                    return (
                      <tr key={item.rank} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getMedalColor(item.rank)}`}>
                            {item.rank}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-semibold text-gray-800 dark:text-white">{item.region}</td>
                        <td className="px-5 py-4 text-center text-gray-600 dark:text-gray-300">{item.totalReports}</td>
                        <td className="px-5 py-4 text-center font-medium text-emerald-600 dark:text-emerald-400">{item.resolved}</td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${rate}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-8">{rate}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center text-gray-600 dark:text-gray-300">
                          {item.avgResolutionTimeDays.toFixed(1)} {t("common.days")}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getSlaColor(item.slaCompliance)}`}>
                            {item.slaCompliance}%
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center text-blue-600 dark:text-blue-400 font-semibold">{item.satisfactionScore}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">* {t("rankings.satisfactionNote")}</p>
        </ComponentCard>
      </div>
    </>
  );
};

export default Rankings;