/**
 * Dashboard Heatmap Page
 * Visual representation of issues on a geographic heatmap
 */

import React from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { useI18n } from "../../i18n/I18nContext";

const DashboardHeatmap: React.FC = () => {
  const { t } = useI18n();

  return (
    <>
      <PageMeta title={t("dashboardHeatmap.title")} description={t("dashboardHeatmap.description")} />
      <PageBreadCrumb pageTitle={t("dashboardHeatmap.title")} />

      <ComponentCard title={t("dashboardHeatmap.cardTitle")}>
        <div className="h-96 bg-gradient-to-r from-blue-100 via-green-100 to-red-100 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 mb-2">{t("dashboardHeatmap.panelTitle")}</p>
            <p className="text-sm text-gray-500">
              {t("dashboardHeatmap.panelDescription")}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="p-4 border rounded">
            <p className="text-sm text-gray-600">{t("dashboardHeatmap.totalReports")}</p>
            <p className="text-2xl font-bold text-red-600">1,234</p>
          </div>
          <div className="p-4 border rounded">
            <p className="text-sm text-gray-600">{t("dashboardHeatmap.inProgress")}</p>
            <p className="text-2xl font-bold text-yellow-600">156</p>
          </div>
          <div className="p-4 border rounded">
            <p className="text-sm text-gray-600">{t("dashboardHeatmap.resolved")}</p>
            <p className="text-2xl font-bold text-green-600">1,078</p>
          </div>
        </div>
      </ComponentCard>
    </>
  );
};

export default DashboardHeatmap;
