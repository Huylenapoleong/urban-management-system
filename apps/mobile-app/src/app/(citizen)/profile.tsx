import { useAuth } from "@/providers/AuthProvider";
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import {
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
import * as SecureStore from 'expo-secure-store';
import {
  useAvatarLibrary,
  useDeleteAvatarFile,
  useProfile,
  useRemoveCurrentAvatar,
  useSetCurrentAvatar,
  useUpdateProfile,
  useUploadAvatar,
} from '@/hooks/shared/useProfile';
import { OtpVerificationModal } from '@/components/auth/OtpVerificationModal';
import { convertToS3Url } from '@/constants/s3';
import colors from '@/constants/colors';
import { ListSkeleton, Skeleton, SkeletonProfile } from '@/components/skeleton/Skeleton';
import { readTempCache, writeTempCache } from '@/lib/page-temp-cache';

const CHAT_BUBBLE_SETTING_KEY = "citizen.chatBubble.enabled";
const PROFILE_SESSIONS_CACHE_KEY = 'citizen.profile.sessions';
const PROFILE_SESSIONS_CACHE_TTL_MS = 60 * 1000;
const GENERATED_PASSWORD_STORAGE_KEY = 'citizen.generatedPassword.latest';

async function readChatBubbleSetting(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CHAT_BUBBLE_SETTING_KEY);
  } catch {
    return null;
  }
}

async function writeChatBubbleSetting(value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(CHAT_BUBBLE_SETTING_KEY, value);
  } catch {
    // Keep UX resilient when storage is unavailable.
  }
}

function validateNewPassword(currentPassword: string, newPassword: string): string | null {
  if (!currentPassword.trim()) {
    return 'Vui lòng nhập mật khẩu hiện tại.';
  }

  if (!newPassword.trim()) {
    return 'Vui lòng nhập mật khẩu mới.';
  }

  if (newPassword.length < 10 || newPassword.length > 64) {
    return 'Mật khẩu mới phải có từ 10 đến 64 ký tự.';
  }

  if (/\s/.test(newPassword)) {
    return 'Mật khẩu mới không được chứa khoảng trắng.';
  }

  if (/(.)\1{3,}/.test(newPassword)) {
    return 'Mật khẩu mới không được lặp cùng 1 ký tự quá 3 lần liên tiếp.';
  }

  const hasLowercase = /[a-z]/.test(newPassword);
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasDigit = /\d/.test(newPassword);
  const hasSymbol = /[^A-Za-z0-9]/.test(newPassword);
  const classCount = [hasLowercase, hasUppercase, hasDigit, hasSymbol].filter(Boolean).length;

  if (classCount < 3) {
    return 'Mật khẩu mới cần có ít nhất 3 trong 4 nhóm: chữ hoa, chữ thường, số, ký tự đặc biệt.';
  }

  if (newPassword === currentPassword) {
    return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  }

  return null;
}

function translatePasswordChangeError(rawMessage: string | undefined): string {
  const message = (rawMessage || '').trim();
  const normalized = message.toLowerCase();

  if (!message) {
    return 'Không thể đổi mật khẩu. Vui lòng thử lại.';
  }

  if (normalized.includes('current password is invalid')) {
    return 'Mật khẩu hiện tại không đúng.';
  }

  if (normalized.includes('newpassword must be different from the current password')) {
    return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  }

  if (normalized.includes('password must be between')) {
    return 'Mật khẩu mới phải có từ 10 đến 64 ký tự.';
  }

  if (normalized.includes('password must not contain whitespace')) {
    return 'Mật khẩu mới không được chứa khoảng trắng.';
  }

  if (normalized.includes('password must not contain repeated characters')) {
    return 'Mật khẩu mới không được lặp cùng 1 ký tự quá 3 lần liên tiếp.';
  }

  if (normalized.includes('password must include at least') && normalized.includes('uppercase')) {
    return 'Mật khẩu mới cần có ít nhất 3 trong 4 nhóm: chữ hoa, chữ thường, số, ký tự đặc biệt.';
  }

  if (normalized.includes('password must include at least one special character')) {
    return 'Mật khẩu mới phải có ít nhất 1 ký tự đặc biệt.';
  }

  if (normalized.includes('password is too common or predictable')) {
    return 'Mật khẩu mới quá phổ biến hoặc dễ đoán. Vui lòng chọn mật khẩu mạnh hơn.';
  }

  if (normalized.includes('password must not contain your personal account information')) {
    return 'Mật khẩu mới không được chứa thông tin cá nhân (tên, email, số điện thoại).';
  }

  if (normalized.includes('otp') && normalized.includes('expired')) {
    return 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.';
  }

  if (normalized.includes('otp') && normalized.includes('invalid')) {
    return 'Mã OTP không hợp lệ. Vui lòng kiểm tra lại.';
  }

  return message;
}

function generateStrongPassword(length = 14): string {
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '@#$%&*!?';
  const allChars = lowercase + uppercase + digits + symbols;

  const pick = (charset: string) => charset[Math.floor(Math.random() * charset.length)];
  const base = [pick(lowercase), pick(uppercase), pick(digits), pick(symbols)];

  for (let i = base.length; i < length; i += 1) {
    base.push(pick(allChars));
  }

  for (let i = base.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }

  return base.join('');
}

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
  const { data: avatarLibrary = [], isLoading: isLoadingAvatarLibrary, refetch: refetchAvatarLibrary } = useAvatarLibrary();
  const { mutateAsync: setCurrentAvatar, isPending: isSettingAvatar } = useSetCurrentAvatar();
  const { mutateAsync: removeCurrentAvatar, isPending: isRemovingAvatar } = useRemoveCurrentAvatar();
  const { mutateAsync: deleteAvatarFile, isPending: isDeletingAvatarFile } = useDeleteAvatarFile();

  const [editVisible, setEditVisible] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    phone: '',
    email: '',
  });

  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  
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
    showCurrentPassword: false,
    showNewPassword: false,
    currentPassword: '',
    newPassword: '',
    generatedPassword: '',
    verifiedOtp: '', // Store the OTP after verification
  });
    const handleGeneratePassword = () => {
      const generated = generateStrongPassword();
      setPasswordForm((prev) => ({
        ...prev,
        newPassword: generated,
        generatedPassword: generated,
        showNewPassword: true,
      }));
      Alert.alert('Đã tạo mật khẩu', 'Đã tự tạo mật khẩu mạnh và điền vào ô mật khẩu mới.');
    };

    const handleCopyGeneratedPassword = async () => {
      const value = passwordForm.generatedPassword || passwordForm.newPassword;
      if (!value) {
        Alert.alert('Cảnh báo', 'Chưa có mật khẩu để sao chép. Vui lòng bấm Tạo mật khẩu trước.');
        return;
      }

      try {
        const clipboard =
          typeof navigator !== 'undefined' && (navigator as any).clipboard
            ? (navigator as any).clipboard
            : null;

        if (clipboard?.writeText) {
          await clipboard.writeText(value);
          Alert.alert('Thành công', 'Đã sao chép mật khẩu vào clipboard.');
          return;
        }

        await Share.share({ message: `Mật khẩu mới: ${value}` });
        Alert.alert('Thông báo', 'Thiết bị không hỗ trợ copy trực tiếp. Đã mở chia sẻ để bạn lưu mật khẩu.');
      } catch {
        Alert.alert('Lỗi', 'Không thể sao chép mật khẩu. Vui lòng thử lại.');
      }
    };

    const handleSaveGeneratedPassword = async () => {
      const value = passwordForm.generatedPassword || passwordForm.newPassword;
      if (!value) {
        Alert.alert('Cảnh báo', 'Chưa có mật khẩu để lưu. Vui lòng bấm Tạo mật khẩu trước.');
        return;
      }

      try {
        await SecureStore.setItemAsync(
          GENERATED_PASSWORD_STORAGE_KEY,
          JSON.stringify({ value, savedAt: new Date().toISOString() }),
        );
        Alert.alert('Thành công', 'Đã lưu mật khẩu tạm trên thiết bị (SecureStore).');
      } catch {
        Alert.alert('Lỗi', 'Không thể lưu mật khẩu trên thiết bị.');
      }
    };

  const [chatBubbleEnabled, setChatBubbleEnabled] = useState(true);
  const [avatarLibraryVisible, setAvatarLibraryVisible] = useState(false);

  const profileAvatarUrl =
    (profile?.avatarAsset?.resolvedUrl && convertToS3Url(profile.avatarAsset.resolvedUrl)) ||
    (profile?.avatarUrl ? convertToS3Url(profile.avatarUrl) : undefined);
  const currentAvatarKey = profile?.avatarAsset?.key || profile?.avatarKey || undefined;

  useEffect(() => {
    readChatBubbleSetting()
      .then((value) => {
        if (value !== null) {
          setChatBubbleEnabled(value === "true");
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleChatBubble = async (enabled: boolean) => {
    setChatBubbleEnabled(enabled);
    await writeChatBubbleSetting(String(enabled));
  };

  const fetchSessions = async (signal?: AbortSignal) => {
    try {
      setLoadingSessions(true);
      const data = await listSessions({ signal });
      setSessions(data);
      writeTempCache(PROFILE_SESSIONS_CACHE_KEY, data);
      setShowAllSessions(false);
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const displayedSessions = showAllSessions ? sessions : sessions.slice(0, 3);

  React.useEffect(() => {
    const cached = readTempCache<any[]>(PROFILE_SESSIONS_CACHE_KEY, PROFILE_SESSIONS_CACHE_TTL_MS);
    if (cached) {
      setSessions(cached);
      setShowAllSessions(false);
      setLoadingSessions(false);
    }

    const controller = new AbortController();
    void fetchSessions(controller.signal);

    return () => {
      controller.abort();
    };
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
      onError: (err: any) => Alert.alert('Lỗi', `Không thể cập nhật hồ sơ: ${err.message}`),
    });
  };

  const handlePickAvatar = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
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
        updateProfile(
          { avatarKey: uploadedAsset.key },
          {
            onError: (err: any) => Alert.alert('Lỗi', `Không thể lưu avatar mới: ${err.message}`),
          },
        );
      } catch (err: any) {
        Alert.alert('Lỗi tải ảnh', `Xảy ra lỗi khi tải ảnh lên server: ${err.message}`);
      }
    }
  };

  const handleSetCurrentAvatar = async (key: string) => {
    try {
      await setCurrentAvatar(key);
      Alert.alert('Thành công', 'Đã cập nhật avatar hiện tại.');
    } catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Không thể cập nhật avatar.');
    }
  };

  const handleRemoveCurrentAvatar = async () => {
    Alert.alert('Xác nhận', 'Bạn muốn gỡ avatar hiện tại khỏi hồ sơ?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đồng ý',
        onPress: async () => {
          try {
            await removeCurrentAvatar();
            Alert.alert('Thành công', 'Đã gỡ avatar hiện tại.');
          } catch (err: any) {
            Alert.alert('Lỗi', err?.message || 'Không thể gỡ avatar hiện tại.');
          }
        },
      },
    ]);
  };

  const handleDeleteAvatarFile = async (key: string, isCurrent: boolean) => {
    if (isCurrent) {
      Alert.alert('Thông báo', 'Không thể xóa file avatar đang sử dụng.');
      return;
    }

    Alert.alert('Xác nhận', 'Bạn muốn xóa hẳn file avatar này khỏi thư viện?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAvatarFile(key);
            await refetchAvatarLibrary();
          } catch (err: any) {
            Alert.alert('Lỗi', err?.message || 'Không thể xóa file avatar.');
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <SkeletonProfile />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Không thể tải hồ sơ.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            {profileAvatarUrl ? (
              <Avatar.Image size={100} source={{ uri: profileAvatarUrl }} style={styles.avatarBorder} />
            ) : (
              <Avatar.Icon size={100} icon="account" style={styles.avatarPlaceholder} />
            )}
            {isUploading ? (
              <View style={[StyleSheet.absoluteFill, styles.avatarOverlay]}>
                <Skeleton width={28} height={28} radius={14} />
              </View>
            ) : null}
            <IconButton
              icon="camera"
              size={18}
              mode="contained"
              onPress={handlePickAvatar}
              disabled={isUploading}
              style={styles.editAvatarBtn}
              containerColor={colors.secondary}
              iconColor="#fff"
            />
          </View>
          <Text variant="headlineSmall" style={styles.userName}>
            {profile.fullName || 'Công dân'}
          </Text>
          <View style={styles.roleBadge}>
            <Text variant="labelSmall" style={styles.roleBadgeText}>
              Công dân
            </Text>
          </View>
        </View>

        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.infoHeader}>
              <Text variant="titleMedium" style={styles.infoTitle}>
                Thông tin chi tiết
              </Text>
              <Button mode="text" icon="pencil" onPress={handleOpenEdit} compact labelStyle={styles.editButtonLabel}>
                Sửa
              </Button>
            </View>

            <List.Item
              title="Số điện thoại"
              description={profile.phone || 'Chưa cập nhật'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="phone" color={colors.secondary} />
                </View>
              )}
            />
            <List.Item
              title="Email"
              description={profile.email || 'Chưa cập nhật'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="email" color={colors.secondary} />
                </View>
              )}
            />
            <List.Item
              title="Khu vực"
              description={profile.locationCode || 'Chưa cập nhật'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="map-marker" color={colors.secondary} />
                </View>
              )}
            />
            <List.Item
              title="Bạn bè"
              description="Quản lý danh sách bạn bè và lời mời"
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              onPress={() => router.push('/(citizen)/friends' as any)}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="account-group" color={colors.secondary} />
                </View>
              )}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
            />
            <List.Item
              title="Trạng thái"
              description={profile.status || 'Chưa cập nhật'}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="shield-account" color={colors.secondary} />
                </View>
              )}
            />
          </Card.Content>
        </Card>

        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={styles.infoTitle}>
              Cài đặt
            </Text>
            <List.Item
              title="Hiện bong bóng chat"
              description="Bật để hiện bong bóng nổi khi có tin nhắn chưa đọc."
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="chat-processing" color={colors.secondary} />
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
            <Text variant="titleMedium" style={styles.infoTitle}>Quản lý avatar</Text>
            <List.Item
              title="Thư viện avatar"
              description="Xem avatar đã upload, đặt avatar cũ hoặc xóa file không dùng."
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              onPress={() => setAvatarLibraryVisible(true)}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="image-multiple" color={colors.secondary} />
                </View>
              )}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
            />

            <Button
              mode="outlined"
              icon="account-off-outline"
              onPress={handleRemoveCurrentAvatar}
              disabled={isRemovingAvatar || !currentAvatarKey}
              style={styles.avatarActionButton}
            >
              Gỡ avatar hiện tại
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.infoHeader}>
              <Text variant="titleMedium" style={styles.infoTitle}>Thiết bị đang đăng nhập</Text>
              <Button mode="text" onPress={() => void fetchSessions()} disabled={loadingSessions} compact>
                Làm mới
              </Button>
            </View>
            
            {displayedSessions.map((session) => (
              <List.Item
                key={session.sessionId}
                title={session.userAgent || 'Thiết bị không xác định'}
                description={`Lần cuối: ${new Date(session.lastUsedAt).toLocaleString('vi-VN')}${session.isCurrent ? ' (Hiện tại)' : ''}`}
                titleStyle={[styles.listTitle, session.isCurrent && { color: colors.secondary }]}
                descriptionStyle={styles.listDesc}
                left={(props) => <List.Icon {...props} icon="cellphone" />}
                right={(props) => !session.isCurrent ? (
                  <IconButton 
                    {...props} 
                    icon="logout-variant" 
                    onPress={() => {
                      Alert.alert('Xác nhận', 'Bạn muốn đăng xuất thiết bị này?', [
                        { text: 'Hủy', style: 'cancel' },
                        { 
                          text: 'Đăng xuất', 
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

            {!showAllSessions && sessions.length > 3 ? (
              <Button
                mode="text"
                compact
                onPress={() => setShowAllSessions(true)}
              >
                Xem thêm ({sessions.length - 3})
              </Button>
            ) : null}
          </Card.Content>
        </Card>

        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={styles.cardContent}>
            <Text variant="titleMedium" style={[styles.infoTitle, { paddingHorizontal: 12, marginBottom: 8 }]}>
              An toàn tài khoản
            </Text>
            
            <List.Item
              title="Đổi mật khẩu"
              onPress={async () => {
                try {
                  await requestChangePasswordOtp();
                  setOtpModal({
                    visible: true,
                    type: 'PASSWORD',
                    title: 'Đổi mật khẩu',
                    subtitle: 'Vui lòng nhập mã OTP để tiếp tục đổi mật khẩu.',
                  });
                } catch (err: any) {
                  Alert.alert('Lỗi', err.message);
                }
              }}
              left={(props) => <List.Icon {...props} icon="lock-reset" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
            />

            <List.Item
              title="Tạm khóa tài khoản"
              titleStyle={{ color: '#ff9800' }}
              onPress={async () => {
                try {
                  await requestDeactivateAccountOtp();
                  setOtpModal({
                    visible: true,
                    type: 'DEACTIVATE',
                    title: 'Tạm khóa tài khoản',
                    subtitle: 'Vui lòng nhập mã OTP để tạm khóa tài khoản.',
                  });
                } catch (err: any) {
                  Alert.alert('Lỗi', err.message);
                }
              }}
              left={(props) => <List.Icon {...props} icon="account-off-outline" color="#ff9800" />}
            />

            <List.Item
              title="Xóa tài khoản vĩnh viễn"
              titleStyle={{ color: '#D32F2F' }}
              onPress={async () => {
                try {
                  await requestDeleteAccountOtp();
                  setOtpModal({
                    visible: true,
                    type: 'DELETE',
                    title: 'Xóa tài khoản',
                    subtitle: 'CẢNH BÁO: Hành động này không thể hoàn tác. Nhập mã OTP để xác nhận xóa.',
                  });
                } catch (err: any) {
                  Alert.alert('Lỗi', err.message);
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
              onChangeText={(val) => setEditForm((prev) => ({ ...prev, fullName: val }))}
              style={styles.input}
              mode="outlined"
            />
            <TextInput
              label="Số điện thoại"
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
            <Text style={styles.locationHint}>{`Mã khu vực hiện tại: ${profile.locationCode}`}</Text>
            <Text style={styles.locationSubHint}>Công dân không thay đổi khu vực trong ứng dụng.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditVisible(false)}>Hủy</Button>
            <Button mode="contained" onPress={handleSaveEdit} disabled={isUpdating}>
              Lưu thay đổi
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={passwordForm.passwordVisible} onDismiss={() => setPasswordForm(p => ({ ...p, passwordVisible: false }))}>
          <Dialog.Title>Nhập mật khẩu mới</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.passwordHintTitle}>Yêu cầu mật khẩu mới:</Text>
            <Text style={styles.passwordHint}>- Từ 10 đến 64 ký tự</Text>
            <Text style={styles.passwordHint}>- Không chứa khoảng trắng, không lặp cùng 1 ký tự quá 3 lần liên tiếp</Text>
            <Text style={styles.passwordHint}>- Có ít nhất 3 trong 4 nhóm: chữ hoa, chữ thường, số, ký tự đặc biệt</Text>
            <Text style={styles.passwordHintLast}>- Phải khác mật khẩu hiện tại</Text>
            <TextInput
              label="Mật khẩu hiện tại"
              secureTextEntry={!passwordForm.showCurrentPassword}
              value={passwordForm.currentPassword}
              onChangeText={val => setPasswordForm(p => ({ ...p, currentPassword: val }))}
              style={styles.input}
              right={
                <TextInput.Icon
                  icon={passwordForm.showCurrentPassword ? 'eye-off' : 'eye'}
                  onPress={() => setPasswordForm(p => ({ ...p, showCurrentPassword: !p.showCurrentPassword }))}
                />
              }
            />
            <TextInput
              label="Mật khẩu mới"
              secureTextEntry={!passwordForm.showNewPassword}
              value={passwordForm.newPassword}
              onChangeText={val => setPasswordForm(p => ({ ...p, newPassword: val }))}
              style={styles.input}
              right={
                <TextInput.Icon
                  icon={passwordForm.showNewPassword ? 'eye-off' : 'eye'}
                  onPress={() => setPasswordForm(p => ({ ...p, showNewPassword: !p.showNewPassword }))}
                />
              }
            />
            <View style={styles.passwordActionsRow}>
              <Button mode="outlined" compact icon="auto-fix" onPress={handleGeneratePassword}>
                Tạo mật khẩu
              </Button>
              <Button mode="outlined" compact icon="content-copy" onPress={() => void handleCopyGeneratedPassword()}>
                Copy
              </Button>
              <Button mode="outlined" compact icon="content-save-outline" onPress={() => void handleSaveGeneratedPassword()}>
                Lưu
              </Button>
            </View>
            {passwordForm.generatedPassword ? (
              <Text style={styles.passwordGeneratedNote}>Đã tạo mật khẩu tự động. Bạn có thể Copy hoặc Lưu để tránh quên.</Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPasswordForm(p => ({ ...p, passwordVisible: false }))}>Hủy</Button>
            <Button mode="contained" onPress={async () => {
              const validationMessage = validateNewPassword(passwordForm.currentPassword, passwordForm.newPassword);
              if (validationMessage) {
                Alert.alert('Cảnh báo', validationMessage);
                return;
              }
              try {
                await changePassword({ 
                  currentPassword: passwordForm.currentPassword, 
                  newPassword: passwordForm.newPassword,
                  otpCode: passwordForm.verifiedOtp
                });
                Alert.alert('Thành công', 'Mật khẩu đã được thay đổi.');
                setPasswordForm({
                  passwordVisible: false,
                  showCurrentPassword: false,
                  showNewPassword: false,
                  currentPassword: '',
                  newPassword: '',
                  generatedPassword: '',
                  verifiedOtp: '',
                });
              } catch (err: any) {
                Alert.alert('Lỗi', translatePasswordChangeError(err?.message));
              }
            }}>Cập nhật</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={avatarLibraryVisible} onDismiss={() => setAvatarLibraryVisible(false)}>
          <Dialog.Title>Thư viện avatar</Dialog.Title>
          <Dialog.Content>
            {isLoadingAvatarLibrary ? (
              <ListSkeleton count={4} />
            ) : avatarLibrary.length === 0 ? (
              <Text style={styles.listDesc}>Chưa có avatar nào trong thư viện.</Text>
            ) : (
              <ScrollView style={styles.avatarLibraryList}>
                {avatarLibrary.map((asset: any) => {
                  const avatarUrl = asset?.url ? convertToS3Url(asset.url) : undefined;
                  const isCurrent = Boolean(currentAvatarKey && asset?.key === currentAvatarKey);

                  return (
                    <View key={asset.key} style={styles.avatarLibraryRow}>
                      {avatarUrl ? (
                        <Avatar.Image size={44} source={{ uri: avatarUrl }} />
                      ) : (
                        <Avatar.Icon size={44} icon="account" style={styles.avatarPlaceholder} />
                      )}
                      <View style={styles.avatarLibraryMeta}>
                        <Text numberOfLines={1} style={styles.avatarLibraryFile}>{asset.originalFileName || asset.fileName || asset.key}</Text>
                        <Text style={styles.avatarLibrarySub}>{isCurrent ? 'Đang sử dụng' : 'Có thể đặt làm avatar hiện tại'}</Text>
                      </View>
                      <View style={styles.avatarLibraryActions}>
                        <Button
                          compact
                          mode={isCurrent ? 'contained' : 'text'}
                          disabled={isCurrent || isSettingAvatar}
                          onPress={() => void handleSetCurrentAvatar(asset.key)}
                        >
                          {isCurrent ? 'Đang dùng' : 'Dùng ảnh này'}
                        </Button>
                        <Button
                          compact
                          mode="text"
                          textColor="#D32F2F"
                          disabled={isCurrent || isDeletingAvatarFile}
                          onPress={() => void handleDeleteAvatarFile(asset.key, isCurrent)}
                        >
                          Xóa file
                        </Button>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => void refetchAvatarLibrary()}>Làm mới</Button>
            <Button onPress={() => setAvatarLibraryVisible(false)}>Đóng</Button>
          </Dialog.Actions>
        </Dialog>

        <OtpVerificationModal
          visible={otpModal.visible}
          onDismiss={() => setOtpModal(p => ({ ...p, visible: false }))}
          title={otpModal.title}
          subtitle={otpModal.subtitle}
          onVerify={async (otpCode) => {
            if (otpModal.type === 'PASSWORD') {
              setPasswordForm(p => ({
                ...p,
                verifiedOtp: otpCode,
                passwordVisible: true,
                showCurrentPassword: false,
                showNewPassword: false,
                generatedPassword: '',
              }));
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
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
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
    backgroundColor: colors.card,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    elevation: 3,
    shadowColor: colors.shadow,
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
    borderColor: colors.secondary,
    backgroundColor: colors.card,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(73,90,255,0.12)',
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
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  roleBadge: {
    backgroundColor: 'rgba(73,90,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    color: colors.secondary,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: colors.card,
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
    fontWeight: '700',
    color: colors.text,
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
    color: colors.text,
    fontSize: 14,
  },
  listDesc: {
    color: colors.textSecondary,
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
    fontWeight: '700',
    letterSpacing: 1,
  },
  input: {
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  avatarActionButton: {
    marginHorizontal: 12,
    marginTop: 8,
  },
  avatarLibraryList: {
    maxHeight: 360,
  },
  avatarLibraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eceff1',
  },
  avatarLibraryMeta: {
    flex: 1,
    marginLeft: 10,
  },
  avatarLibraryFile: {
    fontWeight: '600',
    color: '#263238',
    fontSize: 13,
  },
  avatarLibrarySub: {
    color: '#607d8b',
    fontSize: 12,
    marginTop: 2,
  },
  avatarLibraryActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
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
  passwordHintTitle: {
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    fontSize: 13,
  },
  passwordHint: {
    color: '#475569',
    fontSize: 12,
    marginBottom: 3,
  },
  passwordHintLast: {
    color: '#475569',
    fontSize: 12,
    marginBottom: 10,
  },
  passwordActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 8,
  },
  passwordGeneratedNote: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 4,
  },
});
