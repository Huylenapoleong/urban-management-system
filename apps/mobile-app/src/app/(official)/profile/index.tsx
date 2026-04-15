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
        const uploadedAsset = await uploadAvatar(result.assets[0].uri);
        updateProfile({ avatarKey: uploadedAsset.key }, {
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
    <View style={[styles.container, { backgroundColor: '#f5f7fa' }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Header Profile Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            {profile?.avatarUrl ? (
              <Avatar.Image size={100} source={{ uri: profile.avatarUrl }} style={styles.avatarBorder} />
            ) : (
              <Avatar.Icon size={100} icon="account" style={styles.avatarPlaceholder} />
            )}
            {isUploading && (
              <View style={[StyleSheet.absoluteFill, styles.avatarOverlay]}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <IconButton
              icon="camera"
              size={18}
              mode="contained"
              onPress={handlePickAvatar}
              disabled={isUploading}
              style={styles.editAvatarBtn}
              containerColor="#1976D2"
              iconColor="#fff"
            />
          </View>
          <Text variant="headlineSmall" style={styles.userName}>{profile?.fullName || 'Cán bộ'}</Text>
          <View style={styles.roleBadge}>
            <Text variant="labelSmall" style={{ color: '#1976D2', fontWeight: 'bold' }}>
              {profile?.role === 'PROVINCE_OFFICER' ? 'Cán bộ Tỉnh' : profile?.role === 'WARD_OFFICER' ? 'Cán bộ Phường' : 'Quản trị viên'}
            </Text>
          </View>
        </View>

        {/* Detailed Info Card */}
        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={{ paddingVertical: 12 }}>
            <View style={styles.infoHeader}>
              <Text variant="titleMedium" style={{ fontWeight: '800', color: '#1a1a1a' }}>Thông tin chi tiết</Text>
              <Button mode="text" icon="pencil" onPress={handleOpenEdit} compact labelStyle={{ fontWeight: '700' }}>Sửa</Button>
            </View>
            <List.Item
              title="Số điện thoại"
              description={profile?.phone || 'Chưa cập nhật'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={props => <View style={styles.iconCircle}><List.Icon {...props} icon="phone" color="#1976D2" /></View>}
            />
            <List.Item
              title="Email"
              description={profile?.email || 'Chưa cập nhật'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={props => <View style={styles.iconCircle}><List.Icon {...props} icon="email" color="#1976D2" /></View>}
            />
            <List.Item
              title="Khu vực phụ trách"
              description={profile?.locationCode || 'Chưa cập nhật'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={props => <View style={styles.iconCircle}><List.Icon {...props} icon="map-marker" color="#1976D2" /></View>}
            />
          </Card.Content>
        </Card>

        <Button 
          mode="contained" 
          onPress={logout} 
          buttonColor="#D32F2F" 
          style={styles.logoutBtn} 
          contentStyle={{ height: 48 }}
          labelStyle={{ fontWeight: 'bold', letterSpacing: 1 }}
          icon="logout"
        >
          ĐĂNG XUẤT TÀI KHOẢN
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
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarSection: { 
    alignItems: 'center', 
    paddingVertical: 36, 
    backgroundColor: '#ffffff', 
    borderBottomLeftRadius: 32, 
    borderBottomRightRadius: 32, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    marginBottom: 20,
  },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatarBorder: { borderWidth: 3, borderColor: '#1976D2', backgroundColor: '#fff' },
  avatarPlaceholder: { backgroundColor: '#E3F2FD' },
  avatarOverlay: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  editAvatarBtn: { position: 'absolute', bottom: -4, right: -4, elevation: 3 },
  userName: { fontWeight: '900', color: '#1a1a1a', marginBottom: 6 },
  roleBadge: { backgroundColor: '#E3F2FD', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  
  infoCard: { backgroundColor: '#ffffff', marginHorizontal: 16, borderRadius: 20, marginBottom: 24, paddingVertical: 4 },
  infoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 12 },
  
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f4f8', justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  listTitle: { fontWeight: '700', color: '#424242', fontSize: 14 },
  listDesc: { color: '#757575', marginTop: 2, fontSize: 13 },
  
  logoutBtn: { marginHorizontal: 16, borderRadius: 16, marginTop: 8 },
  input: { marginBottom: 12, backgroundColor: '#fff' }
});
