import { useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { Link } from "react-router";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useI18n } from "../../i18n/I18nContext";
import { conversationsService, MessageItem } from "../../services/conversations.service";
import { Report, reportsService } from "../../services/reports.service";
import { User, usersService } from "../../services/users.service";

const FETCH_TIMEOUT_MS = 12000;
const DAY_MS = 24 * 60 * 60 * 1000;

type TimeRange = "month" | "quarter" | "year";

type DataLoadState = {
  usersLoaded: boolean;
  reportsLoaded: boolean;
  messagesLoaded: boolean;
  isTimeout: boolean;
  hasPartialFailure: boolean;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("REQUEST_TIMEOUT"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function inRange(isoDate: string, from: Date, to: Date) {
  const value = new Date(isoDate).getTime();
  return value >= from.getTime() && value <= to.getTime();
}

function getWindow(range: TimeRange) {
  const now = new Date();
  const to = new Date();
  let from: Date;

  if (range === "month") {
    from = new Date(now.getTime() - 30 * DAY_MS);
  } else if (range === "quarter") {
    from = new Date(now.getTime() - 90 * DAY_MS);
  } else {
    from = new Date(now.getTime() - 365 * DAY_MS);
  }

  return { from, to };
}

function getLocationCodes(users: User[], reports: Report[]) {
  const set = new Set<string>();
  users.forEach((u) => u.locationCode && set.add(u.locationCode));
  reports.forEach((r) => r.locationCode && set.add(r.locationCode));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export default function SlaStats() {
  const { t } = useI18n();
  const [range, setRange] = useState<TimeRange>("quarter");
  const [locationCode, setLocationCode] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<DataLoadState>({
    usersLoaded: false,
    reportsLoaded: false,
    messagesLoaded: false,
    isTimeout: false,
    hasPartialFailure: false,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      setState({
        usersLoaded: false,
        reportsLoaded: false,
        messagesLoaded: false,
        isTimeout: false,
        hasPartialFailure: false,
      });

      try {
        const [usersResult, reportsResult] = await Promise.all([
          withTimeout(usersService.getAllUsers({ maxPages: 20, pageSize: 100 }), FETCH_TIMEOUT_MS),
          withTimeout(reportsService.getAllReports({}, { maxPages: 20, pageSize: 120 }), FETCH_TIMEOUT_MS),
        ]);

        const loadedUsers = usersResult.success ? usersResult.data || [] : [];
        const loadedReports = reportsResult.success ? reportsResult.data || [] : [];

        setUsers(loadedUsers);
        setReports(loadedReports);

        let partialFailure = false;

        if (!usersResult.success || !reportsResult.success) {
          partialFailure = true;
        }

        let loadedMessages: MessageItem[] = [];
        try {
          const conversationsResult = await withTimeout(
            conversationsService.getAllConversations({ maxPages: 5, pageSize: 60 }),
            FETCH_TIMEOUT_MS
          );

          if (conversationsResult.success && conversationsResult.data) {
            const conversationIds = conversationsResult.data
              .slice(0, 35)
              .map((item) => item.conversationId);

            if (conversationIds.length > 0) {
              const messagesResult = await withTimeout(
                conversationsService.getMessagesForConversations(conversationIds, {
                  perConversationLimit: 80,
                }),
                FETCH_TIMEOUT_MS
              );

              if (messagesResult.success && messagesResult.data) {
                loadedMessages = messagesResult.data;
                setMessages(loadedMessages);
              } else {
                partialFailure = true;
              }
            }
          } else {
            partialFailure = true;
          }
        } catch {
          partialFailure = true;
        }

        setState({
          usersLoaded: usersResult.success,
          reportsLoaded: reportsResult.success,
          messagesLoaded: loadedMessages.length > 0,
          isTimeout: false,
          hasPartialFailure: partialFailure,
        });

        if (!usersResult.success && !reportsResult.success) {
          setError(t("dashboard.failedLoadData"));
        }
      } catch (e) {
        const timeout = e instanceof Error && e.message === "REQUEST_TIMEOUT";
        setState({
          usersLoaded: false,
          reportsLoaded: false,
          messagesLoaded: false,
          isTimeout: timeout,
          hasPartialFailure: false,
        });
        setError(
          timeout
            ? t("dashboard.dataLoading")
            : t("dashboard.failedLoadData")
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const userById = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((user) => map.set(user.id, user));
    return map;
  }, [users]);

  const availableLocations = useMemo(() => getLocationCodes(users, reports), [users, reports]);

  const { from, to } = useMemo(() => getWindow(range), [range]);

  const scopedUsers = useMemo(() => {
    if (!locationCode) return users;
    return users.filter((u) => u.locationCode === locationCode);
  }, [users, locationCode]);

  const scopedReports = useMemo(() => {
    const filteredByLocation = locationCode
      ? reports.filter((r) => r.locationCode === locationCode)
      : reports;

    return filteredByLocation.filter((r) => inRange(r.createdAt, from, to));
  }, [reports, locationCode, from, to]);

  const scopedMessages = useMemo(() => {
    return messages.filter((message) => {
      if (!inRange(message.sentAt, from, to)) return false;
      if (!locationCode) return true;
      const sender = userById.get(message.senderId);
      return sender?.locationCode === locationCode;
    });
  }, [messages, from, to, locationCode, userById]);

  const dau = useMemo(() => {
    const dayAgo = new Date(Date.now() - DAY_MS);
    const senders = new Set(
      scopedMessages.filter((m) => new Date(m.sentAt) >= dayAgo).map((m) => m.senderId)
    );
    return senders.size;
  }, [scopedMessages]);

  const mau = useMemo(() => {
    const senders = new Set(scopedMessages.map((m) => m.senderId));
    return senders.size;
  }, [scopedMessages]);

  const userKpi = useMemo(() => {
    const citizens = scopedUsers.filter((u) => u.role === "CITIZEN");
    const officials = scopedUsers.filter((u) => u.role !== "CITIZEN");
    return {
      total: scopedUsers.length,
      citizens: citizens.length,
      officials: officials.length,
      dau,
      mau,
      dauMauRatio: mau > 0 ? Math.round((dau / mau) * 100) : 0,
    };
  }, [scopedUsers, dau, mau]);

  const reportsKpi = useMemo(() => {
    const resolvedStatuses = new Set(["RESOLVED", "CLOSED"]);
    const resolved = scopedReports.filter((r) => resolvedStatuses.has(r.status)).length;
    const backlog = scopedReports.length - resolved;
    return {
      total: scopedReports.length,
      resolved,
      backlog,
      resolvedRate: scopedReports.length > 0 ? Math.round((resolved / scopedReports.length) * 100) : 0,
    };
  }, [scopedReports]);

  const userGrowthSeries = useMemo(() => {
    const monthBuckets: string[] = [];
    const citizenMap = new Map<string, number>();
    const officialMap = new Map<string, number>();

    const start = startOfMonth(new Date(Date.now() - 11 * 30 * DAY_MS));
    for (let i = 0; i < 12; i += 1) {
      const month = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = formatMonthKey(month);
      monthBuckets.push(key);
      citizenMap.set(key, 0);
      officialMap.set(key, 0);
    }

    scopedUsers.forEach((user) => {
      const key = formatMonthKey(new Date(user.createdAt));
      if (!citizenMap.has(key)) return;
      if (user.role === "CITIZEN") {
        citizenMap.set(key, (citizenMap.get(key) || 0) + 1);
      } else {
        officialMap.set(key, (officialMap.get(key) || 0) + 1);
      }
    });

    return {
      categories: monthBuckets.map((k) => {
        const [year, month] = k.split("-");
        return `${month}/${year.slice(-2)}`;
      }),
      citizens: monthBuckets.map((k) => citizenMap.get(k) || 0),
      officials: monthBuckets.map((k) => officialMap.get(k) || 0),
    };
  }, [scopedUsers]);

  const reportCategorySeries = useMemo(() => {
    const categories = [
      "INFRASTRUCTURE",
      "TRAFFIC",
      "ENVIRONMENT",
      "SECURITY",
      "PUBLIC_ORDER",
      "PUBLIC_SERVICES",
    ];

    return {
      labels: categories,
      values: categories.map(
        (category) => scopedReports.filter((report) => report.category === category).length
      ),
    };
  }, [scopedReports]);

  const performanceByLocation = useMemo(() => {
    const map = new Map<string, { total: number; resolved: number }>();
    const resolvedStatuses = new Set(["RESOLVED", "CLOSED"]);

    reports
      .filter((report) => inRange(report.createdAt, from, to))
      .forEach((report) => {
        const key = report.locationCode || "UNKNOWN";
        const row = map.get(key) || { total: 0, resolved: 0 };
        row.total += 1;
        if (resolvedStatuses.has(report.status)) row.resolved += 1;
        map.set(key, row);
      });

    return Array.from(map.entries())
      .map(([code, value]) => ({
        code,
        total: value.total,
        resolvedRate: value.total > 0 ? Math.round((value.resolved / value.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [reports, from, to]);

  const lineOptions: ApexOptions = {
    chart: { type: "line", toolbar: { show: false }, fontFamily: "Outfit, sans-serif" },
    stroke: { curve: "smooth", width: 3 },
    dataLabels: { enabled: false },
    xaxis: { categories: userGrowthSeries.categories },
    legend: { position: "top" },
    colors: ["#2563eb", "#16a34a"],
    yaxis: { min: 0 },
  };

  const pieOptions: ApexOptions = {
    chart: { type: "donut", fontFamily: "Outfit, sans-serif" },
    labels: reportCategorySeries.labels,
    legend: { position: "bottom" },
    dataLabels: { enabled: true },
  };

  const statusPieOptions: ApexOptions = {
    chart: { type: "donut", fontFamily: "Outfit, sans-serif" },
    labels: ["Resolved", "Backlog"],
    legend: { position: "bottom" },
    colors: ["#16a34a", "#dc2626"],
  };

  const barOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "Outfit, sans-serif" },
    plotOptions: { bar: { borderRadius: 6, columnWidth: "45%" } },
    dataLabels: { enabled: false },
    xaxis: { categories: performanceByLocation.map((item) => item.code) },
    yaxis: { max: 100, labels: { formatter: (v) => `${v}%` } },
    colors: ["#0ea5e9"],
  };

  return (
    <>
      <PageMeta title={t("dashboard.globalDashboard")} description={t("dashboard.systemWideKpi")} />
      <PageBreadCrumb pageTitle={t("dashboard.globalDashboard")} />

      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("dashboard.timeRange")}</label>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as TimeRange)}
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white"
              >
                <option value="month">{t("dashboard.lastMonth")}</option>
                <option value="quarter">{t("dashboard.lastQuarter")}</option>
                <option value="year">{t("dashboard.lastYear")}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("dashboard.administrativeUnit")}</label>
              <select
                value={locationCode}
                onChange={(e) => setLocationCode(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white"
              >
                <option value="">{t("dashboard.allSystem")}</option>
                {availableLocations.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Link
                to="/dashboard/heatmap"
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white"
              >
                {t("dashboard.openHeatmap")}
              </Link>
            </div>
          </div>
        </div>

        {state.isTimeout && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300 text-sm">
            {t("dashboard.dataLoading")}
          </div>
        )}

        {state.hasPartialFailure && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/40 dark:bg-red-900/15 dark:text-red-300 text-sm">
            {t("dashboard.partialFailure")}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/40 dark:bg-red-900/15 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
            <p className="text-xs text-gray-500">{t("dashboard.totalUsers")}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{loading ? "-" : userKpi.total}</p>
            <p className="text-xs text-gray-400 mt-1">{t("dashboard.citizen")}: {userKpi.citizens} · {t("dashboard.official")}: {userKpi.officials}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
            <p className="text-xs text-gray-500">{t("dashboard.dau")}</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{loading ? "-" : `${userKpi.dau} / ${userKpi.mau}`}</p>
            <p className="text-xs text-gray-400 mt-1">{t("dashboard.stickiness")}: {userKpi.dauMauRatio}%</p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
            <p className="text-xs text-gray-500">{t("dashboard.totalReports")}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{loading ? "-" : reportsKpi.total}</p>
            <p className="text-xs text-gray-400 mt-1">{t("dashboard.resolved")}: {reportsKpi.resolved}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
            <p className="text-xs text-gray-500">{t("dashboard.backlog")}</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{loading ? "-" : reportsKpi.backlog}</p>
            <p className="text-xs text-gray-400 mt-1">{t("dashboard.resolutionRate")}: {reportsKpi.resolvedRate}%</p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
            <p className="text-xs text-gray-500">{t("dashboard.messageTraffic")}</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{loading ? "-" : scopedMessages.length}</p>
            <p className="text-xs text-gray-400 mt-1">{t("dashboard.inSelectedRange")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("dashboard.userGrowthMonthly")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t("dashboard.compareCitizenOfficial")}</p>
            <div className="mt-3">
              <Chart
                options={lineOptions}
                series={[
                  { name: t("dashboard.citizen"), data: userGrowthSeries.citizens },
                  { name: t("dashboard.official"), data: userGrowthSeries.officials },
                ]}
                type="line"
                height={320}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("dashboard.issueStructure")}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{t("dashboard.reportDistribution")}</p>
              <div className="mt-3">
                <Chart options={pieOptions} series={reportCategorySeries.values} type="donut" height={220} />
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("dashboard.resolutionVsBacklog")}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{t("dashboard.byCurrentFilter")}</p>
              <div className="mt-3">
                <Chart
                  options={statusPieOptions}
                  series={[reportsKpi.resolved, reportsKpi.backlog]}
                  type="donut"
                  height={220}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("dashboard.performanceByLocation")}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t("dashboard.compareResolutionRate")}</p>
          <div className="mt-3">
            <Chart
              options={barOptions}
              series={[{ name: "Resolution rate", data: performanceByLocation.map((item) => item.resolvedRate) }]}
              type="bar"
              height={320}
            />
          </div>
        </div>
      </div>
    </>
  );
}
