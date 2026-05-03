/**
 * Audit Logs Page
 * Display system audit trail of admin actions
 */

import React, { useEffect, useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import PageBreadCrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import { useI18n } from '../../i18n/i18n-context';

interface AuditLog {
  id: number;
  timestamp: string;
  admin: string;
  action: string;
  resource: string;
  status: 'success' | 'failure';
  ipAddress: string;
}

const AuditLogs: React.FC = () => {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading audit logs from API
    // In a real app, you would fetch from an API service
    const allLogs: AuditLog[] = [
      {
        id: 1,
        timestamp: '2024-01-15 10:30:15',
        admin: 'admin@example.com',
        action: 'CREATE_USER',
        resource: 'User: John Doe',
        status: 'success',
        ipAddress: '192.168.1.1',
      },
      {
        id: 2,
        timestamp: '2024-01-15 09:15:42',
        admin: 'admin@example.com',
        action: 'UPDATE_PERMISSIONS',
        resource: 'Role: OFFICER',
        status: 'success',
        ipAddress: '192.168.1.1',
      },
      {
        id: 3,
        timestamp: '2024-01-15 08:45:30',
        admin: 'manager@example.com',
        action: 'DELETE_CATEGORY',
        resource: 'Category: Old Category',
        status: 'success',
        ipAddress: '192.168.1.50',
      },
      {
        id: 4,
        timestamp: '2024-01-14 17:23:12',
        admin: 'admin@example.com',
        action: 'FAILED_LOGIN',
        resource: 'User: unknown_user',
        status: 'failure',
        ipAddress: '203.0.113.45',
      },
    ];
    setLogs(allLogs);
    setLoading(false);
  }, []);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const filteredLogs =
    searchTerm.trim() === ''
      ? logs
      : logs.filter(
          (log) =>
            log.admin.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.resource.toLowerCase().includes(searchTerm.toLowerCase()),
        );

  return (
    <>
      <PageMeta
        title={t('auditLogs.title')}
        description={t('auditLogs.description')}
      />
      <PageBreadCrumb pageTitle={t('auditLogs.title')} />

      <ComponentCard title={t('auditLogs.adminActivityHistory')}>
        <div className="flex items-center gap-4 mb-6">
          <input
            type="text"
            placeholder={t('auditLogs.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">{t('auditLogs.loading')}</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">{t('auditLogs.noLogs')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-4 text-left font-semibold text-gray-700">
                    {t('auditLogs.timestamp')}
                  </th>
                  <th className="p-4 text-left font-semibold text-gray-700">
                    {t('auditLogs.admin')}
                  </th>
                  <th className="p-4 text-left font-semibold text-gray-700">
                    {t('auditLogs.action')}
                  </th>
                  <th className="p-4 text-left font-semibold text-gray-700">
                    {t('auditLogs.resource')}
                  </th>
                  <th className="p-4 text-left font-semibold text-gray-700">
                    {t('auditLogs.status')}
                  </th>
                  <th className="p-4 text-left font-semibold text-gray-700">
                    IP Address
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b hover:bg-gray-50 transition-colors"
                  >
                    <td className="p-4 text-gray-600">{log.timestamp}</td>
                    <td className="p-4 font-medium">{log.admin}</td>
                    <td className="p-4">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">{log.resource}</td>
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          log.status === 'success'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.status === 'success'
                          ? t('auditLogs.success')
                          : t('auditLogs.failure')}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ComponentCard>
    </>
  );
};

export default AuditLogs;
