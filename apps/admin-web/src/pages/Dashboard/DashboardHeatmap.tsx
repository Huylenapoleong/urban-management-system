/**
 * Dashboard Heatmap Page
 * Visual representation of issues on a geographic heatmap
 */

import React from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";

const DashboardHeatmap: React.FC = () => {
  return (
    <>
      <PageMeta title="Bản đồ Nhiệt" description="Hiển thị bản đồ nhiệt của các sự cố" />
      <PageBreadCrumb pageTitle="Bản đồ Nhiệt" />

      <ComponentCard title="Bản đồ Nhiệt Sự cố">
        <div className="h-96 bg-gradient-to-r from-blue-100 via-green-100 to-red-100 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 mb-2">Bản đồ nhiệt (Heatmap)</p>
            <p className="text-sm text-gray-500">
              Tích hợp React-Leaflet/Mapbox - Hiển thị dữ liệu GPS từ sự cố
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="p-4 border rounded">
            <p className="text-sm text-gray-600">Tổng sự cố</p>
            <p className="text-2xl font-bold text-red-600">1,234</p>
          </div>
          <div className="p-4 border rounded">
            <p className="text-sm text-gray-600">Đang xử lý</p>
            <p className="text-2xl font-bold text-yellow-600">156</p>
          </div>
          <div className="p-4 border rounded">
            <p className="text-sm text-gray-600">Đã giải quyết</p>
            <p className="text-2xl font-bold text-green-600">1,078</p>
          </div>
        </div>
      </ComponentCard>
    </>
  );
};

export default DashboardHeatmap;
