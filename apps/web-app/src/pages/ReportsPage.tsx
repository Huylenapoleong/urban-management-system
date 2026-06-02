import { getReports } from "@/services/report.api";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, FileText, Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type SortOrder = "newest" | "oldest";
type ReportRecord = Awaited<ReturnType<typeof getReports>>[number];

export function ReportsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchText, setSearchText] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: getReports,
  });

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredReports = useMemo(() => {
    const source = reports ?? [];

    const byStatus =
      statusFilter === "ALL"
        ? source
        : source.filter(
            (report: ReportRecord) => report.status === statusFilter,
          );

    const bySearch = normalizedSearch
      ? byStatus.filter((report: ReportRecord) => {
          const haystack = [report.title, report.description, report.status]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedSearch);
        })
      : byStatus;

    const sorted = [...bySearch].sort((a: ReportRecord, b: ReportRecord) => {
      const left = new Date(a.createdAt).getTime();
      const right = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? right - left : left - right;
    });

    return sorted;
  }, [reports, statusFilter, normalizedSearch, sortOrder]);

  if (isLoading) {
    return (
      <div className="flex justify-center flex-1 items-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-5xl space-y-6 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          Quản lý Báo Cáo
        </h1>
        <Link
          to="/reports/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer flex items-center gap-2 justify-center w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Tạo báo cáo mới
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Tìm theo tiêu đề hoặc mô tả..."
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PENDING">PENDING</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="RESOLVED">RESOLVED</option>
          </select>

          <button
            type="button"
            onClick={() =>
              setSortOrder((prev) => (prev === "newest" ? "oldest" : "newest"))
            }
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
          >
            <ArrowUpDown className="h-4 w-4" />
            {sortOrder === "newest" ? "Mới nhất trước" : "Cũ nhất trước"}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Hiển thị {filteredReports.length} / {reports?.length ?? 0} báo cáo.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm text-left">
            <thead className="text-xs text-gray-500 dark:text-slate-300 uppercase bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th scope="col" className="px-6 py-4">
                  Chủ đề
                </th>
                <th scope="col" className="px-6 py-4">
                  Mô tả
                </th>
                <th scope="col" className="px-6 py-4">
                  Trạng thái
                </th>
                <th scope="col" className="px-6 py-4">
                  Ngày tạo
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report: ReportRecord) => (
                <tr
                  key={report.id}
                  className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 last:border-0 transition"
                >
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-slate-100">
                    {report.title}
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-slate-300 max-w-[200px] truncate">
                    {report.description}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        report.status === "PENDING"
                          ? "bg-amber-100 text-amber-800"
                          : report.status === "RESOLVED"
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-slate-300">
                    {new Date(report.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                </tr>
              ))}
              {filteredReports.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-gray-500 dark:text-slate-300"
                  >
                    {reports && reports.length > 0
                      ? "Không có báo cáo phù hợp bộ lọc hiện tại"
                      : "Chưa có báo cáo nào"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
