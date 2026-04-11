/**
 * Reports Management Page
 */

import React, { useState, useEffect, useCallback } from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import {
  reportsService,
  Report,
  ReportStatus,
  ReportPriority,
  ReportCategory,
  AuditEventItem,
  ReportConversationLink,
  CreateReportRequest,
  UpdateReportRequest,
} from "../../services/reports.service";
import { uploadsService } from "../../services/uploads.service";
import { useAuth } from "../../context/AuthContext";

type ReportMediaItem = {
  key?: string;
  url: string;
  name: string;
};

// ── config maps ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ReportStatus, { label: string; dot: string; badge: string }> = {
  NEW:         { label: "New",         dot: "bg-blue-500",   badge: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" },
  IN_REVIEW:   { label: "In Review",   dot: "bg-purple-500", badge: "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300" },
  IN_PROGRESS: { label: "In Progress", dot: "bg-amber-500",  badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" },
  RESOLVED:    { label: "Resolved",    dot: "bg-emerald-500",badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" },
  CLOSED:      { label: "Closed",      dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  REJECTED:    { label: "Rejected",    dot: "bg-red-500",    badge: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" },
};

const PRIORITY_CONFIG: Record<ReportPriority, { label: string; badge: string }> = {
  LOW:    { label: "Low",    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  MEDIUM: { label: "Medium", badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" },
  HIGH:   { label: "High",   badge: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300" },
  URGENT: { label: "Urgent", badge: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" },
};

const CATEGORY_CONFIG: Record<ReportCategory, { label: string; icon: string }> = {
  INFRASTRUCTURE:  { label: "Infrastructure",  icon: "🏗️" },
  TRAFFIC:         { label: "Traffic",         icon: "🚦" },
  ENVIRONMENT:     { label: "Environment",     icon: "🌿" },
  SECURITY:        { label: "Security",        icon: "🛡️" },
  PUBLIC_ORDER:    { label: "Public Order",    icon: "📋" },
  PUBLIC_SERVICES: { label: "Public Services", icon: "🏛️" },
};

const ALL_STATUSES   = Object.keys(STATUS_CONFIG)   as ReportStatus[];
const ALL_PRIORITIES = Object.keys(PRIORITY_CONFIG) as ReportPriority[];
const ALL_CATEGORIES = Object.keys(CATEGORY_CONFIG) as ReportCategory[];

// ── helpers ───────────────────────────────────────────────────────────────────

const Field = ({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && (
      <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
        </svg>
        {error}
      </p>
    )}
  </div>
);

const TInput = ({ type = "text", value, onChange, placeholder, error }: {
  type?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; error?: string;
}) => (
  <input type={type} value={value} onChange={onChange} placeholder={placeholder}
    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border transition-all focus:outline-none focus:ring-2 ${
      error ? "border-red-300 focus:ring-red-100 bg-red-50 dark:bg-red-900/10"
             : "border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:ring-blue-100 focus:border-blue-400"
    }`}
  />
);

const NativeSelect = ({ value, onChange, children, className = "" }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string;
}) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className={`px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all ${className}`}>
    {children}
  </select>
);

// ── main component ────────────────────────────────────────────────────────────

const Reports: React.FC = () => {
  const { currentUser } = useAuth();

  const [reports, setReports]       = useState<Report[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState<ReportStatus | "">("");
  const [categoryFilter, setCat]    = useState<ReportCategory | "">("");
  const [priorityFilter, setPri]    = useState<ReportPriority | "">("");

  const [isModalOpen, setModal]     = useState(false);
  const [editingReport, setEditing] = useState<Report | null>(null);
  const [viewingReport, setViewing] = useState<Report | null>(null);
  const [reportAuditTrail, setReportAuditTrail] = useState<AuditEventItem[]>([]);
  const [linkedConversations, setLinkedConversations] = useState<ReportConversationLink[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaItems, setMediaItems] = useState<ReportMediaItem[]>([]);
  const [deleteConfirm, setDelConf] = useState<string | null>(null);
  const [formErrors, setFErrors]    = useState<Record<string, string>>({});

  const emptyForm = () => ({
    title: "", description: "", category: "INFRASTRUCTURE" as ReportCategory,
    locationCode: currentUser?.locationCode ?? "VN-HCM-BQ1-P01",
    priority: "MEDIUM" as ReportPriority, status: "NEW" as ReportStatus,
  });
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await reportsService.getReports(1, 100, {
        status:   statusFilter || undefined,
        category: categoryFilter || undefined,
        priority: priorityFilter || undefined,
        q:        search || undefined,
      });
      if (res.success && res.data) setReports(res.data.items);
      else setError(res.error || "Failed to load reports");
    } catch { setError("Failed to load reports"); }
    finally { setLoading(false); }
  }, [statusFilter, categoryFilter, priorityFilter, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const loadDetails = async () => {
      if (!viewingReport) {
        setReportAuditTrail([]);
        setLinkedConversations([]);
        setDetailError(null);
        return;
      }

      setDetailLoading(true);
      setDetailError(null);

      try {
        const [auditResponse, conversationResponse] = await Promise.all([
          reportsService.getReportAuditEvents(viewingReport.id, { maxPages: 5, pageSize: 20 }),
          reportsService.getReportLinkedConversations(viewingReport.id, { maxPages: 5, pageSize: 20 }),
        ]);

        if (auditResponse.success && auditResponse.data) {
          setReportAuditTrail(auditResponse.data);
        } else {
          setDetailError(auditResponse.error || "Failed to load audit trail");
        }

        if (conversationResponse.success && conversationResponse.data) {
          setLinkedConversations(conversationResponse.data);
        } else if (!detailError) {
          setDetailError(conversationResponse.error || "Failed to load linked conversations");
        }
      } catch {
        setDetailError("Failed to load report details");
      } finally {
        setDetailLoading(false);
      }
    };

    loadDetails();
  }, [viewingReport]);

  // derived stats
  const stats = {
    total:      reports.length,
    new:        reports.filter(r => r.status === "NEW").length,
    inProgress: reports.filter(r => r.status === "IN_PROGRESS" || r.status === "IN_REVIEW").length,
    resolved:   reports.filter(r => r.status === "RESOLVED" || r.status === "CLOSED").length,
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setFErrors({}); setModal(true); };
  const openEdit   = (r: Report) => {
    setEditing(r);
    setForm({ title: r.title, description: r.description || "", category: r.category,
      locationCode: r.locationCode, priority: r.priority, status: r.status,
    });
    setMediaItems((r.mediaUrls || []).map((url) => ({
      url,
      name: url.split("/").pop() || url,
    })));
    setFErrors({}); setModal(true);
  };
  const closeModal = () => { setModal(false); setEditing(null); setForm(emptyForm()); setMediaItems([]); setFErrors({}); };

  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setUploadingMedia(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const response = await uploadsService.uploadReportMedia(file, editingReport?.id);
        if (!response.success || !response.data) {
          setError(response.error || `Failed to upload ${file.name}`);
          continue;
        }

        const data = response.data;
        setMediaItems((current) => [
          ...current,
          {
            key: data.key,
            url: data.url,
            name: data.originalFileName || file.name,
          },
        ]);
      }
    } finally {
      setUploadingMedia(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.locationCode.trim()) e.locationCode = "Location code is required";
    setFErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editingReport) {
        const mediaKeys = mediaItems.length > 0 && mediaItems.every((item) => item.key)
          ? mediaItems.map((item) => item.key as string)
          : undefined;
        const mediaUrls = !mediaKeys && mediaItems.length > 0
          ? mediaItems.map((item) => item.url)
          : undefined;

        // Update fields
        const updateData: UpdateReportRequest = {
          title: form.title, description: form.description || undefined,
          category: form.category, locationCode: form.locationCode, priority: form.priority,
          mediaKeys,
          mediaUrls,
        };
        const res = await reportsService.updateReport(editingReport.id, updateData);
        // Update status separately if changed
        if (res.success && form.status !== editingReport.status) {
          await reportsService.updateStatus(editingReport.id, form.status);
        }
        if (res.success) { await load(); closeModal(); }
        else setError(res.error || "Update failed");
      } else {
        const mediaKeys = mediaItems.length > 0 && mediaItems.every((item) => item.key)
          ? mediaItems.map((item) => item.key as string)
          : undefined;
        const mediaUrls = !mediaKeys && mediaItems.length > 0
          ? mediaItems.map((item) => item.url)
          : undefined;

        const createData: CreateReportRequest = {
          title: form.title, description: form.description || undefined,
          category: form.category, locationCode: form.locationCode, priority: form.priority,
          mediaKeys,
          mediaUrls,
        };
        const res = await reportsService.createReport(createData);
        if (res.success) { await load(); closeModal(); }
        else setError(res.error || "Create failed");
      }
    } catch { setError("Something went wrong"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const res = await reportsService.deleteReport(id);
    if (res.success) { setReports(rs => rs.filter(r => r.id !== id)); setDelConf(null); }
    else setError(res.error || "Delete failed");
  };

  const handleStatusChange = async (report: Report, status: ReportStatus) => {
    const res = await reportsService.updateStatus(report.id, status);
    if (res.success && res.data) setReports(rs => rs.map(r => r.id === report.id ? { ...r, ...res.data } : r));
    else setError(res.error || "Status update failed");
  };

  return (
    <>
      <PageMeta title="Reports" description="Manage citizen incident reports" />
      <PageBreadCrumb pageTitle="Reports" />

      <div className="space-y-5">
        {/* stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Reports", value: stats.total,      color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-900/10" },
            { label: "New",           value: stats.new,        color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-900/10" },
            { label: "In Progress",   value: stats.inProgress, color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-900/10" },
            { label: "Resolved",      value: stats.resolved,   color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/10" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-2xl border border-gray-200 dark:border-gray-800 px-4 py-3`}>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${color}`}>{loading ? "—" : value}</p>
            </div>
          ))}
        </div>

        {/* main card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          {/* toolbar */}
          <div className="px-5 py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Incident Reports</h3>
              <p className="text-xs text-gray-400 mt-0.5">{loading ? "Loading…" : `${reports.length} reports`}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* search */}
              <div className="relative flex-1 min-w-[160px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input type="text" placeholder="Search reports…" value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all" />
              </div>
              {/* filters */}
              <NativeSelect value={statusFilter} onChange={v => setStatus(v as any)}>
                <option value="">All Status</option>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </NativeSelect>
              <NativeSelect value={categoryFilter} onChange={v => setCat(v as any)}>
                <option value="">All Categories</option>
                {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>)}
              </NativeSelect>
              <NativeSelect value={priorityFilter} onChange={v => setPri(v as any)}>
                <option value="">All Priorities</option>
                {ALL_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
              </NativeSelect>
              <button onClick={openCreate}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                New Report
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
              <p className="text-sm text-gray-400">Loading reports…</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl">📋</div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No reports found</p>
              <button onClick={openCreate} className="text-xs text-blue-600 hover:underline">+ Submit first report</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    {["Report", "Category", "Location", "Priority", "Status", "Date", ""].map(h => (
                      <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                  {reports.map(report => {
                    const status   = STATUS_CONFIG[report.status]   ?? { label: report.status,   dot: "bg-gray-400", badge: "bg-gray-100 text-gray-600" };
                    const priority = PRIORITY_CONFIG[report.priority] ?? { label: report.priority, badge: "bg-gray-100 text-gray-600" };
                    const category = CATEGORY_CONFIG[report.category] ?? { label: report.category, icon: "📋" };
                    return (
                      <tr key={report.id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02] transition-colors group">
                        <td className="px-5 py-3.5 max-w-[200px]">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">{report.title}</p>
                          {report.description && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">{report.description}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                            <span>{category.icon}</span>{category.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{report.locationCode}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priority.badge}`}>
                            {priority.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {/* inline status changer */}
                          <NativeSelect
                            value={report.status}
                            onChange={v => handleStatusChange(report, v as ReportStatus)}
                            className="text-xs py-1 px-2 rounded-full border-0 font-medium cursor-pointer"
                          >
                            {ALL_STATUSES.map(s => (
                              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                            ))}
                          </NativeSelect>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(report.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setViewing(report)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="View">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            </button>
                            <button onClick={() => openEdit(report)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title="Edit">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button onClick={() => setDelConf(report.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{editingReport ? "Edit Report" : "New Report"}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editingReport ? "Update report details" : "Submit a new incident report"}</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <Field label="Title" required error={formErrors.title}>
                <TInput value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Brief description of the issue" error={formErrors.title}/>
              </Field>

              <Field label="Description">
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="Provide more details about the incident…" rows={3}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all resize-none"/>
              </Field>

              <Field label="Images">
                <div className="space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => void handleMediaUpload(event.target.files)}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
                  />
                  {uploadingMedia && <p className="text-xs text-gray-400">Uploading images...</p>}
                  {mediaItems.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {mediaItems.map((item) => (
                        <div key={`${item.key || item.url}`} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                          <img src={item.url} alt={item.name} className="h-32 w-full object-cover" />
                          <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 break-all">{item.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Category" required>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value as ReportCategory})}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all">
                    {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_CONFIG[c].icon} {CATEGORY_CONFIG[c].label}</option>)}
                  </select>
                </Field>

                <Field label="Priority" required>
                  <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value as ReportPriority})}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all">
                    {ALL_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Location Code" required error={formErrors.locationCode}>
                <TInput value={form.locationCode} onChange={e => setForm({...form, locationCode: e.target.value})} placeholder="VN-HCM-BQ1-P01" error={formErrors.locationCode}/>
              </Field>

              {editingReport && (
                <Field label="Status">
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value as ReportStatus})}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all">
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                  </select>
                </Field>
              )}
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <button onClick={closeModal} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {saving ? "Saving…" : editingReport ? "Save Changes" : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── View Modal ── */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setViewing(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Report Details</h2>
              <button onClick={() => setViewing(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 space-y-6 max-h-[calc(90vh-72px)]">
              {detailError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
                  {detailError}
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Title</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{viewingReport.title}</p>
                  </div>
                  {viewingReport.description && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Description</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{viewingReport.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Category</p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">
                        {CATEGORY_CONFIG[viewingReport.category]?.icon} {CATEGORY_CONFIG[viewingReport.category]?.label ?? viewingReport.category}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Priority</p>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_CONFIG[viewingReport.priority]?.badge ?? "bg-gray-100 text-gray-600"}`}>
                        {PRIORITY_CONFIG[viewingReport.priority]?.label ?? viewingReport.priority}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Status</p>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[viewingReport.status]?.badge ?? "bg-gray-100 text-gray-600"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[viewingReport.status]?.dot ?? "bg-gray-400"}`}/>
                        {STATUS_CONFIG[viewingReport.status]?.label ?? viewingReport.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Location</p>
                      <p className="text-sm font-mono text-gray-600 dark:text-gray-300">{viewingReport.locationCode}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-400">
                    <span>Created {new Date(viewingReport.createdAt).toLocaleString("en-GB")}</span>
                    {viewingReport.assignedOfficerId && <span>Assigned to: {viewingReport.assignedOfficerId}</span>}
                  </div>
                </div>

                <div className="space-y-4">
                  {!!(viewingReport.mediaAssets?.length || viewingReport.mediaUrls?.length) && (
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Images</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {/* Render mediaAssets with resolved URLs first */}
                        {viewingReport.mediaAssets?.map((asset) => (
                          <div key={asset.key} className="group overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30">
                            {asset.resolvedUrl ? (
                              <>
                                <img src={asset.resolvedUrl} alt={asset.fileName || viewingReport.title} className="h-40 w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                                <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 break-all">{asset.fileName || asset.key}</div>
                              </>
                            ) : (
                              <div className="h-40 w-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                                <span className="text-xs text-gray-400">No URL available</span>
                              </div>
                            )}
                          </div>
                        ))}
                        {/* Fallback to mediaUrls for legacy images */}
                        {(!viewingReport.mediaAssets || viewingReport.mediaAssets.length === 0) && viewingReport.mediaUrls?.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30">
                            <img src={url} alt={viewingReport.title} className="h-40 w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23e5e7eb%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2212%22 fill=%22%239ca3af%22 text-anchor=%22middle%22 dy=%22.3em%22%3EImage not found%3C/text%3E%3C/svg%3E'; }} />
                            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 break-all">{url}</div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Linked Conversations</h3>
                      {detailLoading && <span className="text-xs text-gray-400">Loading...</span>}
                    </div>
                    {linkedConversations.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No linked conversations</p>
                    ) : (
                      <div className="space-y-2">
                        {linkedConversations.map((link) => (
                          <div key={link.groupId} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/30">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{link.conversationId}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Group: {link.groupId}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Linked by {link.linkedByUserId}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Audit Trail</h3>
                      {detailLoading && <span className="text-xs text-gray-400">Loading...</span>}
                    </div>
                    {reportAuditTrail.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No audit events</p>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {reportAuditTrail.map((event) => (
                          <div key={event.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/30">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{event.action}</p>
                              <span className="text-xs text-gray-400">{new Date(event.occurredAt).toLocaleString("en-GB")}</span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Actor: {event.actorUserId}</p>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{event.summary}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => { setViewing(null); openEdit(viewingReport); }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
                Edit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-100 dark:border-gray-800">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 className="text-center font-semibold text-gray-900 dark:text-white mb-1">Delete Report</h3>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-5">This will soft-delete the report. It cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDelConf(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Reports;