import React, { useMemo, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { SegmentedButtons, Surface, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { isSameProvince, isSameWard } from '@urban/shared-utils';
import { useReports } from '../../../hooks/shared/useReports';
import { ReportCard } from '../../../components/shared/ReportCard';
import { useAuth } from '../../../providers/AuthProvider';
import { CardListSkeleton, useSkeletonQuery } from '@/components/skeleton/Skeleton';
import { prefetchReport } from '@/services/prefetch';
import colors from '@/constants/colors';

export default function OfficialReportsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: reports, isLoading, isFetching, isRefetching, error, refetch } = useReports({
    status: statusFilter || undefined,
    assignedToMe: true,
    locationCode: user?.locationCode,
  });
  const { isFirstLoad, isRefreshing } = useSkeletonQuery({ data: reports, isLoading, isFetching, isRefetching });

  const scopedReports = useMemo(() => {
    const source = Array.isArray(reports) ? reports : [];
    const officerLocationCode = String(user?.locationCode || '').trim();
    const role = String(user?.role || '');

    if (role === 'ADMIN') {
      return source;
    }

    if (!officerLocationCode) {
      return [];
    }

    return source.filter((item: any) => {
      const reportLocationCode = String(item?.locationCode || '').trim();
      if (!reportLocationCode) {
        return false;
      }

      if (role === 'WARD_OFFICER') {
        return isSameWard(reportLocationCode, officerLocationCode);
      }

      if (role === 'PROVINCE_OFFICER') {
        return isSameProvince(reportLocationCode, officerLocationCode);
      }

      return reportLocationCode === officerLocationCode;
    });
  }, [reports, user?.locationCode, user?.role]);

  const pendingCount = scopedReports.filter((item) => item.status === 'NEW').length;
  const inProgressCount = scopedReports.filter((item) => item.status === 'IN_PROGRESS').length;
  const resolvedCount = scopedReports.filter((item) => item.status === 'RESOLVED').length;

  const scopeLabel = useMemo(() => {
    const role = String(user?.role || '');
    if (role === 'ADMIN') return 'Phạm vi: Toàn hệ thống';
    if (role === 'PROVINCE_OFFICER') return 'Phạm vi: Cùng tỉnh/thành';
    if (role === 'WARD_OFFICER') return 'Phạm vi: Đúng phường/xã';
    return 'Phạm vi: Theo địa bàn cán bộ';
  }, [user?.role]);

  const handlePress = (id: string) => {
    void prefetchReport(queryClient, id);
    router.push(`/(official)/reports/${id}` as any);
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.colors.error }}>Lỗi kết nối. Vui lòng thử lại sau.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerWrap}>
        <Surface style={styles.headerCard} elevation={1}>
          <View style={styles.headerTopRow}>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSmall" style={styles.headerTitle}>
                Danh sách sự cố
              </Text>
              <Text variant="bodySmall" style={styles.headerSubtitle}>
                {reports ? `${scopedReports.length} phản ánh trong phạm vi xử lý` : 'Đang cập nhật danh sách...'}
              </Text>
              <Text variant="labelSmall" style={styles.scopeLabel}>{scopeLabel}</Text>
            </View>
            <View style={styles.headerIconWrap}>
              <MaterialCommunityIcons name="clipboard-list-outline" size={24} color={colors.secondary} />
            </View>
          </View>

          <View style={styles.quickStatsRow}>
            <View style={[styles.quickStatCard, { backgroundColor: '#fee2e2' }]}>
              <Text style={[styles.quickStatValue, { color: '#b91c1c' }]}>{pendingCount}</Text>
              <Text style={[styles.quickStatLabel, { color: '#7f1d1d' }]}>Chờ xử lý</Text>
            </View>
            <View style={[styles.quickStatCard, { backgroundColor: '#ffedd5' }]}>
              <Text style={[styles.quickStatValue, { color: '#c2410c' }]}>{inProgressCount}</Text>
              <Text style={[styles.quickStatLabel, { color: '#7c2d12' }]}>Đang xử lý</Text>
            </View>
            <View style={[styles.quickStatCard, { backgroundColor: '#dcfce7' }]}>
              <Text style={[styles.quickStatValue, { color: '#15803d' }]}>{resolvedCount}</Text>
              <Text style={[styles.quickStatLabel, { color: '#14532d' }]}>Hoàn tất</Text>
            </View>
          </View>

          <SegmentedButtons
            value={statusFilter}
            onValueChange={setStatusFilter}
            buttons={[
              { value: '', label: 'Tất cả' },
              { value: 'NEW', label: 'Chờ xử lý' },
              { value: 'IN_PROGRESS', label: 'Đang xử lý' },
            ]}
            density="small"
            style={styles.segmentedBtn}
          />
        </Surface>
      </View>

      {isFirstLoad ? (
        <CardListSkeleton count={5} />
      ) : (
        <FlatList
          data={scopedReports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ReportCard report={item} onPress={handlePress} />}
          onRefresh={refetch}
          refreshing={isRefreshing}
          removeClippedSubviews
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={44} color="#94a3b8" />
              </View>
              <Text variant="titleMedium" style={styles.emptyTitle}>
                Không có sự cố phù hợp
              </Text>
              <Text variant="bodyMedium" style={styles.emptyText}>
                Hãy thử chuyển bộ lọc hoặc kéo xuống để làm mới danh sách.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    marginBottom: 8,
  },
  headerCard: {
    borderRadius: 20,
    backgroundColor: colors.card,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  headerTitle: {
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    marginBottom: 4,
  },
  scopeLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(73,90,255,0.12)',
  },
  quickStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickStatCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  quickStatLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  segmentedBtn: {
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingVertical: 8, paddingBottom: 24 },
  empty: { padding: 40, alignItems: 'center' },
  emptyIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
    marginBottom: 14,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyText: {
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
});
