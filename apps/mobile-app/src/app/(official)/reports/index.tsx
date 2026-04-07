import React, { useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { ActivityIndicator, Text, SegmentedButtons, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useReports } from '../../../hooks/shared/useReports';
import { ReportCard } from '../../../components/shared/ReportCard';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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
    <View style={[styles.container, { backgroundColor: '#f5f7fa' }]}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.headerTitle}>
          Danh sách phản ánh
        </Text>
        <Text variant="bodySmall" style={{ color: '#757575', marginBottom: 12 }}>
          {reports ? `${reports.length} phản ánh được giao` : 'Đang cập nhật...'}
        </Text>
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
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator animating size="large" color={theme.colors.primary} />
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
              <MaterialCommunityIcons name="clipboard-text-outline" size={60} color="#e0e0e0" />
              <Text variant="bodyLarge" style={styles.emptyText}>
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
  header: { 
    padding: 16, 
    backgroundColor: '#ffffff', 
    borderBottomLeftRadius: 20, 
    borderBottomRightRadius: 20, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    marginBottom: 8,
  },
  headerTitle: { 
    fontWeight: '900', 
    color: '#1a1a1a', 
    marginBottom: 4,
  },
  segmentedBtn: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { padding: 48, alignItems: 'center', gap: 12 },
  emptyText: { 
    color: '#9e9e9e', 
    fontWeight: '600',
    textAlign: 'center',
  },
  listContent: { paddingVertical: 8 },
});
