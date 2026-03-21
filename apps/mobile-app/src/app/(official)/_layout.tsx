import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';

export default function OfficialLayout() {
  const theme = useTheme();

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: theme.colors.primary,
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
