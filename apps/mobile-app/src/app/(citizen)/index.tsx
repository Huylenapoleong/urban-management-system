import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useAuth } from '../../providers/AuthProvider';

export default function CitizenDashboardScreen() {
  const { logout } = useAuth();
  
  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.text}>Khu vực App dành riêng cho Cư Dân</Text>
      <Text variant="bodyMedium" style={[styles.text, { marginBottom: 24, paddingHorizontal: 32 }]}>
        Các component UI, hooks và logic ở thư mục /shared hiện tại có thể được tái sử dụng trực tiếp tại đây!
      </Text>
      <Button mode="contained" onPress={logout} buttonColor="#f44336">
        Đăng xuất
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { textAlign: 'center' }
});
