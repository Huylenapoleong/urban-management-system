import React from 'react';
import { View, ScrollView, StyleSheet, ImageBackground, StatusBar, Pressable } from 'react-native';
import { Text, Button, useTheme, Surface, IconButton, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useReports } from '../../hooks/shared/useReports';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../hooks/shared/useProfile';
import CitizenReportCard from '../../components/shared/CitizenReportCard';
import { isSameProvince, isSameWard } from '@urban/shared-utils';

export default function OfficialDashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  // Fetch recent reports to simulate statistics and showcase lists
  const { data: reports, isLoading } = useReports({
    locationCode: user?.locationCode,
  });

  const scopedReports = React.useMemo(() => {
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

  const totalReports = scopedReports.length;
  const pendingCount = scopedReports.filter(r => r.status === 'NEW').length;
  const inProgressCount = scopedReports.filter(r => r.status === 'IN_PROGRESS').length;

  return (
    <View style={[styles.container, { backgroundColor: '#f2f5f9' }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Hero Header */}
        <ImageBackground 
          source={{ uri: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=1470&auto=format&fit=crop' }} 
          style={styles.heroBackground}
          imageStyle={{ opacity: 0.8 }}
        >
          <View style={styles.heroOverlay}>
            <View style={styles.headerContent}>
              <View>
                <Text style={styles.greetingText}>Xin chào,</Text>
                <Text style={styles.userName}>{profile?.fullName || (user as any)?.fullName || 'Cán bộ'}</Text>
              </View>
              <Surface style={styles.notificationBadge} elevation={2}>
                <IconButton icon="bell" iconColor={theme.colors.primary} size={22} onPress={() => {}} style={{ margin: 0 }} />
              </Surface>
            </View>
          </View>
        </ImageBackground>

        {/* Stats Section */}
        <View style={styles.statsContainer}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>Tổng quan hôm nay</Text>
          </View>
          
          <View style={styles.statsGrid}>
            <Surface style={[styles.statsCard, { backgroundColor: '#e3f2fd' }]} elevation={0}>
              <MaterialCommunityIcons name="clipboard-text-multiple" size={28} color="#1976D2" style={styles.statIcon} />
              <Text variant="headlineMedium" style={[styles.statNumber, { color: '#1976D2' }]}>{totalReports}</Text>
              <Text variant="labelMedium" style={{ color: '#1565C0', fontWeight: '500' }}>Tổng số</Text>
            </Surface>

            <Surface style={[styles.statsCard, { backgroundColor: '#ffebee' }]} elevation={0}>
              <MaterialCommunityIcons name="alert-decagram" size={28} color="#d32f2f" style={styles.statIcon} />
              <Text variant="headlineMedium" style={[styles.statNumber, { color: '#d32f2f' }]}>{pendingCount}</Text>
              <Text variant="labelMedium" style={{ color: '#c62828', fontWeight: '500' }}>Cần xử lý</Text>
            </Surface>

            <Surface style={[styles.statsCard, { backgroundColor: '#fff3e0' }]} elevation={0}>
              <MaterialCommunityIcons name="progress-clock" size={28} color="#f57c00" style={styles.statIcon} />
              <Text variant="headlineMedium" style={[styles.statNumber, { color: '#f57c00' }]}>{inProgressCount}</Text>
              <Text variant="labelMedium" style={{ color: '#ef6c00', fontWeight: '500' }}>Đang làm</Text>
            </Surface>
          </View>
        </View>

        {/* Recent Incidents */}
        <View style={styles.recentSection}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>Sự cố gần đây</Text>
            <Button mode="text" labelStyle={{ fontWeight: 'bold' }} onPress={() => router.push('/(official)/reports')}>XEM TẤT CẢ</Button>
          </View>

          {isLoading ? (
            <ActivityIndicator animating size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
          ) : (
            scopedReports.slice(0, 4).map((item) => (
              <Pressable key={item.id} onPress={() => router.push(`/(official)/reports/${item.id}` as any)}>
                <CitizenReportCard report={item as any} />
              </Pressable>
            ))
          )}
          {scopedReports.length === 0 && !isLoading && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="check-decagram" size={48} color="#4caf50" />
              <Text variant="bodyLarge" style={{ color: '#666', marginTop: 12 }}>Tuyệt vời! Khu vực hiện tại không có sự cố nào.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroBackground: { width: '100%', height: 200, backgroundColor: '#024285' },
  heroOverlay: { flex: 1, backgroundColor: 'rgba(0,35,90,0.6)', paddingTop: 50, paddingHorizontal: 24, justifyContent: 'center' },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetingText: { color: 'rgba(255,255,255,0.9)', fontSize: 16, marginBottom: 4 },
  userName: { color: '#ffffff', fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  notificationBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  
  statsContainer: { paddingHorizontal: 20, marginTop: -30 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  statsCard: { flex: 1, paddingVertical: 18, paddingHorizontal: 8, borderRadius: 20, alignItems: 'center' },
  statIcon: { marginBottom: 8 },
  statNumber: { fontWeight: '900', fontSize: 28 },
  
  recentSection: { paddingHorizontal: 20, marginTop: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontWeight: '800', fontSize: 18, color: '#1a1a1a' },
  
  emptyState: { alignItems: 'center', marginTop: 40, padding: 20 }
});
