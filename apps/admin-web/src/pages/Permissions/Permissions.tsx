/**
 * Permissions & Role Management Page
 * Configure access control matrix for different roles
 */

import React, { useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import PageBreadCrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import { useI18n } from '../../i18n/i18n-context';

interface Permission {
  resource: string;
  read: boolean;
  write: boolean;
  delete: boolean;
  approve: boolean;
}

const Permissions: React.FC = () => {
  const { t } = useI18n();
  const [role, setRole] = useState('super_admin');
  const [permissions, setPermissions] = useState<Permission[]>([
    {
      resource: 'User Management',
      read: true,
      write: true,
      delete: true,
      approve: true,
    },
    {
      resource: 'Category Management',
      read: true,
      write: true,
      delete: false,
      approve: false,
    },
    {
      resource: 'Report Management',
      read: true,
      write: true,
      delete: false,
      approve: true,
    },
    {
      resource: 'Audit Logs',
      read: true,
      write: false,
      delete: false,
      approve: false,
    },
  ]);

  const togglePermission = (
    index: number,
    action: keyof Omit<Permission, 'resource'>,
  ) => {
    const newPermissions = [...permissions];
    newPermissions[index][action] = !newPermissions[index][action];
    setPermissions(newPermissions);
  };

  const handleSave = () => {
    // In a real app, you would send this to an API service
    console.log('Saving permissions for role:', role);
  };

  return (
    <>
      <PageMeta
        title={t('permissions.title')}
        description={t('permissions.description')}
      />
      <PageBreadCrumb pageTitle={t('permissions.title')} />

      <ComponentCard title={t('permissions.rolePermissionMatrix')}>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            {t('permissions.selectRole')}
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          >
            <option value="super_admin">{t('users.superAdmin')}</option>
            <option value="admin">{t('users.admin')}</option>
            <option value="officer">{t('users.officer')}</option>
            <option value="citizen">{t('users.citizen')}</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 text-left font-semibold text-gray-700">
                  Resource
                </th>
                <th className="p-4 text-center font-semibold text-gray-700">
                  Read
                </th>
                <th className="p-4 text-center font-semibold text-gray-700">
                  Write
                </th>
                <th className="p-4 text-center font-semibold text-gray-700">
                  Delete
                </th>
                <th className="p-4 text-center font-semibold text-gray-700">
                  Approve
                </th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((perm, index) => (
                <tr
                  key={index}
                  className="border-b hover:bg-gray-50 transition-colors"
                >
                  <td className="p-4 font-medium text-gray-900">
                    {perm.resource}
                  </td>
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={perm.read}
                      onChange={() => togglePermission(index, 'read')}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={perm.write}
                      onChange={() => togglePermission(index, 'write')}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={perm.delete}
                      onChange={() => togglePermission(index, 'delete')}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={perm.approve}
                      onChange={() => togglePermission(index, 'approve')}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium shadow-md"
          >
            {t('common.save')}
          </button>
          <button className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors duration-200 font-medium">
            {t('common.cancel')}
          </button>
        </div>
      </ComponentCard>
    </>
  );
};

export default Permissions;
