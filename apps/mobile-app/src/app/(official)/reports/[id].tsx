import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, SafeAreaView } from 'react-native';
import { Text, Chip, Button, ActivityIndicator, useTheme, Surface, Divider, Dialog, Portal, RadioButton, Appbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useReport, useUpdateReportStatus, useLinkedConversations } from '../../../hooks/shared/useReports';
import { convertToS3Url } from '@/constants/s3';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  NEW: { color: '#f44336', label: 'Chờ xử lý' },
  IN_PROGRESS: { color: '#ff9800', label: 'Đang xử lý' },
  RESOLVED: { color: '#4caf50', label: 'Đã giải quyết' },
  REJECTED: { color: '#9e9e9e', label: 'Từ chối' },
};

export default function ReportDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  
  const { data: report, isLoading, error } = useReport(id);
  const { data: linkedConversations } = useLinkedConversations(id || '');
  const { mutate: updateStatus, isPending: isUpdating } = useUpdateReportStatus();
  
  const [statusDialogVisible, setStatusDialogVisible] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.push('/(official)/reports')} />
          <Appbar.Content title="Chi tiết phản ánh" />
        </Appbar.Header>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !report) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.push('/(official)/reports')} />
          <Appbar.Content title="Chi tiết phản ánh" />
        </Appbar.Header>
        <View style={styles.center}>
          <Text style={{ color: theme.colors.error }}>Không thể tải chi tiết phản ánh.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = STATUS_CONFIG[report.status] || { color: theme.colors.surfaceVariant, label: report.status };
  const imageUrls = (report.mediaUrls || []).map((url) => convertToS3Url(url));

  const handleUpdateStatus = () => {
    if (selectedStatus && selectedStatus !== report.status) {
      updateStatus(
        { reportId: report.id, status: selectedStatus },
        { onSuccess: () => setStatusDialogVisible(false) }
      );
    } else {
      setStatusDialogVisible(false);
    }
  };

  const openStatusDialog = () => {
    setSelectedStatus(report.status);
    setStatusDialogVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.push('/(official)/reports')} />
        <Appbar.Content title="Chi tiết phản ánh" />
      </Appbar.Header>
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={styles.headerSurface} elevation={1}>
        <Text variant="headlineSmall" style={styles.title}>{report.title}</Text>
        
        <View style={styles.metaRow}>
          <Chip 
            textStyle={{ color: '#fff', fontSize: 12 }} 
            style={{ backgroundColor: statusConfig.color }}
          >
            {statusConfig.label}
          </Chip>
          <Text variant="labelMedium" style={styles.date}>
            {new Date(report.createdAt).toLocaleString('vi-VN')}
          </Text>
        </View>

        <Divider style={styles.divider} />

        <View style={styles.iconRow}>
          <MaterialCommunityIcons name="map-marker" size={20} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={styles.iconText}>
            {report.locationCode || 'Chưa định vị'}
          </Text>
        </View>
        
        <View style={styles.iconRow}>
          <MaterialCommunityIcons name="tag" size={20} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={styles.iconText}>
            Loại: {report.category}
          </Text>
        </View>
      </Surface>

      <Surface style={styles.descSurface} elevation={1}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Nội dung phản ánh</Text>
        <Text variant="bodyMedium">{report.description || 'Không có mô tả chi tiết.'}</Text>
      </Surface>

      {imageUrls.length > 0 ? (
        <Surface style={styles.mediaSurface} elevation={1}>
          <View style={styles.mediaHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>Hình ảnh sự cố</Text>
            <Text variant="labelSmall" style={styles.mediaCount}>{`${imageUrls.length} ảnh`}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaList}>
            {imageUrls.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.mediaImage} contentFit="cover" />
            ))}
          </ScrollView>
        </Surface>
      ) : null}

      <View style={styles.actionContainer}>
        <Button 
          mode="contained" 
          icon="update" 
          onPress={openStatusDialog}
          style={styles.actionBtn}
        >
          Cập nhật trạng thái
        </Button>
          <Button 
            mode="outlined" 
            icon="chat" 
            onPress={() => {
              if (report.userId) { // Fallback/Prioritize private DM with the citizen
                router.push(`/(official)/chat/dm:${report.userId}`);
              } else {
                const linked = linkedConversations?.[0];
                const targetId =
                  linked?.conversationId ||
                  ((report as any)?.groupId ? `group:${(report as any).groupId}` : undefined);
                if (targetId) {
                  router.push(`/(official)/chat/${targetId}`);
                } else {
                  Alert.alert("Thông báo", "Báo cáo này chưa có phòng trao đổi liên kết.");
                }
              }
            }}
            style={styles.actionBtn}
          >
            Nhắn tin với công dân
          </Button>
      </View>

      <Portal>
        <Dialog visible={statusDialogVisible} onDismiss={() => setStatusDialogVisible(false)}>
          <Dialog.Title>Chọn trạng thái mới</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group onValueChange={value => setSelectedStatus(value)} value={selectedStatus}>
              <RadioButton.Item label="Chờ xử lý" value="NEW" />
              <RadioButton.Item label="Đang xử lý" value="IN_PROGRESS" />
              <RadioButton.Item label="Đã giải quyết" value="RESOLVED" />
              <RadioButton.Item label="Từ chối" value="REJECTED" />
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setStatusDialogVisible(false)}>Hủy</Button>
            <Button onPress={handleUpdateStatus} loading={isUpdating} disabled={isUpdating}>Lưu</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerSurface: { padding: 16, marginBottom: 8 },
  title: { fontWeight: 'bold', marginBottom: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  date: { color: '#666' },
  divider: { marginVertical: 12 },
  iconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconText: { marginLeft: 8, color: '#444' },
  descSurface: { padding: 16, marginBottom: 8 },
  sectionTitle: { fontWeight: 'bold', marginBottom: 8 },
  mediaSurface: { paddingVertical: 14, marginBottom: 8 },
  mediaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  mediaCount: { color: '#666', fontWeight: '600' },
  mediaList: { paddingHorizontal: 16, gap: 10 },
  mediaImage: {
    width: 180,
    height: 128,
    borderRadius: 14,
    backgroundColor: '#eceff1',
  },
  actionContainer: { padding: 16, paddingBottom: 32 },
  actionBtn: { marginBottom: 12 },
});
