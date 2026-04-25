/**
 * Regions/Administrative Divisions Management Page
 * Tree view for Province -> District -> Ward hierarchy
 */

import React, { useCallback, useEffect, useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import PageBreadCrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import { useI18n } from '../../i18n/i18n-context';
import { Region, regionsService } from '../../services/regions.service';

interface RegionWithExpanded extends Region {
  isExpanded?: boolean;
  children?: RegionWithExpanded[];
}

const Regions: React.FC = () => {
  const { t } = useI18n();
  const [regions, setRegions] = useState<RegionWithExpanded[]>([]);
  const [allRegions, setAllRegions] = useState<RegionWithExpanded[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterAndExpandRegions = useCallback(
    (
      items: RegionWithExpanded[],
      nextSearchTerm: string,
    ): RegionWithExpanded[] => {
      return items.reduce((acc: RegionWithExpanded[], region) => {
        const matches = region.name.toLowerCase().includes(nextSearchTerm);
        const hasMatchingChildren =
          region.children &&
          region.children.some(
            (child) =>
              filterAndExpandRegions([child], nextSearchTerm).length > 0,
          );

        if (matches || hasMatchingChildren) {
          const filteredRegion = {
            ...region,
            isExpanded: hasMatchingChildren ? true : region.isExpanded,
            children: region.children
              ? filterAndExpandRegions(region.children, nextSearchTerm)
              : undefined,
          };
          acc.push(filteredRegion);
        }
        return acc;
      }, []);
    },
    [],
  );

  const fetchRegions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await regionsService.getRegions();
      if (response.success && response.data) {
        setAllRegions(response.data.items);
        setRegions(response.data.items);
      } else {
        setError(response.error || t('regions.error'));
      }
    } catch {
      setError(t('regions.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchRegions();
  }, [fetchRegions]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setRegions(allRegions);
    } else {
      const filtered = filterAndExpandRegions(
        allRegions,
        searchTerm.toLowerCase(),
      );
      setRegions(filtered);
    }
  }, [searchTerm, allRegions, filterAndExpandRegions]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const toggleExpand = (id: string) => {
    setRegions((prev) =>
      prev.map((region) =>
        region.id === id
          ? { ...region, isExpanded: !region.isExpanded }
          : region,
      ),
    );
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('common.confirmDelete'))) {
      const response = await regionsService.deleteRegion(id);
      if (response.success) {
        setRegions(regions.filter((r) => r.id !== id));
      } else {
        setError(response.error || t('regions.error'));
      }
    }
  };

  const renderTreeItem = (item: RegionWithExpanded, level: number = 0) => (
    <div
      key={item.id}
      style={{ marginLeft: `${level * 24}px` }}
      className="py-2"
    >
      <div className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
        {item.children && item.children.length > 0 ? (
          <button
            onClick={() => toggleExpand(item.id)}
            className="text-gray-600 hover:text-gray-900 font-semibold"
          >
            {item.isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="w-5"></span>
        )}
        <span className="font-medium text-gray-900">{item.name}</span>
        <div className="flex gap-2 ml-auto">
          <button className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors">
            {t('common.edit')}
          </button>
          <button
            onClick={() => handleDelete(item.id)}
            className="text-red-600 hover:text-red-800 hover:underline font-medium transition-colors"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
      {item.isExpanded &&
        item.children?.map((child) => renderTreeItem(child, level + 1))}
    </div>
  );

  return (
    <>
      <PageMeta
        title={t('regions.title')}
        description={t('regions.description')}
      />
      <PageBreadCrumb pageTitle={t('regions.title')} />

      <ComponentCard title={t('regions.regionList')}>
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-300 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 mb-6">
          <input
            type="text"
            placeholder={t('regions.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium shadow-md">
            + {t('regions.addRegion')}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">{t('regions.loading')}</p>
          </div>
        ) : regions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">{t('regions.noRegions')}</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            {regions.map((region) => renderTreeItem(region))}
          </div>
        )}
      </ComponentCard>
    </>
  );
};

export default Regions;
