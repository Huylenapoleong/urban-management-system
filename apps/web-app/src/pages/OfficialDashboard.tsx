import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, KanbanSquare, CheckCircle, Clock } from "lucide-react";
import { getAllReports, updateReportStatus } from "@/services/report.api";
import { toast } from "react-hot-toast";

export default function OfficialDashboard() {
  const queryClient = useQueryClient();
  
  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports", "all"],
    queryFn: getAllReports,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateReportStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", "all"] });
      toast.success("Cập nhật trạng thái thành công");
    },
    onError: () => toast.error("Cập nhật thất bại"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const pending = reports?.filter((r: any) => r.status === "PENDING") || [];
  const processing = reports?.filter((r: any) => r.status === "PROCESSING") || [];
  const resolved = reports?.filter((r: any) => r.status === "RESOLVED") || [];

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
          Dashboard Cán Bộ Quản Lý
        </h1>
        <p className="text-gray-500 mt-2">Tổng quan các phản ánh và báo cáo từ người dân.</p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-xl border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-800 rounded-full">
               <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400 uppercase">Chờ xử lý</p>
              <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{pending.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-800 rounded-full">
               <KanbanSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase">Đang xử lý</p>
              <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{processing.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-xl border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-800 rounded-full">
               <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400 uppercase">Đã giải quyết</p>
              <p className="text-3xl font-bold text-green-700 dark:text-green-300">{resolved.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mt-8 overflow-hidden">
         <div className="p-6 border-b border-gray-100 dark:border-gray-700">
             <h2 className="text-xl font-bold">Danh sách cần duyệt</h2>
         </div>
         <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-4">Sự cố</th>
                <th className="px-6 py-4">Khu vực</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Cập nhật lúc</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
               {reports?.map((report: any) => (
                  <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                     <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{report.title}</p>
                        <p className="text-gray-500 truncate max-w-xs">{report.description}</p>
                     </td>
                     <td className="px-6 py-4 font-mono text-xs">{report.locationCode}</td>
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
                     <td className="px-6 py-4 text-gray-500">
                         {new Date(report.updatedAt || report.createdAt).toLocaleDateString("vi-VN")}
                     </td>
                     <td className="px-6 py-4 text-right space-x-2">
                        {report.status === "PENDING" && (
                           <button 
                             onClick={() => updateStatusMutation.mutate({ id: report.id, status: "PROCESSING" })}
                             className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition"
                           >
                             Nhận xử lý
                           </button>
                        )}
                        {report.status === "PROCESSING" && (
                           <button 
                             onClick={() => updateStatusMutation.mutate({ id: report.id, status: "RESOLVED" })}
                             className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded-lg transition"
                           >
                             Hoàn tất
                           </button>
                        )}
                     </td>
                  </tr>
               ))}
               {reports?.length === 0 && (
                 <tr>
                   <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                     Không có dữ liệu báo cáo.
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