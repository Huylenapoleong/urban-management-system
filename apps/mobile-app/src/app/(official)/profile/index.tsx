import {
  ListSkeleton,
  Skeleton,
  SkeletonProfile,
} from "@/components/skeleton/Skeleton";
import colors from "@/constants/colors";
import {
  getResolvedLocationLabel,
  useResolvedLocations,
} from "@/hooks/shared/useResolvedLocations";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import {
  Avatar,
  Button,
  Card,
  Dialog,
  IconButton,
  List,
  Portal,
  Text,
  TextInput,
} from "react-native-paper";
import { convertToS3Url } from "../../../constants/s3";
import {
  useAvatarLibrary,
  useDeleteAvatarFile,
  useProfile,
  useRemoveCurrentAvatar,
  useSetCurrentAvatar,
  useUpdateProfile,
  useUploadAvatar,
} from "../../../hooks/shared/useProfile";
import { useAuth } from "../../../providers/AuthProvider";

export default function ProfileScreen() {
  const { logout } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile();
  const { mutateAsync: uploadAvatar, isPending: isUploading } =
    useUploadAvatar();
  const {
    data: avatarLibrary = [],
    isLoading: isLoadingAvatarLibrary,
    refetch: refetchAvatarLibrary,
  } = useAvatarLibrary();
  const { mutateAsync: setCurrentAvatar, isPending: isSettingAvatar } =
    useSetCurrentAvatar();
  const { mutateAsync: removeCurrentAvatar, isPending: isRemovingAvatar } =
    useRemoveCurrentAvatar();
  const { mutateAsync: deleteAvatarFile, isPending: isDeletingAvatarFile } =
    useDeleteAvatarFile();
  const [editVisible, setEditVisible] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    locationCode: "",
  });
  const [avatarLibraryVisible, setAvatarLibraryVisible] = useState(false);

  const profileAvatarUrl =
    (profile?.avatarAsset?.resolvedUrl &&
      convertToS3Url(profile.avatarAsset.resolvedUrl)) ||
    (profile?.avatarUrl ? convertToS3Url(profile.avatarUrl) : undefined);
  const currentAvatarKey =
    profile?.avatarAsset?.key || profile?.avatarKey || undefined;
  const { data: locationMap } = useResolvedLocations([profile?.locationCode]);
  const locationLabel = getResolvedLocationLabel(
    locationMap,
    profile?.locationCode,
  );

  const handleOpenEdit = () => {
    if (profile) {
      setEditForm({
        fullName: profile.fullName || "",
        phone: profile.phone || "",
        email: profile.email || "",
        locationCode: profile.locationCode || "",
      });
      setEditVisible(true);
    }
  };

  const handleSaveEdit = () => {
    updateProfile(editForm, {
      onSuccess: () => setEditVisible(false),
      onError: (err: any) =>
        Alert.alert(
          "Lỗi",
          "Không thể cập nhật hồ sơ: " + err.message,
        ),
    });
  };

  const handlePickAvatar = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    // Using image picker requires permission
    if (permissionResult.granted === false) {
      Alert.alert(
        "Cấp quyền",
        "Bạn cần cho phép truy cập ảnh để đổi avatar.",
      );
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
            onError: (err: any) =>
              Alert.alert(
                "Lỗi",
                "Không thể lưu avatar mới: " + err.message,
              ),
          },
        );
      } catch (err: any) {
        Alert.alert(
          "Lỗi tải ảnh",
          "Xảy ra lỗi khi tải ảnh lên server: " + err.message,
        );
      }
    }
  };

  const handleSetCurrentAvatar = async (key: string) => {
    try {
      await setCurrentAvatar(key);
      Alert.alert("Thành công", "Đã cập nhật avatar hiện tại.");
    } catch (err: any) {
      Alert.alert("Lỗi", err?.message || "Không thể cập nhật avatar.");
    }
  };

  const handleRemoveCurrentAvatar = async () => {
    Alert.alert(
      "Xác nhận",
      "Bạn muốn gỡ avatar hiện tại khỏi hồ sơ?",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Đồng ý",
          onPress: async () => {
            try {
              await removeCurrentAvatar();
              Alert.alert("Thành công", "Đã gỡ avatar hiện tại.");
            } catch (err: any) {
              Alert.alert(
                "Lỗi",
                err?.message || "Không thể gỡ avatar hiện tại.",
              );
            }
          },
        },
      ],
    );
  };

  const handleDeleteAvatarFile = async (key: string, isCurrent: boolean) => {
    if (isCurrent) {
      Alert.alert(
        "Thông báo",
        "Không thể xóa file avatar đang sử dụng.",
      );
      return;
    }

    Alert.alert(
      "Xác nhận",
      "Bạn muốn xóa hẳn file avatar này khỏi thư viện?",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAvatarFile(key);
              await refetchAvatarLibrary();
            } catch (err: any) {
              Alert.alert(
                "Lỗi",
                err?.message || "Không thể xóa file avatar.",
              );
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <SkeletonProfile />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Profile Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            {profileAvatarUrl ? (
              <Avatar.Image
                size={100}
                source={{ uri: profileAvatarUrl }}
                style={styles.avatarBorder}
              />
            ) : (
              <Avatar.Icon
                size={100}
                icon="account"
                style={styles.avatarPlaceholder}
              />
            )}
            {isUploading && (
              <View style={[StyleSheet.absoluteFill, styles.avatarOverlay]}>
                <Skeleton width={28} height={28} radius={14} />
              </View>
            )}
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
            {profile?.fullName || "Cán bộ"}
          </Text>
          <View style={styles.roleBadge}>
            <Text
              variant="labelSmall"
              style={{ color: colors.secondary, fontWeight: "700" }}
            >
              {profile?.role === "PROVINCE_OFFICER"
                ? "Cán bộ Tỉnh"
                : profile?.role === "WARD_OFFICER"
                  ? "Cán bộ Phường"
                  : "Quản trị viên"}
            </Text>
          </View>
        </View>

        {/* Detailed Info Card */}
        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={{ paddingVertical: 12 }}>
            <View style={styles.infoHeader}>
              <Text
                variant="titleMedium"
                style={{ fontWeight: "700", color: colors.text }}
              >
                Thông tin chi tiết
              </Text>
              <Button
                mode="text"
                icon="pencil"
                onPress={handleOpenEdit}
                compact
                labelStyle={{ fontWeight: "700" }}
              >
                Sửa
              </Button>
            </View>
            <List.Item
              title="Số điện thoại"
              description={profile?.phone || "Chưa cập nhật"}
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
              description={profile?.email || "Chưa cập nhật"}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon {...props} icon="email" color={colors.secondary} />
                </View>
              )}
            />
            <List.Item
              title="Khu vực phụ trách"
              description={locationLabel}
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon
                    {...props}
                    icon="map-marker"
                    color={colors.secondary}
                  />
                </View>
              )}
            />
          </Card.Content>
        </Card>

        <Card style={styles.infoCard} elevation={2}>
          <Card.Content style={{ paddingVertical: 12 }}>
            <View style={styles.infoHeader}>
              <Text
                variant="titleMedium"
                style={{ fontWeight: "700", color: colors.text }}
              >
                Quản lý avatar
              </Text>
            </View>
            <List.Item
              title="Thư viện avatar"
              description="Xem avatar đã upload, đặt lại avatar cũ hoặc xóa file không dùng."
              titleStyle={styles.listTitle}
              descriptionStyle={styles.listDesc}
              onPress={() => setAvatarLibraryVisible(true)}
              left={(props) => (
                <View style={styles.iconCircle}>
                  <List.Icon
                    {...props}
                    icon="image-multiple"
                    color={colors.secondary}
                  />
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

        <Button
          mode="contained"
          onPress={logout}
          buttonColor="#D32F2F"
          style={styles.logoutBtn}
          contentStyle={{ height: 48 }}
          labelStyle={{ fontWeight: "700", letterSpacing: 0 }}
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
              onChangeText={(val) =>
                setEditForm((prev) => ({ ...prev, fullName: val }))
              }
              style={styles.input}
              mode="outlined"
            />
            <TextInput
              label="Số điện thoại"
              value={editForm.phone}
              onChangeText={(val) =>
                setEditForm((prev) => ({ ...prev, phone: val }))
              }
              style={styles.input}
              mode="outlined"
              keyboardType="phone-pad"
            />
            <TextInput
              label="Email"
              value={editForm.email}
              onChangeText={(val) =>
                setEditForm((prev) => ({ ...prev, email: val }))
              }
              style={styles.input}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              label="Dia ban hien tai"
              value={locationLabel}
              style={styles.input}
              mode="outlined"
              editable={false}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditVisible(false)}>Hủy</Button>
            <Button
              mode="contained"
              onPress={handleSaveEdit}
              disabled={isUpdating}
            >
              Lưu thay đổi
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={avatarLibraryVisible}
          onDismiss={() => setAvatarLibraryVisible(false)}
        >
          <Dialog.Title>Thư viện avatar</Dialog.Title>
          <Dialog.Content>
            {isLoadingAvatarLibrary ? (
              <ListSkeleton count={4} />
            ) : avatarLibrary.length === 0 ? (
              <Text style={styles.listDesc}>
                Chưa có avatar nào trong thư viện.
              </Text>
            ) : (
              <ScrollView style={styles.avatarLibraryList}>
                {avatarLibrary.map((asset: any) => {
                  const avatarUrl = asset?.url
                    ? convertToS3Url(asset.url)
                    : undefined;
                  const isCurrent = Boolean(
                    currentAvatarKey && asset?.key === currentAvatarKey,
                  );

                  return (
                    <View key={asset.key} style={styles.avatarLibraryRow}>
                      {avatarUrl ? (
                        <Avatar.Image size={44} source={{ uri: avatarUrl }} />
                      ) : (
                        <Avatar.Icon
                          size={44}
                          icon="account"
                          style={styles.avatarPlaceholder}
                        />
                      )}
                      <View style={styles.avatarLibraryMeta}>
                        <Text
                          numberOfLines={1}
                          style={styles.avatarLibraryFile}
                        >
                          {asset.originalFileName ||
                            asset.fileName ||
                            asset.key}
                        </Text>
                        <Text style={styles.avatarLibrarySub}>
                          {isCurrent
                            ? "Đang sử dụng"
                            : "Có thể đặt làm avatar hiện tại"}
                        </Text>
                      </View>
                      <View style={styles.avatarLibraryActions}>
                        <Button
                          compact
                          mode={isCurrent ? "contained" : "text"}
                          disabled={isCurrent || isSettingAvatar}
                          onPress={() => void handleSetCurrentAvatar(asset.key)}
                        >
                          {isCurrent ? "Đang dùng" : "Dùng ảnh này"}
                        </Button>
                        <Button
                          compact
                          mode="text"
                          textColor="#D32F2F"
                          disabled={isCurrent || isDeletingAvatarFile}
                          onPress={() =>
                            void handleDeleteAvatarFile(asset.key, isCurrent)
                          }
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
            <Button onPress={() => void refetchAvatarLibrary()}>
              Làm mới
            </Button>
            <Button onPress={() => setAvatarLibraryVisible(false)}>
              Đóng
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  avatarSection: {
    alignItems: "center",
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
  avatarWrapper: { position: "relative", marginBottom: 12 },
  avatarBorder: {
    borderWidth: 3,
    borderColor: colors.secondary,
    backgroundColor: colors.card,
  },
  avatarPlaceholder: { backgroundColor: "rgba(73,90,255,0.12)" },
  avatarOverlay: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  editAvatarBtn: { position: "absolute", bottom: -4, right: -4, elevation: 3 },
  userName: { fontWeight: "700", color: colors.text, marginBottom: 6 },
  roleBadge: {
    backgroundColor: "rgba(73,90,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },

  infoCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 20,
    marginBottom: 24,
    paddingVertical: 4,
  },
  infoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
  },

  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0f4f8",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
  },
  listTitle: { fontWeight: "700", color: colors.text, fontSize: 14 },
  listDesc: { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
  avatarActionButton: { marginHorizontal: 12, marginTop: 8 },
  avatarLibraryList: { maxHeight: 360 },
  avatarLibraryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eceff1",
  },
  avatarLibraryMeta: { flex: 1, marginLeft: 10 },
  avatarLibraryFile: { fontWeight: "600", color: "#263238", fontSize: 13 },
  avatarLibrarySub: { color: "#607d8b", fontSize: 12, marginTop: 2 },
  avatarLibraryActions: { alignItems: "flex-end", justifyContent: "center" },

  logoutBtn: { marginHorizontal: 16, borderRadius: 16, marginTop: 8 },
  input: { marginBottom: 12, backgroundColor: colors.card },
});
