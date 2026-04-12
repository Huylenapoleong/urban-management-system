import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { getReports } from "@/services/report.api";

export function ReportsPage() {
  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: getReports,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center flex-1 items-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-5xl space-y-6">
       <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          Quản lý Báo Cáo
        </h1>
        <Link 
          to="/reports/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Tạo báo cáo mới
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-100 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-6 py-4">Chủ đề</th>
                <th scope="col" className="px-6 py-4">Mô tả</th>
                <th scope="col" className="px-6 py-4">Trạng thái</th>
                <th scope="col" className="px-6 py-4">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {reports?.map((report: any) => (
                <tr key={report.id} className="bg-white border-b hover:bg-gray-50 last:border-0 transition">
                  <td className="px-6 py-4 font-medium text-gray-900">{report.title}</td>
                  <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate">{report.description}</td>
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
                     {new Date(report.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                </tr>
              ))}
              {reports?.length === 0 && (
                <tr>
                   <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      Chưa có báo cáo nào
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
