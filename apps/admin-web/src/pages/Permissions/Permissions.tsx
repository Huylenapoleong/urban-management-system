import React, { useEffect, useMemo, useState } from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { useI18n } from "../../i18n/I18nContext";
import { usersService, User } from "../../services/users.service";

type RoleKey = "SUPER_ADMIN" | "ADMIN" | "PROVINCE_OFFICER" | "WARD_OFFICER" | "CITIZEN";
type Capability = "read" | "write" | "delete" | "approve" | "manage";

interface CapabilityRow {
  resource: string;
  description: string;
  permissions: Record<RoleKey, Capability[]>;
}

interface RoleSummary {
  role: RoleKey;
  label: string;
  description: string;
  color: string;
  badge: string;
}

const roleOrder: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "PROVINCE_OFFICER", "WARD_OFFICER", "CITIZEN"];

const roleSummaries: RoleSummary[] = [
  {
    role: "SUPER_ADMIN",
    label: "Super Admin",
    description: "Full system control, including security and maintenance workflows",
    color: "text-purple-700 dark:text-purple-300",
    badge: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-900/40",
  },
  {
    role: "ADMIN",
    label: "Admin",
    description: "Operational control over users, reports, groups, and system settings",
    color: "text-blue-700 dark:text-blue-300",
    badge: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/40",
  },
  {
    role: "PROVINCE_OFFICER",
    label: "Province Officer",
    description: "Regional oversight and escalation management within scope",
    color: "text-emerald-700 dark:text-emerald-300",
    badge: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/40",
  },
  {
    role: "WARD_OFFICER",
    label: "Ward Officer",
    description: "Local operations for assigned ward or district scope",
    color: "text-sky-700 dark:text-sky-300",
    badge: "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-900/40",
  },
  {
    role: "CITIZEN",
    label: "Citizen",
    description: "Self-service reporting and conversation participation",
    color: "text-gray-700 dark:text-gray-300",
    badge: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
  },
];

const capabilityRows: CapabilityRow[] = [
  {
    resource: "Users",
    description: "Account management and status control",
    permissions: {
      SUPER_ADMIN: ["read", "write", "delete", "manage"],
      ADMIN: ["read", "write", "delete", "manage"],
      PROVINCE_OFFICER: ["read"],
      WARD_OFFICER: ["read"],
      CITIZEN: ["read"],
    },
  },
  {
    resource: "Reports",
    description: "Incident lifecycle, assignment, and audit review",
    permissions: {
      SUPER_ADMIN: ["read", "write", "delete", "approve", "manage"],
      ADMIN: ["read", "write", "delete", "approve", "manage"],
      PROVINCE_OFFICER: ["read", "write", "approve"],
      WARD_OFFICER: ["read", "write", "approve"],
      CITIZEN: ["read", "write"],
    },
  },
  {
    resource: "Groups & Conversations",
    description: "Moderation, inbox operations, and linked report channels",
    permissions: {
      SUPER_ADMIN: ["read", "write", "delete", "manage"],
      ADMIN: ["read", "write", "delete", "manage"],
      PROVINCE_OFFICER: ["read", "write", "manage"],
      WARD_OFFICER: ["read", "write", "manage"],
      CITIZEN: ["read", "write"],
    },
  },
  {
    resource: "Maintenance",
    description: "Retention repair and chat reconciliation operations",
    permissions: {
      SUPER_ADMIN: ["read", "write", "delete", "manage"],
      ADMIN: ["read", "write", "delete", "manage"],
      PROVINCE_OFFICER: ["read"],
      WARD_OFFICER: ["read"],
      CITIZEN: [],
    },
  },
  {
    resource: "Settings",
    description: "System settings and operational configuration",
    permissions: {
      SUPER_ADMIN: ["read", "write", "delete", "manage"],
      ADMIN: ["read", "write", "delete", "manage"],
      PROVINCE_OFFICER: ["read"],
      WARD_OFFICER: ["read"],
      CITIZEN: [],
    },
  },
];

function normalizeRole(role?: string): RoleKey {
  const normalized = role?.toUpperCase();
  if (normalized === "SUPER_ADMIN" || normalized === "ADMIN" || normalized === "PROVINCE_OFFICER" || normalized === "WARD_OFFICER" || normalized === "CITIZEN") {
    return normalized;
  }
  return "CITIZEN";
}

function hasPermission(role: RoleKey, permissions: Capability[]) {
  if (permissions.includes("manage")) return true;
  return permissions.length > 0 && role !== "CITIZEN";
}

const Permissions: React.FC = () => {
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleKey>("ADMIN");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await usersService.getAllUsers({ maxPages: 20, pageSize: 100 });
        if (response.success && response.data) {
          setUsers(response.data);
        } else {
          setError(response.error || t("permissions.error"));
        }
      } catch {
        setError(t("permissions.error"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const roleStats = useMemo(() => {
    const counts = new Map<RoleKey, { total: number; active: number }>();
    roleOrder.forEach((role) => counts.set(role, { total: 0, active: 0 }));

    users.forEach((user) => {
      const role = normalizeRole(user.role);
      const entry = counts.get(role) || { total: 0, active: 0 };
      entry.total += 1;
      if (user.status?.toUpperCase() === "ACTIVE") {
        entry.active += 1;
      }
      counts.set(role, entry);
    });

    return counts;
  }, [users]);

  const selectedSummary = roleSummaries.find((item) => item.role === selectedRole) || roleSummaries[1];
  const selectedCapabilityRows = capabilityRows.map((row) => ({
    ...row,
    allowed: hasPermission(selectedRole, row.permissions[selectedRole]),
  }));

  const totalUsers = users.length;
  const activeUsers = users.filter((user) => user.status?.toUpperCase() === "ACTIVE").length;

  return (
    <>
      <PageMeta title={t("permissions.title")} description={t("permissions.description")} />
      <PageBreadCrumb pageTitle={t("permissions.title")} />

      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-4">
            <p className="text-xs text-gray-500">{t("permissions.totalUsers")}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{loading ? "-" : totalUsers}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-4">
            <p className="text-xs text-gray-500">{t("permissions.activeUsers")}</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{loading ? "-" : activeUsers}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-4">
            <p className="text-xs text-gray-500">{t("permissions.rolesTracked")}</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">{roleOrder.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-4">
            <p className="text-xs text-gray-500">{t("permissions.accessModel")}</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">{t("permissions.backendDefined")}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
          <ComponentCard title={t("permissions.roleOverview")}>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t("permissions.selectRole")}</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as RoleKey)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {roleSummaries.map((role) => (
                  <option key={role.role} value={role.role}>
                    {role.label}
                  </option>
                ))}
              </select>

              <div className={`rounded-2xl border p-4 ${selectedSummary.badge}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-base font-semibold ${selectedSummary.color}`}>{selectedSummary.label}</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{selectedSummary.description}</p>
                  </div>
                  <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-900/50 dark:text-gray-200">
                    {roleStats.get(selectedRole)?.total ?? 0} users
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {roleSummaries.map((role) => {
                  const stats = roleStats.get(role.role) || { total: 0, active: 0 };
                  return (
                    <button
                      key={role.role}
                      type="button"
                      onClick={() => setSelectedRole(role.role)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        selectedRole === role.role
                          ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10"
                          : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{role.label}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{role.description}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-semibold text-gray-900 dark:text-white">{stats.total}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{stats.active} active</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </ComponentCard>

          <ComponentCard title={t("permissions.accessMatrix")}>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">{t("permissions.resource")}</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">{selectedSummary.label}</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">{t("permissions.notes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCapabilityRows.map((row) => (
                    <tr key={row.resource} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-gray-900 dark:text-white">{row.resource}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{row.description}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.allowed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                          {row.allowed ? t("permissions.allowed") : t("permissions.limited")}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-gray-500 dark:text-gray-400">
                        {row.permissions[selectedRole].join(", ") || t("permissions.noAccess")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ComponentCard>
        </div>

        <ComponentCard title={t("permissions.policySummary")}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {roleSummaries.map((role) => {
              const stats = roleStats.get(role.role) || { total: 0, active: 0 };
              return (
                <div key={role.role} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{role.label}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{role.description}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t("permissions.totalUsers")}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{stats.total}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t("permissions.activeUsers")}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{stats.active}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </ComponentCard>
      </div>
    </>
  );
};

export default Permissions;
