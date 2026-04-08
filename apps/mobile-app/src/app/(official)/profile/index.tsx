import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Button, Avatar, Card, List, useTheme, ActivityIndicator, IconButton, Portal, Dialog, TextInput } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../../providers/AuthProvider';
import { useProfile, useUpdateProfile, useUploadAvatar } from '../../../hooks/shared/useProfile';

export default function ProfileScreen() {
  const { logout } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile();
  const { mutateAsync: uploadAvatar, isPending: isUploading } = useUploadAvatar();
  const theme = useTheme();

  const [editVisible, setEditVisible] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', email: '', locationCode: '' });

  const handleOpenEdit = () => {
    if (profile) {
      setEditForm({
        fullName: profile.fullName || '',
        phone: profile.phone || '',
        email: profile.email || '',
        locationCode: profile.locationCode || ''
      });
      setEditVisible(true);
    }
  };

  const handleSaveEdit = () => {
    updateProfile(editForm, {
      onSuccess: () => setEditVisible(false),
      onError: (err: any) => Alert.alert('Lỗi', 'Không thể cập nhật hồ sơ: ' + err.message)
    });
  };

  const handlePickAvatar = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    // Using image picker requires permission
    if (permissionResult.granted === false) {
      Alert.alert('Cấp quyền', 'Bạn cần cho phép truy cập ảnh để đổi avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        const uploadedUrl = await uploadAvatar(result.assets[0].uri);
        updateProfile({ avatarUrl: uploadedUrl }, {
          onError: (err: any) => Alert.alert('Lỗi', 'Không thể lưu avatar mới: ' + err.message)
        });
      } catch (err: any) {
        Alert.alert('Lỗi tải ảnh', 'Xảy ra lỗi khi tải ảnh lên server: ' + err.message);
      }
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Card style={styles.profileCard} elevation={1}>
          <Card.Content style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              {profile?.avatarUrl ? (
                <Avatar.Image size={90} source={{ uri: profile.avatarUrl }} />
              ) : (
                <Avatar.Icon size={90} icon="account" style={{ backgroundColor: theme.colors.primaryContainer }} />
              )}
              {isUploading && (
                <View style={[StyleSheet.absoluteFill, styles.avatarOverlay]}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <IconButton
                icon="camera-plus"
                size={20}
                mode="contained"
                onPress={handlePickAvatar}
                disabled={isUploading}
                style={styles.editAvatarBtn}
              />
            </View>
            <Text variant="headlineSmall" style={styles.userName}>{profile?.fullName || 'Cán bộ'}</Text>
            <Text variant="labelMedium" style={{ color: '#666' }}>Vai trò: {profile?.role || 'Chưa xác định'}</Text>
          </Card.Content>
        </Card>

        <Card style={styles.infoCard} elevation={1}>
          <Card.Content style={{ paddingVertical: 8 }}>
            <View style={styles.infoHeader}>
              <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Thông tin chi tiết</Text>
              <Button mode="text" icon="pencil" onPress={handleOpenEdit} compact>Sửa</Button>
            </View>
            <List.Item
              title="Số điện thoại"
              description={profile?.phone || 'Chưa cập nhật'}
              left={props => <List.Icon {...props} icon="phone" />}
            />
            <List.Item
              title="Email"
              description={profile?.email || 'Chưa cập nhật'}
              left={props => <List.Icon {...props} icon="email" />}
            />
            <List.Item
              title="Khu vực phụ trách"
              description={profile?.locationCode || 'Chưa cập nhật'}
              left={props => <List.Icon {...props} icon="map-marker" />}
            />
          </Card.Content>
        </Card>

        <Button mode="contained" onPress={logout} buttonColor="#f44336" style={styles.logoutBtn} icon="logout">
          Đăng xuất tài khoản
        </Button>
      </ScrollView>

      <Portal>
        <Dialog visible={editVisible} onDismiss={() => setEditVisible(false)}>
          <Dialog.Title>Cập nhật hồ sơ</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Họ và tên"
              value={editForm.fullName}
              onChangeText={val => setEditForm(prev => ({ ...prev, fullName: val }))}
              style={styles.input}
              mode="outlined"
            />
            <TextInput
              label="Số điện thoại"
              value={editForm.phone}
              onChangeText={val => setEditForm(prev => ({ ...prev, phone: val }))}
              style={styles.input}
              mode="outlined"
              keyboardType="phone-pad"
            />
            <TextInput
              label="Email"
              value={editForm.email}
              onChangeText={val => setEditForm(prev => ({ ...prev, email: val }))}
              style={styles.input}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              label="Mã khu vực"
              value={editForm.locationCode}
              onChangeText={val => setEditForm(prev => ({ ...prev, locationCode: val }))}
              style={styles.input}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditVisible(false)}>Hủy</Button>
            <Button mode="contained" onPress={handleSaveEdit} loading={isUpdating}>Lưu thay đổi</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileCard: { marginBottom: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: '#fff' },
  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatarWrapper: { position: 'relative' },
  avatarOverlay: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 45, justifyContent: 'center', alignItems: 'center' },
  editAvatarBtn: { position: 'absolute', bottom: -10, right: -10, backgroundColor: '#2196F3' },
  userName: { fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
  infoCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 24 },
  infoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  logoutBtn: { borderRadius: 12, paddingVertical: 4, marginTop: 8 },
  input: { marginBottom: 12, backgroundColor: '#fff' }
});
