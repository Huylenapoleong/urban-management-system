import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, Card, Title, Paragraph, useTheme, Surface, IconButton, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useReports } from '../../hooks/shared/useReports';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../hooks/shared/useProfile';

export default function OfficialDashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  // Fetch recent reports to simulate statistics and showcase lists
  const { data: reports, isLoading } = useReports();

  const totalReports = reports?.length || 0;
  const pendingCount = reports?.filter(r => r.status === 'PENDING').length || 0;
  const inProgressCount = reports?.filter(r => r.status === 'IN_PROGRESS').length || 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <View style={styles.headerContent}>
          <View>
            <Text variant="labelLarge" style={styles.greetingText}>Xin chào,</Text>
            <Text variant="headlineSmall" style={styles.userName}>{profile?.fullName || (user as any)?.fullName || 'Cán bộ'}</Text>
          </View>
          <IconButton icon="bell-outline" iconColor="#fff" size={24} onPress={() => {}} />
        </View>
      </View>

      {/* Stats Section */}
      <View style={styles.statsContainer}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Tổng quan hôm nay</Text>
        
        <View style={styles.statsGrid}>
          <Surface style={[styles.statsCard, { borderLeftColor: '#2196F3' }]} elevation={1}>
            <MaterialCommunityIcons name="clipboard-text-multiple" size={24} color="#2196F3" />
            <Text variant="headlineSmall" style={styles.statNumber}>{totalReports}</Text>
            <Text variant="labelSmall">Tổng phản ánh</Text>
          </Surface>

          <Surface style={[styles.statsCard, { borderLeftColor: '#F44336' }]} elevation={1}>
            <MaterialCommunityIcons name="alert-decagram" size={24} color="#F44336" />
            <Text variant="headlineSmall" style={[styles.statNumber, { color: '#F44336' }]}>{pendingCount}</Text>
            <Text variant="labelSmall">Chờ xử lý</Text>
          </Surface>

          <Surface style={[styles.statsCard, { borderLeftColor: '#FF9800' }]} elevation={1}>
            <MaterialCommunityIcons name="progress-clock" size={24} color="#FF9800" />
            <Text variant="headlineSmall" style={[styles.statNumber, { color: '#FF9800' }]}>{inProgressCount}</Text>
            <Text variant="labelSmall">Đang xử lý</Text>
          </Surface>
        </View>
      </View>

      {/* Recent Incidents */}
      <View style={styles.recentSection}>
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={styles.sectionTitle}>Sự cố gần đây</Text>
          <Button mode="text" compact onPress={() => router.push('/(official)/reports')}>Xem tất cả</Button>
        </View>

        {isLoading ? (
          <ActivityIndicator animating style={{ marginTop: 20 }} />
        ) : (
          reports?.slice(0, 3).map((item) => (
            <Card 
              key={item.id} 
              style={styles.incidentCard} 
              onPress={() => router.push(`/(official)/reports/${item.id}` as any)}
            >
              <Card.Content style={styles.cardContent}>
                <View style={styles.cardInfo}>
                  <Text variant="titleMedium" numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
                  <View style={styles.locationRow}>
                    <MaterialCommunityIcons name="map-marker" size={14} color="#666" />
                    <Text variant="bodySmall" style={styles.locationText}>{item.locationCode || 'N/A'}</Text>
                  </View>
                </View>
                
                <Chip 
                  compact 
                  textStyle={{ fontSize: 10, color: '#fff' }} 
                  style={[
                    styles.statusChip, 
                    { backgroundColor: item.status === 'PENDING' ? '#F44336' : item.status === 'IN_PROGRESS' ? '#FF9800' : '#4CAF50' }
                  ]}
                >
                  {item.status === 'PENDING' ? 'Mới' : 'Xử lý'}
                </Chip>
              </Card.Content>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

import { Button, Chip } from 'react-native-paper';

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 24, paddingBottom: 40, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  greetingText: { color: 'rgba(255,255,255,0.8)' },
  userName: { color: '#fff', fontWeight: 'bold' },
  statsContainer: { padding: 16, marginTop: -20 },
  sectionTitle: { fontWeight: 'bold', marginBottom: 12 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statsCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, width: '31%', alignItems: 'center', borderLeftWidth: 4 },
  statNumber: { fontWeight: 'bold', marginVertical: 4 },
  recentSection: { padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  incidentCard: { marginBottom: 10, borderRadius: 12, backgroundColor: '#fff' },
  cardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  cardInfo: { flex: 1, marginRight: 8 },
  cardTitle: { fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { marginLeft: 4, color: '#666' },
  statusChip: { alignSelf: 'center' },
});
