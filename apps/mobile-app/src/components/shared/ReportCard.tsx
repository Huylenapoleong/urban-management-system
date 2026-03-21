import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, Chip, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReportItem } from '@urban/shared-types';

interface ReportCardProps {
  report: ReportItem;
  onPress?: (id: string) => void;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  NEW: { color: '#f44336', label: 'Chờ xử lý' },
  IN_PROGRESS: { color: '#ff9800', label: 'Đang xử lý' },
  RESOLVED: { color: '#4caf50', label: 'Đã giải quyết' },
  REJECTED: { color: '#9e9e9e', label: 'Từ chối' },
};

export const ReportCard: React.FC<ReportCardProps> = ({ report, onPress }) => {
  const theme = useTheme();
  const statusConfig = STATUS_CONFIG[report.status] || { color: theme.colors.surfaceVariant, label: report.status };

  return (
    <Card style={styles.card} onPress={() => onPress?.(report.id)} mode="elevated">
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title} numberOfLines={2}>
            {report.title}
          </Text>
          <Chip
            textStyle={{ color: '#fff', fontSize: 12 }}
            style={{ backgroundColor: statusConfig.color }}
            compact
          >
            {statusConfig.label}
          </Chip>
        </View>

        <View style={styles.row}>
          <MaterialCommunityIcons name="map-marker" size={16} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodySmall" style={styles.address} numberOfLines={1}>
            {report.locationCode || 'Chưa định vị'}
          </Text>
        </View>

        <Text variant="bodyMedium" style={styles.description} numberOfLines={2}>
          {report.description}
        </Text>

        <View style={styles.footer}>
          <Text variant="labelSmall" style={styles.date}>
            {new Date(report.createdAt).toLocaleString('vi-VN')}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    flex: 1,
    marginRight: 8,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  address: {
    marginLeft: 4,
    color: '#666',
  },
  description: {
    marginBottom: 12,
  },
  footer: {
    alignItems: 'flex-end',
  },
  date: {
    color: '#999',
  },
});
