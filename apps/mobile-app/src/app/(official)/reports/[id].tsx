import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, SafeAreaView } from 'react-native';
import { Text, Chip, Button, useTheme, Surface, Divider, Dialog, Portal, RadioButton, Appbar, List, TextInput, Avatar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useReport, useUpdateReportStatus, useLinkedConversations, useAssignOfficer, useReportAudit } from '../../../hooks/shared/useReports';
import { useUserSearch } from '../../../hooks/shared/useUsers';
import { convertToS3Url } from '@/constants/s3';
import { ListSkeleton, SkeletonDetail } from '@/components/skeleton/Skeleton';
import { prefetchConversationMessages } from '@/services/prefetch';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  NEW: { color: '#f44336', label: 'Chờ xử lý' },
  IN_PROGRESS: { color: '#ff9800', label: 'Đang xử lý' },
  RESOLVED: { color: '#4caf50', label: 'Đã giải quyết' },
  REJECTED: { color: '#9e9e9e', label: 'Từ chối' },
};

export default function ReportDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useTheme();
  
  const { data: report, isLoading, error } = useReport(id);
  const { data: linkedConversations } = useLinkedConversations(id || '');
  const { mutate: updateStatus, isPending: isUpdating } = useUpdateReportStatus();
  const { mutate: assignOfficer, isPending: isAssigning } = useAssignOfficer();
  const { data: auditLogs } = useReportAudit(id || '');
  
  const [statusDialogVisible, setStatusDialogVisible] = useState(false);
  const [assignDialogVisible, setAssignDialogVisible] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [officerSearchQuery, setOfficerSearchQuery] = useState('');
  const { data: officers, isLoading: isSearchingOfficers } = useUserSearch(officerSearchQuery);
  const [auditVisible, setAuditVisible] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.push('/(official)/reports')} />
          <Appbar.Content title="Chi tiết phản ánh" />
        </Appbar.Header>
        <View style={styles.center}>
          <SkeletonDetail />
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
              <Image
                key={url}
                source={{ uri: url }}
                style={styles.mediaImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
                transition={160}
              />
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
          Cap nhat trang thai
        </Button>
        
        <Button 
          mode="contained-tonal" 
          icon="account-plus" 
          onPress={() => setAssignDialogVisible(true)}
          style={styles.actionBtn}
        >
          {report.assignedOfficerId ? 'Thay doi can bo' : 'Phan cong can bo'}
        </Button>

        {report.assignedOfficerId && (
          <View style={styles.assignedSection}>
            <Text variant="bodySmall" style={styles.assignedLabel}>Can bo dang xu ly:</Text>
            <Text variant="bodyMedium" style={styles.officerName}>ID: {report.assignedOfficerId}</Text>
          </View>
        )}

        <Button 
          mode="outlined" 
          icon="history" 
          onPress={() => setAuditVisible(!auditVisible)}
          style={styles.actionBtn}
        >
          {auditVisible ? 'An lich su' : 'Xem lich su xử ly'}
        </Button>

        {auditVisible && (
          <Surface style={styles.auditSurface} elevation={1}>
            {auditLogs && auditLogs.length > 0 ? (
              auditLogs.map((log, index) => (
                <View key={log.id || index}>
                  <List.Item
                    title={log.summary}
                    description={`${new Date(log.occurredAt).toLocaleString('vi-VN')} • Actor: ${log.actorUserId.substring(0,8)}`}
                    titleStyle={styles.auditTitle}
                    descriptionStyle={styles.auditDesc}
                    left={(props: any) => <List.Icon {...props} icon="information-outline" size={20} />}
                  />
                  {index < auditLogs.length - 1 && <Divider />}
                </View>
              ))
            ) : (
              <Text style={styles.emptyAudit}>Chua có lich su ghi lai.</Text>
            )}
          </Surface>
        )}

        <Button 
          mode="outlined" 
          icon="chat" 
            onPress={() => {
              if (report.userId) { // Fallback/Prioritize private DM with the citizen
                const targetId = `dm:${report.userId}`;
                void prefetchConversationMessages(queryClient, targetId);
                router.push({
                  pathname: '/(official)/chat/[id]',
                  params: { id: targetId },
                });
              } else {
                const linked = linkedConversations?.[0];
                const targetId =
                  linked?.conversationId ||
                  ((report as any)?.groupId ? `group:${(report as any).groupId}` : undefined);
                if (targetId) {
                  void prefetchConversationMessages(queryClient, targetId);
                  router.push({
                    pathname: '/(official)/chat/[id]',
                    params: { id: targetId },
                  });
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
            <Button onPress={() => setStatusDialogVisible(false)}>Huy</Button>
            <Button onPress={handleUpdateStatus} disabled={isUpdating}>Lưu</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={assignDialogVisible} onDismiss={() => setAssignDialogVisible(false)} style={styles.assignDialog}>
          <Dialog.Title>Phan cong can bo</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Tim kiem can bo..."
              value={officerSearchQuery}
              onChangeText={setOfficerSearchQuery}
              mode="outlined"
              right={<TextInput.Icon icon="magnify" />}
              style={styles.officerSearch}
            />
            <ScrollView style={styles.officerList}>
              {isSearchingOfficers ? (
                <ListSkeleton count={4} />
              ) : (
                officers?.map((officer) => (
                  <List.Item
                    key={officer.userId}
                    title={officer.fullName}
                    description={officer.role}
                    onPress={() => {
                      assignOfficer(
                        { reportId: report.id, officerId: officer.userId },
                        { onSuccess: () => setAssignDialogVisible(false) }
                      );
                    }}
                    left={(props: any) => <Avatar.Text {...props} size={32} label={officer.fullName.substring(0,2).toUpperCase()} />}
                  />
                ))
              )}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAssignDialogVisible(false)}>Dong</Button>
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
  assignedSection: { 
    padding: 12, 
    backgroundColor: '#fff', 
    borderRadius: 8, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  assignedLabel: { color: '#666', marginBottom: 4 },
  officerName: { fontWeight: '700', color: '#1976D2' },
  auditSurface: { 
    borderRadius: 12, 
    marginBottom: 16, 
    overflow: 'hidden',
    backgroundColor: '#fff' 
  },
  auditTitle: { fontSize: 13, fontWeight: '700' },
  auditDesc: { fontSize: 11 },
  emptyAudit: { padding: 16, textAlign: 'center', color: '#666' },
  assignDialog: { maxHeight: '80%' },
  officerSearch: { marginBottom: 16 },
  officerList: { maxHeight: 300 },
});
