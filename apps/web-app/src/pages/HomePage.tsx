import { useQuery } from "@tanstack/react-query";
import { Loader2, Shield, AlertTriangle } from "lucide-react";
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