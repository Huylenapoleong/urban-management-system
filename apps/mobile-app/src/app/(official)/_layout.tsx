import { useEffect } from 'react';
import { View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../providers/AuthProvider';
import { SkeletonDetail } from '@/components/skeleton/Skeleton';
import colors from '@/constants/colors';

export default function OfficialLayout() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!user) {
      router.replace('/login');
      return;
    }

    if (!['ADMIN', 'PROVINCE_OFFICER', 'WARD_OFFICER'].includes(user.role)) {
      router.replace('/home');
    }
  }, [isLoading, router, user]);

  if (isLoading || !user || !['ADMIN', 'PROVINCE_OFFICER', 'WARD_OFFICER'].includes(user.role)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <SkeletonDetail />
      </View>
    );
  }

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: colors.secondary,
      tabBarInactiveTintColor: colors.muted,
      tabBarActiveBackgroundColor: 'rgba(73,90,255,0.12)',
      headerShown: false,
    }}>
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Trang chủ',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="view-dashboard" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="reports" 
        options={{ 
          title: 'Phản ánh',
          headerShown: false,
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="clipboard-text" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="chat" 
        options={{ 
          title: 'Tin nhắn',
          href: '/(official)/chat',
          headerShown: false,
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="message-text" size={24} color={color} />
        }} 
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Tài khoản',
          headerTitle: 'Tài khoản',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="account" size={24} color={color} />
        }}
      />
    </Tabs>
  );
}
