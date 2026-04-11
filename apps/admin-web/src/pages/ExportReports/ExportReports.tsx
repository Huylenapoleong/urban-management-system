import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useI18n } from "../../i18n/I18nContext";
import {
  Report,
  ReportCategory,
  ReportPriority,
  ReportStatus,
  reportsService,
} from "../../services/reports.service";

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Report[]) {
  const headers = [
    "id",
    "title",
    "category",
    "priority",
    "status",
    "locationCode",
    "userId",
    "assignedOfficerId",
    "createdAt",
    "updatedAt",
  ];

  const escapeCsv = (value: unknown) => {
    const raw = value == null ? "" : String(value);
    const escaped = raw.replace(/\"/g, '""');
    return `"${escaped}"`;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.title,
        r.category,
        r.priority,
        r.status,
        r.locationCode,
        r.userId,
        r.assignedOfficerId || "",
        r.createdAt,
        r.updatedAt,
      ]
        .map(escapeCsv)
        .join(",")
    ),
  ];

  return lines.join("\n");
}

function toExcel(rows: Report[]) {
  const table = rows.map((r) => ({
    ID: r.id,
    Title: r.title,
    Category: r.category,
    Priority: r.priority,
    Status: r.status,
    LocationCode: r.locationCode,
    UserId: r.userId,
    AssignedOfficerId: r.assignedOfficerId || "",
    CreatedAt: r.createdAt,
    UpdatedAt: r.updatedAt,
  }));

  const worksheet = XLSX.utils.json_to_sheet(table);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reports");
  XLSX.writeFile(workbook, `reports-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function toPdf(rows: Report[], filters: Record<string, string>, locale: string, translate: (key: string) => string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 30;
  let y = 40;

  doc.setFontSize(14);
  doc.text(translate("exportReports.exportTitle"), margin, y);
  y += 18;
  doc.setFontSize(10);
  doc.text(`${translate("exportReports.generatedAt")}: ${new Date().toLocaleString(locale)}`, margin, y);
  y += 14;
  doc.text(`${translate("exportReports.filters")}: ${JSON.stringify(filters)}`, margin, y);
  y += 20;

  doc.setFontSize(9);
  doc.text(translate("exportReports.table.id"), margin, y);
  doc.text(translate("exportReports.table.title"), margin + 95, y);
  doc.text(translate("exportReports.table.category"), margin + 300, y);
  doc.text(translate("exportReports.table.priority"), margin + 390, y);
  doc.text(translate("exportReports.table.status"), margin + 455, y);
  doc.text(translate("exportReports.table.created"), margin + 520, y);
  y += 10;
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;

  rows.slice(0, 120).forEach((row) => {
    if (y > 555) {
      doc.addPage();
      y = 40;
    }

    doc.text(row.id.slice(0, 16), margin, y);
    doc.text(row.title.slice(0, 34), margin + 95, y);
    doc.text(row.category, margin + 300, y);
    doc.text(row.priority, margin + 390, y);
    doc.text(row.status, margin + 455, y);
    doc.text(new Date(row.createdAt).toLocaleDateString(locale), margin + 520, y);
    y += 12;
  });

  doc.save(`reports-export-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function ExportReports() {
  const { t, language } = useI18n();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ReportStatus | "">("");
  const [priority, setPriority] = useState<ReportPriority | "">("");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const locale = language === "vi" ? "vi-VN" : "en-GB";

  const statusOptions = useMemo(
    () => [
      { value: "", label: t("exportReports.allStatuses") },
      { value: "NEW", label: t("exportReports.statuses.NEW") },
      { value: "IN_REVIEW", label: t("exportReports.statuses.IN_REVIEW") },
      { value: "IN_PROGRESS", label: t("exportReports.statuses.IN_PROGRESS") },
      { value: "RESOLVED", label: t("exportReports.statuses.RESOLVED") },
      { value: "CLOSED", label: t("exportReports.statuses.CLOSED") },
      { value: "REJECTED", label: t("exportReports.statuses.REJECTED") },
    ],
    [t]
  );

  const priorityOptions = useMemo(
    () => [
      { value: "", label: t("exportReports.allPriorities") },
      { value: "LOW", label: t("exportReports.priorities.LOW") },
      { value: "MEDIUM", label: t("exportReports.priorities.MEDIUM") },
      { value: "HIGH", label: t("exportReports.priorities.HIGH") },
      { value: "URGENT", label: t("exportReports.priorities.URGENT") },
    ],
    [t]
  );

  const categoryOptions = useMemo(
    () => [
      { value: "", label: t("exportReports.allCategories") },
      { value: "INFRASTRUCTURE", label: t("exportReports.categories.INFRASTRUCTURE") },
      { value: "TRAFFIC", label: t("exportReports.categories.TRAFFIC") },
      { value: "ENVIRONMENT", label: t("exportReports.categories.ENVIRONMENT") },
      { value: "SECURITY", label: t("exportReports.categories.SECURITY") },
      { value: "PUBLIC_ORDER", label: t("exportReports.categories.PUBLIC_ORDER") },
      { value: "PUBLIC_SERVICES", label: t("exportReports.categories.PUBLIC_SERVICES") },
    ],
    [t]
  );

  const statusLabel = (value: ReportStatus | "") => {
    if (!value) return t("exportReports.allStatuses");
    const match = statusOptions.find((item) => item.value === value);
    return match?.label ?? value;
  };

  const priorityLabel = (value: ReportPriority | "") => {
    if (!value) return t("exportReports.allPriorities");
    const match = priorityOptions.find((item) => item.value === value);
    return match?.label ?? value;
  };

  const categoryLabel = (value: ReportCategory | "") => {
    if (!value) return t("exportReports.allCategories");
    const match = categoryOptions.find((item) => item.value === value);
    return match?.label ?? value;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await reportsService.getReports(1, 300);
        if (response.success && response.data) {
          setReports(response.data.items);
        } else {
          setError(response.error || t("exportReports.error"));
        }
      } catch {
        setError(t("exportReports.error"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (status && r.status !== status) return false;
      if (priority && r.priority !== priority) return false;
      if (category && r.category !== category) return false;

      if (fromDate) {
        const from = new Date(fromDate).getTime();
        if (new Date(r.createdAt).getTime() < from) return false;
      }

      if (toDate) {
        const to = new Date(`${toDate}T23:59:59`).getTime();
        if (new Date(r.createdAt).getTime() > to) return false;
      }

      if (search) {
        const q = search.toLowerCase();
        const text = `${r.title} ${r.description || ""} ${r.id}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [reports, status, priority, category, fromDate, toDate, search]);

  const exportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      total: filtered.length,
      filters: { status, priority, category, fromDate, toDate, search },
      items: filtered,
    };

    downloadFile(
      JSON.stringify(payload, null, 2),
      `reports-export-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json;charset=utf-8"
    );
  };

  const exportCsv = () => {
    const csv = toCsv(filtered);
    downloadFile(
      csv,
      `reports-export-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv;charset=utf-8"
    );
  };

  const exportExcel = () => {
    toExcel(filtered);
  };

  const exportPdf = () => {
    toPdf(
      filtered,
      {
        status: statusLabel(status),
        priority: priorityLabel(priority),
        category: categoryLabel(category),
        fromDate: fromDate || "N/A",
        toDate: toDate || "N/A",
        search: search || "N/A",
      },
      locale,
      t
    );
  };

  return (
    <>
      <PageMeta title={t("exportReports.title")} description={t("exportReports.description")} />
      <PageBreadCrumb pageTitle={t("exportReports.title")} />

      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("exportReports.filterReports")}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t("exportReports.filterHelper")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("exportReports.searchPlaceholder")}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white"
            />

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ReportStatus | "")}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white"
            >
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as ReportPriority | "")}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white"
            >
              {priorityOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory | "")}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white"
            >
              {categoryOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label={t("exportReports.fromDate")}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white"
            />

            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label={t("exportReports.toDate")}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={loading || filtered.length === 0}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("exportReports.exportCsv")} ({filtered.length})
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={loading || filtered.length === 0}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("exportReports.exportExcel")} ({filtered.length})
            </button>
            <button
              type="button"
              onClick={exportJson}
              disabled={loading || filtered.length === 0}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("exportReports.exportJson")} ({filtered.length})
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={loading || filtered.length === 0}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("exportReports.exportPdf")} ({filtered.length})
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("exportReports.preview")}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("exportReports.showing")} {Math.min(filtered.length, 15)} / {filtered.length}
            </p>
          </div>

          {error ? (
            <div className="p-5 text-sm text-red-600 dark:text-red-400">{error}</div>
          ) : loading ? (
            <div className="p-8 text-sm text-gray-500 dark:text-gray-400">{t("exportReports.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-sm text-gray-500 dark:text-gray-400">{t("exportReports.noResults")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/40">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("exportReports.table.id")}</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("exportReports.table.title")}</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("exportReports.table.category")}</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("exportReports.table.priority")}</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("exportReports.table.status")}</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("exportReports.table.created")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/70">
                  {filtered.slice(0, 15).map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{r.id}</td>
                      <td className="px-5 py-3 text-gray-900 dark:text-white font-medium">{r.title}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{categoryLabel(r.category)}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{priorityLabel(r.priority)}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{statusLabel(r.status)}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300">
                        {new Date(r.createdAt).toLocaleString(locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
