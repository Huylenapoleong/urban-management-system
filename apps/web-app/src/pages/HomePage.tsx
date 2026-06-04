import { getGroups } from "@/services/group.api";
import { getReports } from "@/services/report.api";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircle,
  Shield,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

type HomeReport = Awaited<ReturnType<typeof getReports>>[number];
type HomeGroup = Awaited<ReturnType<typeof getGroups>>[number];

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
  const pendingReports = (reports ?? []).filter(
    (report: HomeReport) => report.status === "PENDING",
  ).length;
  const resolvedReports = (reports ?? []).filter(
    (report: HomeReport) => report.status === "RESOLVED",
  ).length;
  const totalGroups = groups?.length ?? 0;

  return (
    <div className="container mx-auto p-4 max-w-5xl space-y-8 relative overflow-hidden animate-fade-in pb-12">
      {/* Decorative blurred background glows */}
      <div className="absolute top-10 right-10 w-72 h-72 rounded-full bg-violet-500/5 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-80 h-80 rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none" />

      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 z-10 relative">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 dark:from-white dark:to-slate-300">
            Trang chủ
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">
            Tổng quan hoạt động và thông báo mới nhất từ hệ thống.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/reports/new"
            className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-red-500/15 transition-all duration-300 active:scale-95"
          >
            <AlertTriangle className="w-4 h-4" />
            Báo cáo sự cố
          </Link>
          <Link
            to="/groups"
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-violet-500/15 transition-all duration-300 active:scale-95"
          >
            <Shield className="w-4 h-4" />
            Khám phá Nhóm
          </Link>
        </div>
      </header>

      {/* Grid Overview Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 z-10 relative">
        {/* Card 1: Total Reports */}
        <div className="glass-card rounded-2xl p-5 premium-shadow hover:shadow-md transition-all duration-300 border-l-4 border-l-violet-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Tổng báo cáo
          </p>
          <p className="mt-2.5 text-3xl font-extrabold text-slate-900 dark:text-white">
            {totalReports}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <AlertTriangle className="h-3.5 w-3.5 text-violet-500" />
            Dữ liệu hệ thống mới nhất
          </div>
        </div>

        {/* Card 2: Pending Reports */}
        <div className="glass-card rounded-2xl p-5 premium-shadow hover:shadow-md transition-all duration-300 border-l-4 border-l-amber-500 bg-amber-500/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Đang chờ xử lý
          </p>
          <p className="mt-2.5 text-3xl font-extrabold text-amber-700 dark:text-amber-300">
            {pendingReports}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <Clock3 className="h-3.5 w-3.5 text-amber-500" />
            Cần ưu tiên theo dõi
          </div>
        </div>

        {/* Card 3: Resolved Reports */}
        <div className="glass-card rounded-2xl p-5 premium-shadow hover:shadow-md transition-all duration-300 border-l-4 border-l-emerald-500 bg-emerald-500/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Đã xử lý
          </p>
          <p className="mt-2.5 text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">
            {resolvedReports}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Hoàn thành tích cực
          </div>
        </div>

        {/* Card 4: Active Groups */}
        <div className="glass-card rounded-2xl p-5 premium-shadow hover:shadow-md transition-all duration-300 border-l-4 border-l-blue-500 bg-blue-500/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Nhóm đang tham gia
          </p>
          <p className="mt-2.5 text-3xl font-extrabold text-blue-700 dark:text-blue-300">
            {totalGroups}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
            <Users className="h-3.5 w-3.5 text-blue-500" />
            Kết nối cộng đồng địa bàn
          </div>
        </div>
      </section>

      {/* Quick Action Grid */}
      <section className="glass-card rounded-2xl p-6 premium-shadow z-10 relative">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Thao tác nhanh
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Truy cập nhanh các tính năng cốt lõi
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to="/reports/new"
            className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/50 dark:bg-red-950/10 p-4 transition-all duration-300 premium-hover-card hover:bg-red-100/50 dark:border-red-900/20 dark:hover:bg-red-950/20"
          >
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold text-red-700 dark:text-red-400">
              Tạo báo cáo sự cố
            </span>
          </Link>
          <Link
            to="/groups"
            className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 dark:bg-blue-950/10 p-4 transition-all duration-300 premium-hover-card hover:bg-blue-100/50 dark:border-blue-900/20 dark:hover:bg-blue-950/20"
          >
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <Shield className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
              Khám phá nhóm
            </span>
          </Link>
          <Link
            to="/chat"
            className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/10 p-4 transition-all duration-300 premium-hover-card hover:bg-emerald-100/50 dark:border-emerald-900/20 dark:hover:bg-emerald-950/20"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <MessageCircle className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Mở trò chuyện
            </span>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 z-10 relative">
        {/* Reports Section */}
        <section className="glass-card rounded-2xl premium-shadow p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2.5 text-slate-900 dark:text-white">
              <div className="p-1.5 rounded-lg bg-red-500/10 text-red-500">
                <AlertTriangle className="w-4 h-4" />
              </div>
              Sự cố gần đây
            </h2>
            <Link
              to="/reports"
              className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
              Xem tất cả
            </Link>
          </div>
          {isLoadingReports ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          ) : reports && reports.length > 0 ? (
            <ul className="space-y-3">
              {reports.slice(0, 3).map((r: HomeReport) => (
                <li
                  key={r.id}
                  className="flex p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100/50 dark:border-slate-800/40 hover:bg-slate-100/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {r.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {r.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-10 text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              Không có báo cáo nào gần đây.
            </div>
          )}
        </section>

        {/* Groups Section */}
        <section className="glass-card rounded-2xl premium-shadow p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2.5 text-slate-900 dark:text-white">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                <Shield className="w-4 h-4" />
              </div>
              Nhóm của bạn
            </h2>
            <Link
              to="/groups"
              className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
              Quản lý
            </Link>
          </div>
          {isLoadingGroups ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          ) : groups && groups.length > 0 ? (
            <ul className="space-y-3">
              {groups.slice(0, 3).map((g: HomeGroup) => (
                <li
                  key={g.id}
                  className="flex p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100/50 dark:border-slate-800/40 hover:bg-slate-100/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {g.groupName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {g.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-10 text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              Bạn chưa tham gia nhóm nào.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
