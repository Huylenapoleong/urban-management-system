import { useAuth } from "@/providers/AuthProvider";
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Avatar,
  Button,
  Card,
  Dialog,
  IconButton,
  List,
  Portal,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile, useUpdateProfile, useUploadAvatar } from '@/hooks/shared/useProfile';
import { OtpVerificationModal } from '@/components/auth/OtpVerificationModal';

const CHAT_BUBBLE_SETTING_KEY = "citizen.chatBubble.enabled";

export default function ProfilePage() {
  const { 
    logout, 
    listSessions, 
    revokeSession, 
    requestChangePasswordOtp, 
    changePassword,
    requestDeactivateAccountOtp,
    deactivateAccount,
    requestDeleteAccountOtp,
    deleteAccount
  } = useAuth();
  const router = useRouter();
  const { data: profile, isLoading } = useProfile();
  const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile();
  const { mutateAsync: uploadAvatar, isPending: isUploading } = useUploadAvatar();

  const [editVisible, setEditVisible] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    phone: '',
    email: '',
  });

  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  
  const [otpModal, setOtpModal] = useState<{
    visible: boolean;
    type: 'PASSWORD' | 'DEACTIVATE' | 'DELETE' | null;
    title: string;
    subtitle: string;
  }>({
    visible: false,
    type: null,
    title: '',
    subtitle: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    passwordVisible: false,
    currentPassword: '',
    newPassword: '',
    verifiedOtp: '', // Store the OTP after verification
  });
  const [chatBubbleEnabled, setChatBubbleEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(CHAT_BUBBLE_SETTING_KEY)
      .then((value) => {
        if (value !== null) {
          setChatBubbleEnabled(value === "true");
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleChatBubble = async (enabled: boolean) => {
    setChatBubbleEnabled(enabled);
    await AsyncStorage.setItem(CHAT_BUBBLE_SETTING_KEY, String(enabled));
  };

  const fetchSessions = async () => {
    try {
      setLoadingSessions(true);
      const data = await listSessions();
      setSessions(data);
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  React.useEffect(() => {
    fetchSessions();
  }, []);

  const handleOpenEdit = () => {
    if (!profile) {
      return;
    }

    setEditForm({
      fullName: profile.fullName || '',
      phone: profile.phone || '',
      email: profile.email || '',
    });
    setEditVisible(true);
  };

  const handleSaveEdit = () => {
    updateProfile(editForm, {
      onSuccess: () => setEditVisible(false),
      onError: (err: any) => Alert.alert('Loi', `Khong the cap nhat ho so: ${err.message}`),
    });
  };

  const handlePickAvatar = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Cap quyen', 'Ban can cho phep truy cap anh de doi avatar.');
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
        updateProfile(
          { avatarUrl: uploadedUrl },
          {
            onError: (err: any) => Alert.alert('Loi', `Khong the luu avatar moi: ${err.message}`),
          },
        );
      } catch (err: any) {
        Alert.alert('Loi tai anh', `Xay ra loi khi tai anh len server: ${err.message}`);
      }
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Khong the tai ho so.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            {profile.avatarUrl ? (
              <Avatar.Image size={100} source={{ uri: profile.avatarUrl }} style={styles.avatarBorder} />
            ) : (
              <Avatar.Icon size={100} icon="account" style={styles.avatarPlaceholder} />
            )}
            {isUploading ? (
              <View style={[StyleSheet.absoluteFill, styles.avatarOverlay]}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
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
          <Text variant="headlineSmall" style={styles.userName}>
            {profile.fullName || 'Cong dan'}
          </Text>
          <View style={styles.roleBadge}>
            <Text variant="labelSmall" style={styles.roleBadgeText}>
              Cong dan
            </Text>
          </View>
        </View>

        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.infoHeader}>
              <Text variant="titleMedium" style={styles.infoTitle}>
                Thong tin chi tiet
              </Text>
              <Button mode="text" icon="pencil" onPress={handleOpenEdit} compact labelStyle={styles.editButtonLabel}>
                Sua
              </Button>
            </View>

            <List.Item
              title="So dien thoai"
              description={profile.phone || 'Chua cap nhat'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="phone" color="#1976D2" />
                </View>
              )}
            />
            <List.Item
              title="Email"
              description={profile.email || 'Chua cap nhat'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="email" color="#1976D2" />
                </View>
              )}
            />
            <List.Item
              title="Khu vuc"
              description={profile.locationCode || 'Chua cap nhat'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="map-marker" color="#1976D2" />
                </View>
              )}
            />
            <List.Item
              title="Ban be"
              description="Quan ly danh sach ban be va loi moi"
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              onPress={() => router.push('/(citizen)/friends' as any)}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="account-group" color="#1976D2" />
                </View>
              )}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
            />
            <List.Item
              title="Trang thai"
              description={profile.status || 'Chua cap nhat'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="shield-account" color="#1976D2" />
                </View>
              )}
            />
          </Card.Content>
        </Card>

        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={styles.infoTitle}>
              Setting
            </Text>
            <List.Item
              title="Hien bong bong chat"
              description="Bat de hien bong bong noi khi co tin nhan chua doc."
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="chat-processing" color="#1976D2" />
                </View>
              )}
              right={() => (
                <Switch
                  value={chatBubbleEnabled}
                  onValueChange={(value) => void handleToggleChatBubble(value)}
                />
              )}
            />
          </Card.Content>
        </Card>

        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.infoHeader}>
              <Text variant="titleMedium" style={styles.infoTitle}>Thiet bi dang dang nhap</Text>
              <Button mode="text" onPress={fetchSessions} loading={loadingSessions} compact>
                Lam moi
              </Button>
            </View>
            
            {sessions.map((session) => (
              <List.Item
                key={session.sessionId}
                title={session.userAgent || 'Thiet bi khong xac dinh'}
                description={`Lần cuối: ${new Date(session.lastUsedAt).toLocaleString('vi-VN')}${session.isCurrent ? ' (Hien tai)' : ''}`}
                titleStyle={[styles.listTitle, session.isCurrent && { color: '#1976D2' }]}
                descriptionStyle={styles.listDesc}
                left={(props) => <List.Icon {...props} icon="cellphone" />}
                right={(props) => !session.isCurrent ? (
                  <IconButton 
                    {...props} 
                    icon="logout-variant" 
                    onPress={() => {
                      Alert.alert('Xac nhan', 'Ban muon dang xuat thiet bi nay?', [
                        { text: 'Huy', style: 'cancel' },
                        { 
                          text: 'Dang xuat', 
                          onPress: async () => {
                            await revokeSession(session.sessionId);
                            fetchSessions();
                          }
                        }
                      ]);
                    }}
                  />
                ) : null}
              />
            ))}
          </Card.Content>
        </Card>

        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={[styles.infoTitle, { paddingHorizontal: 12, marginBottom: 8 }]}>
              An toan tai khoan
            </Text>
            
            <List.Item
              title="Doi mat khau"
              onPress={async () => {
                try {
                  await requestChangePasswordOtp();
                  setOtpModal({
                    visible: true,
                    type: 'PASSWORD',
                    title: 'Doi mat khau',
                    subtitle: 'Vui long nhap ma OTP de tiep tuc doi mat khau.',
                  });
                } catch (err: any) {
                  Alert.alert('Loi', err.message);
                }
              }}
              left={(props) => <List.Icon {...props} icon="lock-reset" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
            />

            <List.Item
              title="Tam khoa tai khoan"
              titleStyle={{ color: '#ff9800' }}
              onPress={async () => {
                try {
                  await requestDeactivateAccountOtp();
                  setOtpModal({
                    visible: true,
                    type: 'DEACTIVATE',
                    title: 'Tam khoa tai khoan',
                    subtitle: 'Vui long nhap ma OTP de tam khoa tai khoan.',
                  });
                } catch (err: any) {
                  Alert.alert('Loi', err.message);
                }
              }}
              left={(props) => <List.Icon {...props} icon="account-off-outline" color="#ff9800" />}
            />

            <List.Item
              title="Xoa tai khoan vinh vien"
              titleStyle={{ color: '#D32F2F' }}
              onPress={async () => {
                try {
                  await requestDeleteAccountOtp();
                  setOtpModal({
                    visible: true,
                    type: 'DELETE',
                    title: 'Xoa tai khoan',
                    subtitle: 'CANH BAO: Hanh dong nay khong the hoan tac. Nhap mã OTP de xac nhan xoa.',
                  });
                } catch (err: any) {
                  Alert.alert('Loi', err.message);
                }
              }}
              left={(props) => <List.Icon {...props} icon="account-remove-outline" color="#D32F2F" />}
            />
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={() => void logout()}
          buttonColor="#D32F2F"
          style={styles.logoutBtn}
          contentStyle={styles.logoutContent}
          labelStyle={styles.logoutLabel}
          icon="logout"
        >
          DANG XUAT TAI KHOAN
        </Button>
      </ScrollView>

      <Portal>
        <Dialog visible={editVisible} onDismiss={() => setEditVisible(false)}>
          <Dialog.Title>Cap nhat ho so</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Ho va ten"
              value={editForm.fullName}
              onChangeText={(val) => setEditForm((prev) => ({ ...prev, fullName: val }))}
              style={styles.input}
              mode="outlined"
            />
            <TextInput
              label="So dien thoai"
              value={editForm.phone}
              onChangeText={(val) => setEditForm((prev) => ({ ...prev, phone: val }))}
              style={styles.input}
              mode="outlined"
              keyboardType="phone-pad"
            />
            <TextInput
              label="Email"
              value={editForm.email}
              onChangeText={(val) => setEditForm((prev) => ({ ...prev, email: val }))}
              style={styles.input}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.locationHint}>{`Ma khu vuc hien tai: ${profile.locationCode}`}</Text>
            <Text style={styles.locationSubHint}>Cong dan khong thay doi khu vuc trong ung dung.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditVisible(false)}>Huy</Button>
            <Button mode="contained" onPress={handleSaveEdit} loading={isUpdating}>
              Luu thay doi
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={passwordForm.passwordVisible} onDismiss={() => setPasswordForm(p => ({ ...p, passwordVisible: false }))}>
          <Dialog.Title>Nhap mat khau moi</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Mat khau hien tai"
              secureTextEntry
              value={passwordForm.currentPassword}
              onChangeText={val => setPasswordForm(p => ({ ...p, currentPassword: val }))}
              style={styles.input}
            />
            <TextInput
              label="Mat khau moi"
              secureTextEntry
              value={passwordForm.newPassword}
              onChangeText={val => setPasswordForm(p => ({ ...p, newPassword: val }))}
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPasswordForm(p => ({ ...p, passwordVisible: false }))}>Huy</Button>
            <Button mode="contained" onPress={async () => {
              if (passwordForm.newPassword.length < 10) {
                Alert.alert('Loi', 'Mat khau moi phai co it nhat 10 ky tu.');
                return;
              }
              try {
                await changePassword({ 
                  currentPassword: passwordForm.currentPassword, 
                  newPassword: passwordForm.newPassword,
                  otpCode: passwordForm.verifiedOtp
                });
                Alert.alert('Thanh cong', 'Mat khau da duoc thay doi.');
                setPasswordForm({ passwordVisible: false, currentPassword: '', newPassword: '', verifiedOtp: '' });
              } catch (err: any) {
                Alert.alert('Loi', err.message);
              }
            }}>Cap nhat</Button>
          </Dialog.Actions>
        </Dialog>

        <OtpVerificationModal
          visible={otpModal.visible}
          onDismiss={() => setOtpModal(p => ({ ...p, visible: false }))}
          title={otpModal.title}
          subtitle={otpModal.subtitle}
          onVerify={async (otpCode) => {
            if (otpModal.type === 'PASSWORD') {
              setPasswordForm(p => ({ ...p, verifiedOtp: otpCode, passwordVisible: true }));
              setOtpModal(p => ({ ...p, visible: false }));
            } else if (otpModal.type === 'DEACTIVATE') {
              await deactivateAccount(otpCode);
              setOtpModal(p => ({ ...p, visible: false }));
              logout();
            } else if (otpModal.type === 'DELETE') {
              await deleteAccount(otpCode);
              setOtpModal(p => ({ ...p, visible: false }));
              logout();
            }
          }}
        />
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
  },
  emptyText: {
    color: '#d32f2f',
  },
  scrollContent: {
    paddingBottom: 32,
  },
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
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarBorder: {
    borderWidth: 3,
    borderColor: '#1976D2',
    backgroundColor: '#fff',
  },
  avatarPlaceholder: {
    backgroundColor: '#E3F2FD',
  },
  avatarOverlay: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    elevation: 3,
  },
  userName: {
    fontWeight: '900',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  roleBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    color: '#1976D2',
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    borderRadius: 20,
    marginBottom: 24,
    paddingVertical: 4,
  },
  cardContent: {
    paddingVertical: 12,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  infoTitle: {
    fontWeight: '800',
    color: '#1a1a1a',
  },
  editButtonLabel: {
    fontWeight: '700',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f4f8',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  listTitle: {
    fontWeight: '700',
    color: '#424242',
    fontSize: 14,
  },
  listDesc: {
    color: '#757575',
    marginTop: 2,
    fontSize: 13,
  },
  logoutBtn: {
    marginHorizontal: 16,
    borderRadius: 16,
    marginTop: 8,
  },
  logoutContent: {
    height: 48,
  },
  logoutLabel: {
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  locationHint: {
    color: '#344054',
    fontWeight: '600',
  },
  locationSubHint: {
    color: '#667085',
    marginTop: 4,
    fontSize: 12,
  },
});
