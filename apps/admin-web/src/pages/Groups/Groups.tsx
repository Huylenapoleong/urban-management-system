import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { Modal } from "../../components/ui/modal";
import { useI18n } from "../../i18n/I18nContext";
import { GROUP_TYPES } from "../../services/groups.service";
import { groupsService, type CreateGroupRequest, type GroupMetadata } from "../../services/groups.service";

type GroupTab = "overview" | "management";

const GROUP_TYPE_LABELS: Record<string, string> = {
  AREA: "Area",
  TOPIC: "Topic",
  OFFICIAL: "Official",
  PRIVATE: "Private",
};

const GROUP_TYPE_BADGES: Record<string, string> = {
  AREA: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  TOPIC: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  OFFICIAL: "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
  PRIVATE: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
};

const Field = ({ label, required, error, children }: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) => (
  <div>
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {label}{required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const Groups: React.FC = () => {
  const { t } = useI18n();
  const [groups, setGroups] = useState<GroupMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GroupTab>("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupMetadata | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GroupMetadata | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<CreateGroupRequest>({
    groupName: "",
    groupType: "AREA",
    locationCode: "VN-HCM-BQ1-P01",
    description: "",
    isOfficial: false,
  });

  useEffect(() => {
    void loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await groupsService.getAllGroups({ maxPages: 20, pageSize: 100 });
      if (response.success && response.data) {
        setGroups(response.data);
      } else {
        setError(response.error || t("groups.error"));
      }
    } catch {
      setError(t("groups.error"));
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingGroup(null);
    setForm({
      groupName: "",
      groupType: "AREA",
      locationCode: "VN-HCM-BQ1-P01",
      description: "",
      isOfficial: false,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEdit = (group: GroupMetadata) => {
    setEditingGroup(group);
    setForm({
      groupName: group.groupName,
      groupType: group.groupType,
      locationCode: group.locationCode,
      description: group.description || "",
      isOfficial: group.isOfficial,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingGroup(null);
    setFormErrors({});
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!form.groupName.trim()) errors.groupName = t("groups.nameRequired");
    else if (form.groupName.trim().length < 3) errors.groupName = t("groups.nameTooShort");
    if (!form.groupType) errors.groupType = t("groups.typeRequired");
    if (!form.locationCode.trim()) errors.locationCode = t("groups.locationRequired");
    else if (!/^VN(-[A-Z0-9]+){1,4}$/.test(form.locationCode.trim())) {
      errors.locationCode = t("groups.locationInvalid");
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: CreateGroupRequest = {
        groupName: form.groupName.trim(),
        groupType: form.groupType,
        locationCode: form.locationCode.trim(),
        description: form.description?.trim() || undefined,
        isOfficial: form.isOfficial,
      };

      if (editingGroup) {
        const response = await groupsService.updateGroup(editingGroup.id, payload);
        if (response.success && response.data) {
          setGroups((current) => current.map((group) => (group.id === editingGroup.id ? response.data! : group)));
          closeModal();
        } else {
          setError(response.error || t("groups.updateError"));
        }
      } else {
        const response = await groupsService.createGroup(payload);
        if (response.success && response.data) {
          setGroups((current) => [response.data!, ...current]);
          closeModal();
        } else {
          setError(response.error || t("groups.createError"));
        }
      }
    } catch {
      setError(editingGroup ? t("groups.updateError") : t("groups.createError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setSaving(true);
    try {
      const response = await groupsService.deleteGroup(deleteTarget.id);
      if (response.success) {
        setGroups((current) => current.filter((group) => group.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        setError(response.error || t("groups.deleteError"));
      }
    } catch {
      setError(t("groups.deleteError"));
    } finally {
      setSaving(false);
    }
  };

  const filteredGroups = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return [...groups]
      .filter((group) => (typeFilter === "ALL" ? true : group.groupType === typeFilter))
      .filter((group) => {
        if (!normalizedSearch) return true;
        return [group.groupName, group.locationCode, group.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [groups, searchTerm, typeFilter]);

  const recentGroups = useMemo(
    () => [...groups].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [groups]
  );

  const totalGroups = groups.filter((group) => !group.deletedAt).length;
  const officialGroups = groups.filter((group) => !group.deletedAt && group.isOfficial).length;
  const activeGroups = groups.filter((group) => !group.deletedAt && group.memberCount > 0).length;

  return (
    <>
      <PageMeta title={t("groups.title")} description={t("groups.description")} />
      <PageBreadCrumb pageTitle={t("groups.title")} />

      <div className="space-y-5">
        <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 shadow-sm dark:border-gray-800 dark:from-white/[0.03] dark:via-white/[0.03] dark:to-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {t("groups.overviewBadge")}
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("groups.title")}</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("groups.description")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeTab === "overview" ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.05]"}`}
              >
                {t("groups.overviewTab")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("management")}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeTab === "management" ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.05]"}`}
              >
                {t("groups.managementTab")}
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {t("groups.addGroup")}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
            {error}
          </div>
        )}

        {activeTab === "overview" ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("groups.totalGroups")}</p>
                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{loading ? "—" : totalGroups}</p>
                <p className="mt-1 text-xs text-gray-400">{t("groups.totalGroupsHint")}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("groups.officialGroups")}</p>
                <p className="mt-2 text-3xl font-bold text-purple-600">{loading ? "—" : officialGroups}</p>
                <p className="mt-1 text-xs text-gray-400">{t("groups.officialGroupsHint")}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("groups.activeGroups")}</p>
                <p className="mt-2 text-3xl font-bold text-emerald-600">{loading ? "—" : activeGroups}</p>
                <p className="mt-1 text-xs text-gray-400">{t("groups.activeGroupsHint")}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
              <ComponentCard title={t("groups.recentGroups")}>
                {loading ? (
                  <div className="space-y-3 py-4">
                    {[1, 2, 3].map((item) => (
                      <div key={item} className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
                    ))}
                  </div>
                ) : recentGroups.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">{t("groups.noGroups")}</div>
                ) : (
                  <div className="space-y-3 py-1">
                    {recentGroups.map((group) => (
                      <div key={group.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 dark:text-white">{group.groupName}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${GROUP_TYPE_BADGES[group.groupType] ?? "bg-gray-100 text-gray-600"}`}>
                              {GROUP_TYPE_LABELS[group.groupType] ?? group.groupType}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{group.locationCode} · {group.memberCount} members</p>
                        </div>
                        <Link to="/groups" className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                          {t("groups.manageGroups")}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </ComponentCard>

              <ComponentCard title={t("groups.quickActions")}> 
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("management")}
                    className="flex w-full items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-left transition-colors hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-900/10 dark:hover:bg-blue-900/20"
                  >
                    <div className="rounded-xl bg-blue-600 p-2 text-white">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{t("groups.createGroup")}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t("groups.createGroupHint")}</p>
                    </div>
                  </button>

                  <Link
                    to="/audit-logs"
                    className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
                  >
                    <div className="rounded-xl bg-gray-100 p-2 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{t("groups.auditTrail")}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t("groups.auditTrailHint")}</p>
                    </div>
                  </Link>
                </div>
              </ComponentCard>
            </div>

            <ComponentCard title={t("groups.typeBreakdown")}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {GROUP_TYPES.map((groupType) => {
                  const count = groups.filter((group) => !group.deletedAt && group.groupType === groupType).length;
                  return (
                    <div key={groupType} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{GROUP_TYPE_LABELS[groupType] ?? groupType}</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
                    </div>
                  );
                })}
              </div>
            </ComponentCard>
          </div>
        ) : (
          <ComponentCard title={t("groups.managementTab")}>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
                <div className="relative w-full md:max-w-sm">
                  <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={t("groups.searchPlaceholder")}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="ALL">{t("groups.allTypes")}</option>
                  {GROUP_TYPES.map((groupType) => (
                    <option key={groupType} value={groupType}>
                      {GROUP_TYPE_LABELS[groupType] ?? groupType}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                {t("groups.addGroup")}
              </button>
            </div>

            {loading ? (
              <div className="py-12 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <p className="mt-3 text-sm text-gray-400">{t("groups.loading")}</p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">{t("groups.noGroups")}</div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">{t("groups.group")}</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">{t("groups.type")}</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">{t("groups.location")}</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">{t("groups.members")}</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">{t("groups.status")}</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">{t("groups.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map((group) => (
                      <tr key={group.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-4 py-3 align-top">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{group.groupName}</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{group.description || t("groups.noDescription")}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${GROUP_TYPE_BADGES[group.groupType] ?? "bg-gray-100 text-gray-600"}`}>
                            {GROUP_TYPE_LABELS[group.groupType] ?? group.groupType}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-gray-500 dark:text-gray-400">{group.locationCode}</td>
                        <td className="px-4 py-3 align-top text-xs text-gray-500 dark:text-gray-400">{group.memberCount}</td>
                        <td className="px-4 py-3 align-top text-xs text-gray-500 dark:text-gray-400">
                          {group.isOfficial ? (
                            <span className="rounded-full bg-purple-100 px-2.5 py-1 font-semibold text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">{t("groups.official")}</span>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{t("groups.community")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(group)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              {t("groups.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(group)}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/30 dark:text-red-300 dark:hover:bg-red-900/10"
                            >
                              {t("groups.delete")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ComponentCard>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <div className="mx-auto w-full max-w-2xl rounded-3xl bg-white dark:bg-gray-900">
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5 dark:border-gray-800">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {editingGroup ? t("groups.editGroup") : t("groups.createGroup")}
              </h2>
              <p className="mt-0.5 text-xs text-gray-400">
                {editingGroup ? t("groups.editGroupHint") : t("groups.createGroupHint")}
              </p>
            </div>
            <button type="button" onClick={closeModal} className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
            <Field label={t("groups.groupName")} required error={formErrors.groupName}>
              <input
                type="text"
                value={form.groupName}
                onChange={(event) => setForm((current) => ({ ...current, groupName: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </Field>

            <Field label={t("groups.groupType")} required error={formErrors.groupType}>
              <select
                value={form.groupType}
                onChange={(event) => setForm((current) => ({ ...current, groupType: event.target.value as CreateGroupRequest["groupType"] }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {GROUP_TYPES.map((groupType) => (
                  <option key={groupType} value={groupType}>
                    {GROUP_TYPE_LABELS[groupType] ?? groupType}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("groups.locationCode")} required error={formErrors.locationCode}>
              <input
                type="text"
                value={form.locationCode}
                onChange={(event) => setForm((current) => ({ ...current, locationCode: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </Field>

            <div className="flex items-center gap-3 pt-7">
              <input
                id="group-official"
                type="checkbox"
                checked={Boolean(form.isOfficial)}
                onChange={(event) => setForm((current) => ({ ...current, isOfficial: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="group-official" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("groups.official")}
              </label>
            </div>

            <div className="md:col-span-2">
              <Field label={t("groups.descriptionField")}>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
            <button type="button" onClick={closeModal} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              {t("groups.cancel")}
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              {saving ? t("groups.saving") : editingGroup ? t("groups.saveChanges") : t("groups.createGroup")}
            </button>
          </div>
        </div>
      </Modal>

      {deleteTarget && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("groups.deleteGroup")}</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t("groups.deleteConfirmPrefix")} <span className="font-semibold text-gray-900 dark:text-white">{deleteTarget.groupName}</span> {t("groups.deleteConfirmSuffix")}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                {t("groups.cancel")}
              </button>
              <button type="button" onClick={handleDelete} disabled={saving} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? t("groups.deleting") : t("groups.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Groups;