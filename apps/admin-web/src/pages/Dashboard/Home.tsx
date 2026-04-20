import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import { useI18n } from "../../i18n/I18nContext";
import { usersService, User } from "../../services/users.service";
import { groupsService, type GroupMetadata } from "../../services/groups.service";

// ── tiny stat card ──────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string; // tailwind bg class for icon bg
  trend?: { value: number; up: boolean };
}

const StatCard: React.FC<StatCardProps> = ({ label, value, sub, icon, accent, trend }) => (
  <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
    <div className={`${accent} rounded-xl p-3 flex-shrink-0`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {trend && (
        <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend.up ? "text-emerald-600" : "text-red-500"}`}>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d={trend.up ? "M5 10l7-7 7 7" : "M19 14l-7 7-7-7"} />
          </svg>
          {Math.abs(trend.value)}% this week
        </div>
      )}
    </div>
  </div>
);

// ── role badge ───────────────────────────────────────────────────────────────
const RoleBadge: React.FC<{ role: string; t: (key: string) => string }> = ({ role, t }) => {
  const map: Record<string, string> = {
    ADMIN: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    PROVINCE_OFFICER: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    WARD_OFFICER: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    CITIZEN: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  };
  const labels: Record<string, string> = {
    ADMIN: t("home.admin") || "Admin",
    PROVINCE_OFFICER: t("home.provinceOfficer"),
    WARD_OFFICER: t("home.wardOfficer"),
    CITIZEN: t("home.citizens"),
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[role] ?? map.CITIZEN}`}>
      {labels[role] ?? role}
    </span>
  );
};

// ── status dot ───────────────────────────────────────────────────────────────
const StatusDot: React.FC<{ status: string; t: (key: string) => string }> = ({ status, t }) => {
  const s = status?.toUpperCase();
  const labels: Record<string, string> = {
    ACTIVE: t("home.active"),
    INACTIVE: t("home.inactive"),
    DEACTIVATED: t("home.deactivated"),
  };
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${s === "ACTIVE" ? "bg-emerald-500" : s === "INACTIVE" ? "bg-amber-400" : "bg-red-400"}`} />
      <span className={s === "ACTIVE" ? "text-emerald-600" : s === "INACTIVE" ? "text-amber-500" : "text-red-500"}>
        {labels[s] || s}
      </span>
    </span>
  );
};

// ── main component ────────────────────────────────────────────────────────────
export default function Home() {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<GroupMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupLoading, setGroupLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await usersService.getUsers(1, 100);
        if (res.success && res.data) setUsers(res.data.items);
      } catch (_) {}
      finally { setLoading(false); }
    })();

    (async () => {
      try {
        const response = await groupsService.getAllGroups({ maxPages: 20, pageSize: 100 });
        if (response.success && response.data) setGroups(response.data);
      } catch (_) {}
      finally { setGroupLoading(false); }
    })();
  }, []);

  // derived stats
  const total = users.length;
  const active = users.filter(u => u.status?.toUpperCase() === "ACTIVE").length;
  const officers = users.filter(u => ["WARD_OFFICER", "PROVINCE_OFFICER", "ADMIN"].includes(u.role?.toUpperCase())).length;
  const citizens = users.filter(u => u.role?.toUpperCase() === "CITIZEN").length;
  const recent = [...users].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);
  const activeGroups = useMemo(() => groups.filter((group) => !group.deletedAt), [groups]);
  const officialGroups = useMemo(() => activeGroups.filter((group) => group.isOfficial), [activeGroups]);
  const recentGroups = useMemo(
    () => [...activeGroups].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 4),
    [activeGroups]
  );

  // role distribution
  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    const r = u.role?.toUpperCase() ?? "UNKNOWN";
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});

  const roleColors: Record<string, string> = {
    ADMIN: "bg-purple-500",
    PROVINCE_OFFICER: "bg-blue-500",
    WARD_OFFICER: "bg-sky-400",
    CITIZEN: "bg-emerald-400",
  };

  return (
    <>
      <PageMeta
        title={`${t("home.overview")} — Smart City Admin`}
        description={t("home.systemName")}
      />

      <div className="space-y-6">

        {/* ── Header greeting ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t("home.overview")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {t("home.systemName")} · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-full border border-emerald-200 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{t("home.systemOnline")}</span>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t("home.totalUsers")}
            value={loading ? "—" : total}
            sub={t("home.allRegisteredAccounts")}
            accent="bg-blue-50 dark:bg-blue-900/20"
            trend={{ value: 12, up: true }}
            icon={
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-2 0" />
              </svg>
            }
          />
          <StatCard
            label={t("home.activeUsers")}
            value={loading ? "—" : active}
            sub={loading ? "" : `${total ? Math.round(active / total * 100) : 0}% ${t("home.ofTotal")}`}
            accent="bg-emerald-50 dark:bg-emerald-900/20"
            trend={{ value: 5, up: true }}
            icon={
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label={t("home.officers")}
            value={loading ? "—" : officers}
            sub={t("home.wardProvinceStaff")}
            accent="bg-purple-50 dark:bg-purple-900/20"
            icon={
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            }
          />
          <StatCard
            label={t("home.citizens")}
            value={loading ? "—" : citizens}
            sub={t("home.registeredResidents")}
            accent="bg-amber-50 dark:bg-amber-900/20"
            trend={{ value: 8, up: true }}
            icon={
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            }
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:border-gray-800 dark:from-white/[0.03] dark:via-white/[0.03] dark:to-blue-950/20 p-5 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t("home.groupOverview")}</p>
                <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{t("home.groupManagement")}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("home.groupOverviewDescription")}</p>
              </div>
              <Link
                to="/groups"
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                {t("home.manageGroups")}
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
                <p className="text-xs text-gray-500">{t("home.totalGroups")}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{groupLoading ? "—" : activeGroups.length}</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
                <p className="text-xs text-gray-500">{t("home.officialGroups")}</p>
                <p className="mt-1 text-2xl font-bold text-purple-600">{groupLoading ? "—" : officialGroups.length}</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
                <p className="text-xs text-gray-500">{t("home.recentGroups")}</p>
                <p className="mt-1 text-2xl font-bold text-blue-600">{groupLoading ? "—" : recentGroups.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">{t("home.recentGroups")}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{t("home.latestGroups")}</p>
              </div>
              <Link to="/groups" className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
                {t("home.viewAll")}
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {groupLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
                  ))}
                </div>
              ) : recentGroups.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">{t("groups.noGroups")}</p>
              ) : (
                recentGroups.map((group) => (
                  <div key={group.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{group.groupName}</p>
                        <p className="text-xs text-gray-400">{group.locationCode}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                        {group.memberCount}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom two-col grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Recent users table — takes 2/3 */}
          <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">{t("home.recentUsers")}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{t("home.latestRegisteredAccounts")}</p>
              </div>
              <a href="/users" className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
                {t("home.viewAll")}
              </a>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-400 mt-2">{t("home.loadingUsers")}</p>
                </div>
              ) : recent.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">{t("home.noUsersFound")}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("home.user")}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("home.role")}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("home.status")}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t("home.joined")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                    {recent.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {user.fullName?.charAt(0)?.toUpperCase() ?? "?"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white truncate">{user.fullName}</p>
                              <p className="text-xs text-gray-400 truncate">{user.email ?? user.phone ?? "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <RoleBadge role={user.role?.toUpperCase()} t={t} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusDot status={user.status} t={t} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">
                          {new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">

            {/* Role distribution */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">{t("home.userDistribution")}</h3>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3,4].map(i => <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(roleCounts).map(([role, count]) => {
                    const pct = total ? Math.round(count / total * 100) : 0;
                    const roleLabel: Record<string, string> = {
                      ADMIN: t("home.admin") || "Admin",
                      PROVINCE_OFFICER: t("home.provinceOfficer"),
                      WARD_OFFICER: t("home.wardOfficer"),
                      CITIZEN: t("home.citizens"),
                    };
                    return (
                      <div key={role}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600 dark:text-gray-300 font-medium">{roleLabel[role] ?? role}</span>
                          <span className="text-gray-400">{count} · {pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${roleColors[role] ?? "bg-gray-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">{t("home.quickActions")}</h3>
              <div className="space-y-2">
                {[
                  { label: t("home.manageUsers"), href: "/users", icon: "M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0z", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400" },
                  { label: t("home.manageGroups"), href: "/groups", icon: "M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0z", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400" },
                  { label: t("home.viewReports"), href: "/reports", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400" },
                  { label: t("home.systemSettings"), href: "/settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z", color: "text-gray-600 bg-gray-50 dark:bg-gray-800 dark:text-gray-400" },
                ].map(({ label, href, icon, color }) => (
                  <a
                    key={label}
                    href={href}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors group"
                  >
                    <div className={`p-2 rounded-lg ${color}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{label}</span>
                    <svg className="w-4 h-4 text-gray-300 ml-auto group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}