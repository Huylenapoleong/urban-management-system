import React from 'react';
import { View, ScrollView, StyleSheet, ImageBackground, StatusBar } from 'react-native';
import { Text, Surface, IconButton, Button, useTheme, Card } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../hooks/shared/useProfile';

export default function CitizenDashboardScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const { data: profile } = useProfile();

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
                <Text style={styles.greetingText}>Xin chào cư dân,</Text>
                <Text style={styles.userName}>{profile?.fullName || (user as any)?.fullName || 'Người dùng'}</Text>
              </View>
              <Surface style={styles.notificationBadge} elevation={2}>
                <IconButton icon="bell" iconColor={theme.colors.primary} size={22} onPress={() => {}} style={{ margin: 0 }} />
              </Surface>
            </View>
          </View>
        </ImageBackground>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <Text variant="titleMedium" style={styles.sectionTitle}>Tiện ích cư dân</Text>
          <View style={styles.actionGrid}>
            <Surface style={styles.actionCard} elevation={1}>
              <MaterialCommunityIcons name="bullhorn-outline" size={32} color="#1976D2" />
              <Text style={styles.actionText}>Gửi phản ánh</Text>
            </Surface>
            <Surface style={styles.actionCard} elevation={1}>
              <MaterialCommunityIcons name="clipboard-list-outline" size={32} color="#388E3C" />
              <Text style={styles.actionText}>Lịch sử</Text>
            </Surface>
            <Surface style={styles.actionCard} elevation={1}>
              <MaterialCommunityIcons name="phone-classic" size={32} color="#F57C00" />
              <Text style={styles.actionText}>Đường dây nóng</Text>
            </Surface>
          </View>
        </View>

        {/* Placeholder Info */}
        <View style={styles.infoSection}>
          <Card style={styles.infoCard} elevation={1}>
            <Card.Content>
              <View style={{ alignItems: 'center', marginVertical: 20 }}>
                <MaterialCommunityIcons name="city-variant-outline" size={64} color="#bdbdbd" />
                <Text variant="titleMedium" style={{ marginTop: 16, fontWeight: 'bold', color: '#424242' }}>Khu vực dành riêng cho Cư Dân</Text>
                <Text variant="bodyMedium" style={{ textAlign: 'center', marginTop: 8, color: '#757575', paddingHorizontal: 20 }}>
                  Tính năng đang được phát triển thêm. Các chức năng báo cáo sự cố và WebRTC sẽ sớm được tích hợp hoàn thiện tại đây.
                </Text>
              </View>
              <Button mode="contained" buttonColor="#d32f2f" onPress={logout} style={{ marginTop: 20, borderRadius: 12 }}>
                ĐĂNG XUẤT TÀI KHOẢN
              </Button>
            </Card.Content>
          </Card>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroBackground: { width: '100%', height: 220, backgroundColor: '#024285' },
  heroOverlay: { flex: 1, backgroundColor: 'rgba(0,35,90,0.6)', paddingTop: 60, paddingHorizontal: 24, justifyContent: 'center' },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetingText: { color: 'rgba(255,255,255,0.9)', fontSize: 16, marginBottom: 4 },
  userName: { color: '#ffffff', fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  notificationBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  
  actionsContainer: { paddingHorizontal: 20, marginTop: -30 },
  sectionTitle: { fontWeight: '800', fontSize: 18, color: '#1a1a1a', marginBottom: 16 },
  actionGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  actionCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', marginHorizontal: 4 },
  actionText: { marginTop: 8, fontSize: 13, fontWeight: '600', color: '#424242', textAlign: 'center' },
  
  infoSection: { paddingHorizontal: 20, marginTop: 24 },
  infoCard: { borderRadius: 20, backgroundColor: '#fff' }
});
