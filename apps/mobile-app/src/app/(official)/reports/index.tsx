import React, { useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { ActivityIndicator, Text, SegmentedButtons, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useReports } from '../../../hooks/shared/useReports';
import { ReportCard } from '../../../components/shared/ReportCard';

export default function OfficialReportsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [statusFilter, setStatusFilter] = useState<string>('');
  
  const { data: reports, isLoading, error, refetch } = useReports({
    status: statusFilter || undefined,
    assignedToMe: true, // UC014
  });

  const handlePress = (id: string) => {
    // Navigate to report details screen
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.filterContainer}>
        <SegmentedButtons
          value={statusFilter}
          onValueChange={setStatusFilter}
          buttons={[
            { value: '', label: 'Tất cả' },
            { value: 'NEW', label: 'Chờ xử lý' },
            { value: 'IN_PROGRESS', label: 'Đang xử lý' },
          ]}
          density="small"
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator animating size="large" />
        </View>
      ) : (
        <FlatList
          data={reports || []}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ReportCard report={item} onPress={handlePress} />
          )}
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceDisabled }}>
                Không có phản ánh nào phù hợp.
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
  filterContainer: { padding: 16, paddingBottom: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { padding: 32, alignItems: 'center' },
  listContent: { paddingBottom: 24 },
});
