import { useQuery } from "@tanstack/react-query";
import { Loader2, Shield, AlertTriangle, Users, CheckCircle2, Clock3, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { getReports } from "@/services/report.api";
import { getGroups } from "@/services/group.api";

export default function HomePage() {
  const { data: reports, isLoading: isLoadingReports } = useQuery({
    queryKey: ["reports"],
    queryFn: getReports,
  });

  const { data: groups, isLoading: isLoadingGroups } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
  });

  const totalReports = reports?.length ?? 0;
  const pendingReports = (reports ?? []).filter((report: any) => report.status === "PENDING").length;
  const resolvedReports = (reports ?? []).filter((report: any) => report.status === "RESOLVED").length;
  const totalGroups = groups?.length ?? 0;

  return (
    <div className="container mx-auto p-4 max-w-5xl space-y-8">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Trang chủ</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Tổng quan hoạt động và thông báo mới nhất.</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/reports/new"
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Báo cáo sự cố
          </Link>
          <Link
            to="/groups"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Shield className="w-4 h-4" />
            Khám phá Nhóm
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Tổng báo cáo</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{totalReports}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Cập nhật theo dữ liệu mới nhất
          </div>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Đang chờ xử lý</p>
          <p className="mt-2 text-2xl font-bold text-amber-800 dark:text-amber-200">{pendingReports}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <Clock3 className="h-3.5 w-3.5" />
            Cần ưu tiên theo dõi
          </div>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Đã xử lý</p>
          <p className="mt-2 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{resolvedReports}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Theo dõi tiến độ tích cực
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
          <p className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300">Nhóm đang tham gia</p>
          <p className="mt-2 text-2xl font-bold text-blue-800 dark:text-blue-200">{totalGroups}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
            <Users className="h-3.5 w-3.5" />
            Kết nối cộng đồng
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Thao tác nhanh</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Truy cập nhanh các luồng chính</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            to="/reports/new"
            className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 p-3 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/20 dark:hover:bg-red-950/30"
          >
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium text-red-700 dark:text-red-300">Tạo báo cáo sự cố</span>
          </Link>
          <Link
            to="/groups"
            className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/20 dark:hover:bg-blue-950/30"
          >
            <Shield className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Khám phá nhóm</span>
          </Link>
          <Link
            to="/chat"
            className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30"
          >
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Mở trò chuyện</span>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Reports Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2 dark:text-gray-100">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Sự cố gần đây
            </h2>
            <Link to="/reports" className="text-sm text-blue-600 hover:underline">
              Xem tất cả
            </Link>
          </div>
          {isLoadingReports ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : reports && reports.length > 0 ? (
            <ul className="space-y-4">
              {reports.slice(0, 3).map((r: any) => (
                <li key={r.id} className="flex p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{r.title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{r.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              Không có báo cáo nào gần đây.
            </div>
          )}
        </section>

        {/* Groups Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2 dark:text-gray-100">
              <Shield className="w-5 h-5 text-blue-500" />
              Nhóm của bạn
            </h2>
            <Link to="/groups" className="text-sm text-blue-600 hover:underline">
              Quản lý
            </Link>
          </div>
          {isLoadingGroups ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : groups && groups.length > 0 ? (
            <ul className="space-y-4">
              {groups.slice(0, 3).map((g: any) => (
                <li key={g.id} className="flex p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{g.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{g.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              Bạn chưa tham gia nhóm nào.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}