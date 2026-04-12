export function ReportsPage() {
  return (
    <div className="p-8 w-full bg-slate-50 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Quản lý Báo Cáo</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          + Tạo báo cáo mới
        </button>
      </div>

      {/* Grid Placeholder */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-100 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-6 py-4 rounded-tl-lg">ID</th>
                <th scope="col" className="px-6 py-4">Chủ đề</th>
                <th scope="col" className="px-6 py-4">Trạng thái</th>
                <th scope="col" className="px-6 py-4">Ngày tạo</th>
                <th scope="col" className="px-6 py-4 rounded-tr-lg">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="bg-white border-b hover:bg-gray-50 last:border-0 transition">
                  <td className="px-6 py-4 font-medium text-gray-900">#RP-{1000 + i}</td>
                  <td className="px-6 py-4">Vấn đề chiếu sáng khu phố {i}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
                      Chờ xử lý
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">12/04/2026</td>
                  <td className="px-6 py-4">
                    <button className="text-blue-600 hover:underline">Chi tiết</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
