/**
 * Rankings/Performance Page
 * Display performance rankings for districts/wards
 */

import React, { useState } from "react";
import PageBreadCrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";

interface Ranking {
  rank: number;
  region: string;
  totalReports: number;
  resolved: number;
  avgResolutionTime: string;
  slaCompliance: number;
}

const Rankings: React.FC = () => {
  const [rankings] = useState<Ranking[]>([
    { rank: 1, region: "District 1", totalReports: 145, resolved: 142, avgResolutionTime: "2.5 days", slaCompliance: 97.9 },
    { rank: 2, region: "District 2", totalReports: 132, resolved: 128, avgResolutionTime: "2.8 days", slaCompliance: 96.9 },
    { rank: 3, region: "District 3", totalReports: 121, resolved: 115, avgResolutionTime: "3.2 days", slaCompliance: 95.0 },
    { rank: 4, region: "District 4", totalReports: 98, resolved: 90, avgResolutionTime: "3.8 days", slaCompliance: 91.8 },
    { rank: 5, region: "District 5", totalReports: 87, resolved: 78, avgResolutionTime: "4.1 days", slaCompliance: 89.7 },
  ]);

  const getMedalColor = (rank: number) => {
    if (rank === 1) return "bg-yellow-400 text-white shadow-yellow-200 shadow-md";
    if (rank === 2) return "bg-gray-400 text-white shadow-gray-200 shadow-md";
    if (rank === 3) return "bg-orange-500 text-white shadow-orange-200 shadow-md";
    return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  };

  const getSlaColor = (sla: number) => {
    if (sla >= 95) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (sla >= 90) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  };

  const getResolutionRate = (resolved: number, total: number) =>
    total > 0 ? Math.round((resolved / total) * 100) : 0;

  return (
    <>
      <PageMeta title="Performance Rankings" description="View incident resolution performance rankings by region" />
      <PageBreadCrumb pageTitle="Performance Rankings" />

      <div className="grid gap-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "Top Performer",
              value: rankings[0]?.region ?? "—",
              sub: `${rankings[0]?.slaCompliance}% SLA compliance`,
              color: "text-yellow-600",
              bg: "bg-yellow-50 dark:bg-yellow-900/10",
              icon: (
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ),
            },
            {
              label: "Avg SLA Compliance",
              value: `${(rankings.reduce((a, b) => a + b.slaCompliance, 0) / rankings.length).toFixed(1)}%`,
              sub: "Across all districts",
              color: "text-blue-600",
              bg: "bg-blue-50 dark:bg-blue-900/10",
              icon: (
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              ),
            },
            {
              label: "Total Reports",
              value: rankings.reduce((a, b) => a + b.totalReports, 0).toLocaleString(),
              sub: `${rankings.reduce((a, b) => a + b.resolved, 0)} resolved`,
              color: "text-emerald-600",
              bg: "bg-emerald-50 dark:bg-emerald-900/10",
              icon: (
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
            },
          ].map(({ label, value, sub, color, bg, icon }) => (
            <div key={label} className={`rounded-2xl border border-gray-200 dark:border-gray-800 ${bg} p-5 flex items-center gap-4`}>
              <div className="p-2.5 bg-white dark:bg-gray-900 rounded-xl shadow-sm">{icon}</div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                <p className={`text-xl font-bold ${color} dark:text-current`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Rankings table */}
        <ComponentCard title="Incident Resolution Performance Rankings">
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Region</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Reports</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Resolved</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Resolution Rate</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg. Time</th>
                  <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">SLA Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {rankings.map((item) => {
                  const rate = getResolutionRate(item.resolved, item.totalReports);
                  return (
                    <tr key={item.rank} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getMedalColor(item.rank)}`}>
                          {item.rank <= 3 ? ["🥇", "🥈", "🥉"][item.rank - 1] : item.rank}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-gray-800 dark:text-white">{item.region}</td>
                      <td className="px-5 py-4 text-center text-gray-600 dark:text-gray-300">{item.totalReports}</td>
                      <td className="px-5 py-4 text-center font-medium text-emerald-600 dark:text-emerald-400">{item.resolved}</td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-8">{rate}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center text-gray-600 dark:text-gray-300">{item.avgResolutionTime}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getSlaColor(item.slaCompliance)}`}>
                          {item.slaCompliance}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ComponentCard>
      </div>
    </>
  );
};

export default Rankings;