import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { REPORT_CATEGORIES, REPORT_PRIORITIES } from "@urban/shared-constants";
import type { ImagePickerAsset } from "expo-image-picker";
import type { MediaAsset, ReportItem, UploadedAsset } from "@urban/shared-types";
import { parseLocationCode } from "@urban/shared-utils";
import Header from "@/components/Header";
import Button from "@/components/Button";
import CitizenReportCard from "@/components/shared/CitizenReportCard";
import { ApiClient } from "@/lib/api-client";
import { ENV_CONFIG } from "@/constants/env";
import colors from "@/constants/colors";
import { convertToS3Url } from "@/constants/s3";
import { useAuth } from "@/providers/AuthProvider";
import { listReports } from "@/services/api/report.api";

type LocationOption = {
  key: string;
  label: string;
  value: string;
};

type SelectedImage = {
  uri: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  webFile?: File;
};

type CreateReportPayload = {
  title: string;
  description: string;
  category: (typeof REPORT_CATEGORIES)[number];
  priority: (typeof REPORT_PRIORITIES)[number];
  locationCode: string;
  mediaUrls?: string[];
};

const API_REPORT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const hasCitizenS3Config = Boolean(
  process.env.S3_BUCKET_NAME ||
    process.env.EXPO_PUBLIC_S3_ENDPOINT ||
    process.env.EXPO_PUBLIC_S3_ACCESS_KEY ||
    process.env.EXPO_PUBLIC_S3_SECRET_KEY ||
    process.env.S3_BUCKET_NAME ||
    process.env.S3_ENDPOINT ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_SECRET_ACCESS_KEY,
);

function toSelectedImage(asset: ImagePickerAsset): SelectedImage {
  return {
    uri: asset.uri,
    fileName: asset.fileName || asset.uri.split("/").pop() || `report-${Date.now()}.jpg`,
    fileSize: asset.fileSize,
    mimeType: asset.mimeType || undefined,
    webFile: (asset as ImagePickerAsset & { file?: File }).file,
  };
}

function inferReportImageMimeType(image: SelectedImage): string {
  const rawMimeType = image.mimeType?.split(";")[0]?.trim().toLowerCase();

  if (rawMimeType === "image/jpg") {
    return "image/jpeg";
  }

  if (rawMimeType) {
    return rawMimeType;
  }

  const lowerName = image.fileName.toLowerCase();

  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lowerName.endsWith(".png")) {
    return "image/png";
  }

  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  if (lowerName.endsWith(".gif")) {
    return "image/gif";
  }

  return "image/jpeg";
}

async function appendReportUploadFile(formData: FormData, image: SelectedImage) {
  const contentType = inferReportImageMimeType(image);

  if (!API_REPORT_IMAGE_MIME_TYPES.has(contentType)) {
    throw new Error("API chi nhan anh JPEG, PNG, WEBP hoac GIF. Vui long chon anh khac.");
  }

  if (Platform.OS === "web") {
    const sourceBlob: Blob = image.webFile
      ? image.webFile
      : await fetch(image.uri).then((response) => response.blob());

    if (sourceBlob.size <= 0) {
      throw new Error("Tep anh dang rong. Vui long chon lai anh khac.");
    }

    const uploadBlob =
      sourceBlob.type === contentType
        ? sourceBlob
        : new Blob([sourceBlob], { type: contentType });
    const uploadFile =
      typeof File !== "undefined" && !(uploadBlob instanceof File)
        ? new File([uploadBlob], image.fileName, { type: contentType })
        : uploadBlob;

    formData.append("file", uploadFile, image.fileName);
    return;
  }

  formData.append(
    "file",
    {
      uri: image.uri,
      name: image.fileName,
      type: contentType,
    } as any,
  );
}

function resolveReportMediaUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const converted = convertToS3Url(trimmed);
  if (/^https?:\/\//i.test(converted)) {
    return converted;
  }

  const normalized = converted.replace(/^\/+/, "");
  if (normalized.startsWith("uploads/")) {
    return `${ENV_CONFIG.S3.NEW_BASE_URL}${normalized.replace(/^uploads\/+/, "")}`;
  }

  return `${ENV_CONFIG.API_BASE_URL.replace(/\/+$/, "")}/${normalized}`;
}

function normalizeReportMedia(report: ReportItem): ReportItem {
  const fallbackUrls = (report.mediaAssets ?? [])
    .map((asset: MediaAsset) => resolveReportMediaUrl(asset.resolvedUrl || asset.key))
    .filter((value): value is string => Boolean(value));

  const mediaUrls = (report.mediaUrls ?? [])
    .map((value) => resolveReportMediaUrl(value))
    .filter((value): value is string => Boolean(value));

  return {
    ...report,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : fallbackUrls,
  };
}

export default function ReportPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof REPORT_CATEGORIES)[number]>(REPORT_CATEGORIES[0]);
  const [priority, setPriority] = useState<(typeof REPORT_PRIORITIES)[number]>(REPORT_PRIORITIES[1]);
  const [description, setDescription] = useState("");
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const locationSegments = useMemo(() => {
    if (!user?.locationCode) {
      return null;
    }

    try {
      return parseLocationCode(user.locationCode);
    } catch {
      return null;
    }
  }, [user?.locationCode]);

  const locationOptions = useMemo<LocationOption[]>(() => {
    if (!locationSegments) {
      return [];
    }

    return [
      { key: "country", label: "Quoc gia", value: locationSegments.country },
      { key: "province", label: "Tinh/Thanh", value: locationSegments.province },
      { key: "district", label: "Quan/Huyen", value: locationSegments.district },
      { key: "ward", label: "Phuong/Xa", value: locationSegments.ward },
    ];
  }, [locationSegments]);

  const uploadReportMedia = useCallback(
    async (image: SelectedImage): Promise<UploadedAsset> => {
      const formData = new FormData();
      formData.append("target", "REPORT");
      await appendReportUploadFile(formData, image);

      return await ApiClient.upload<UploadedAsset>("/uploads/media", formData);
    },
    [],
  );

  const loadMyReports = useCallback(async () => {
    setLoadingReports(true);

    try {
      const data = await listReports({ mine: true, limit: 100 });
      setReports(
        [...data]
          .map((report) => normalizeReportMedia(report))
          .sort(
          (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
          ),
      );
      setError(null);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Khong the tai danh sach phan anh");
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    void loadMyReports();
  }, [loadMyReports]);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Can quyen truy cap", "Vui long cap quyen thu vien anh de dinh kem tep.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(toSelectedImage(result.assets[0]));
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Can quyen camera", "Vui long cap quyen camera de chup anh moi.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(toSelectedImage(result.assets[0]));
    }
  };

  const submit = async () => {
    if (!user?.locationCode) {
      setError("Khong xac dinh duoc khu vuc cua ban");
      return;
    }

    if (!title.trim() || !description.trim()) {
      setError("Vui long nhap day du tieu de va noi dung phan anh");
      return;
    }

    setSubmitting(true);
    setSuccessMessage(null);

    try {
      const mediaUrls: string[] = [];

      if (selectedImage) {
        const uploadedAsset = await uploadReportMedia(selectedImage);
        const uploadedUrl = resolveReportMediaUrl(uploadedAsset.url) || resolveReportMediaUrl(uploadedAsset.key);

        if (!uploadedUrl) {
          throw new Error("Upload thanh cong nhung khong nhan duoc URL anh.");
        }

        mediaUrls.push(uploadedUrl);
      }

      const payload: CreateReportPayload = {
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        locationCode: user.locationCode,
      };

      if (mediaUrls.length > 0) {
        payload.mediaUrls = mediaUrls;
      }

      const createdReport = normalizeReportMedia(await ApiClient.post<ReportItem>("/reports", payload));

      setReports((prev) => [createdReport, ...prev]);
      setTitle("");
      setDescription("");
      setSelectedImage(null);
      setError(null);
      setSuccessMessage("Da gui phan anh thanh cong");
      
      // Invalidate queries để home page auto-refresh
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
    } catch (err: unknown) {
      const message = (err as Error)?.message ?? "Khong the gui phan anh";
      setError(message);
      Alert.alert("Loi gui phan anh", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header title="Gui phan anh" subtitle="Them anh dinh kem, gui dung dia ban, va theo doi lich su da gui" />

      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={18} color="#1d4ed8" />
        <Text style={styles.infoText}>
          {hasCitizenS3Config
            ? "Citizen app dang co bien moi truong lien quan den S3. Upload anh se di qua upload API hien co cua he thong."
            : "Khong tim thay cau hinh S3 trong .env cua Citizen app. Minh khong them key moi; upload anh se goi upload API san co va thanh cong hay khong se phu thuoc cau hinh S3 phia backend."}
        </Text>
      </View>

      <View style={styles.locationCard}>
        <Text style={styles.cardTitle}>Vi tri phan anh</Text>
        <Text style={styles.cardHint}>
          Tai khoan cong dan chi duoc tao phan anh trong dung dia ban da dang ky.
        </Text>
        <View style={styles.locationGrid}>
          {locationOptions.map((item) => (
            <View key={item.key} style={styles.locationChip}>
              <Text style={styles.locationChipLabel}>{item.label}</Text>
              <Text style={styles.locationChipValue}>{item.value}</Text>
            </View>
          ))}
        </View>
        {user?.locationCode ? (
          <Text style={styles.helperText}>{`Location code: ${user.locationCode}`}</Text>
        ) : (
          <Text style={styles.errorText}>Khong tai duoc locationCode cua tai khoan.</Text>
        )}
      </View>

      <Text style={styles.label}>Tieu de phan anh</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Vi du: Den duong hong tai hem 12"
        placeholderTextColor={colors.textSecondary}
      />

      <Text style={styles.label}>Danh muc</Text>
      <View style={styles.selectorRow}>
        {REPORT_CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.tag, item === category && styles.tagActive]}
            onPress={() => setCategory(item)}
          >
            <Text style={[styles.tagText, item === category && styles.tagTextActive]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Do uu tien</Text>
      <View style={styles.selectorRow}>
        {REPORT_PRIORITIES.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.tag, item === priority && styles.tagActive]}
            onPress={() => setPriority(item)}
          >
            <Text style={[styles.tagText, item === priority && styles.tagTextActive]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Noi dung phan anh</Text>
      <TextInput
        style={styles.textarea}
        value={description}
        onChangeText={setDescription}
        placeholder="Mo ta ro su co, thoi gian, vi tri, tac dong thuc te..."
        placeholderTextColor={colors.textSecondary}
        multiline
        numberOfLines={6}
      />

      <Text style={styles.label}>Anh dinh kem</Text>
      <View style={styles.imageActionRow}>
        <Pressable style={styles.imageActionButton} onPress={() => void handlePickImage()}>
          <Ionicons name="images-outline" size={18} color={colors.primary} />
          <Text style={styles.imageActionText}>Chon tu thu vien</Text>
        </Pressable>
        <Pressable style={styles.imageActionButton} onPress={() => void handleTakePhoto()}>
          <Ionicons name="camera-outline" size={18} color={colors.primary} />
          <Text style={styles.imageActionText}>Chup anh moi</Text>
        </Pressable>
      </View>

      {selectedImage ? (
        <View style={styles.previewCard}>
          <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} contentFit="cover" />
          <View style={styles.previewContent}>
            <Text style={styles.previewTitle}>{selectedImage.fileName}</Text>
            <Text style={styles.previewSubtitle}>Anh nay se duoc upload len he thong khi gui phan anh.</Text>
          </View>
          <Pressable style={styles.removeImageButton} onPress={() => setSelectedImage(null)}>
            <Ionicons name="close" size={16} color="#b91c1c" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptyUploadCard}>
          <Ionicons name="image-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.emptyUploadText}>Ban co the chon anh hoac chup anh moi de gui kem.</Text>
        </View>
      )}

      <Button
        onPress={() => void submit()}
        disabled={!title.trim() || !description.trim() || !user?.locationCode || submitting}
      >
        {submitting ? "Dang gui..." : "Gui phan anh"}
      </Button>

      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.historyHeader}>
        <View>
          <Text style={styles.historyTitle}>Phan anh da gui</Text>
          <Text style={styles.historySubtitle}>Day du anh, noi dung, trang thai va thoi gian gui</Text>
        </View>
      </View>

      {loadingReports ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : reports.length > 0 ? (
        reports.map((report) => <CitizenReportCard key={report.id} report={report} />)
      ) : (
        <View style={styles.emptyHistoryCard}>
          <Text style={styles.emptyHistoryTitle}>Chua co lich su phan anh</Text>
          <Text style={styles.emptyHistoryText}>Phan anh vua gui se xuat hien trong danh sach nay.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 14,
    paddingBottom: 34,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#eff6ff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    color: "#1e3a8a",
    lineHeight: 20,
    fontSize: 13,
    fontWeight: "600",
  },
  locationCard: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  cardHint: {
    marginTop: 6,
    color: colors.textSecondary,
    lineHeight: 20,
    fontSize: 13,
  },
  locationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  locationChip: {
    minWidth: "47%",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  locationChipLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  locationChipValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  helperText: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 12,
  },
  label: {
    marginTop: 14,
    marginBottom: 6,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    color: colors.text,
  },
  selectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "white",
  },
  tagActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tagText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 13,
  },
  tagTextActive: {
    color: "white",
  },
  textarea: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    textAlignVertical: "top",
    minHeight: 132,
    color: colors.text,
  },
  imageActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  imageActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "white",
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  imageActionText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginTop: 10,
    marginBottom: 14,
  },
  previewImage: {
    width: 84,
    height: 84,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
  },
  previewContent: {
    flex: 1,
    marginLeft: 12,
  },
  previewTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  previewSubtitle: {
    marginTop: 6,
    color: colors.textSecondary,
    lineHeight: 18,
    fontSize: 12,
  },
  removeImageButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  emptyUploadCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
    marginBottom: 14,
  },
  emptyUploadText: {
    flex: 1,
    color: colors.textSecondary,
    lineHeight: 18,
    fontSize: 13,
  },
  successText: {
    marginTop: 10,
    color: colors.success,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    color: colors.danger,
    marginTop: 10,
    textAlign: "center",
  },
  historyHeader: {
    marginTop: 24,
    marginBottom: 14,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  historySubtitle: {
    marginTop: 6,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  loader: {
    marginTop: 8,
  },
  emptyHistoryCard: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  emptyHistoryTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  emptyHistoryText: {
    marginTop: 8,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
