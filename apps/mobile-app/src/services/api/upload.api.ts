import type { UploadedAsset } from "@urban/shared-types";
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { readWebToken } from "@/lib/web-token-storage";
import { ENV_CONFIG } from "@/constants/env";

type UploadMediaParams = {
  uri: string;
  fileName?: string;
  mimeType?: string;
  target: "REPORT" | "MESSAGE" | "AVATAR" | "GENERAL";
  entityId?: string;
};

const API_BASE_URL = ENV_CONFIG.API_BASE_URL;

async function getAccessToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return readWebToken();
    }
    return await SecureStore.getItemAsync('auth_token');
  } catch (e) {
    return null;
  }
}

function inferMimeType(fileName: string, mimeType?: string) {
  if (mimeType) {
    return mimeType;
  }

  const lowerCaseName = fileName.toLowerCase();

  if (lowerCaseName.endsWith(".png")) {
    return "image/png";
  }

  if (lowerCaseName.endsWith(".heic")) {
    return "image/heic";
  }

  if (lowerCaseName.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

export async function uploadMedia({
  uri,
  fileName,
  mimeType,
  target,
  entityId,
}: UploadMediaParams): Promise<UploadedAsset> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error("Khong tim thay access token de upload tep.");
  }

  const resolvedFileName = fileName || uri.split("/").pop() || `upload-${Date.now()}.jpg`;
  const contentType = inferMimeType(resolvedFileName, mimeType);
  
  // Convert URI to Blob for proper file upload
  const fileUri = Platform.OS === 'android' ? uri : uri.replace('file://', '');
  const response = await fetch(fileUri);
  const blob = await response.blob();
  
  const formData = new FormData();
  formData.append("target", target);

  if (entityId) {
    formData.append("entityId", entityId);
  }

  // Append blob as actual file
  formData.append("file", blob, resolvedFileName);

  const uploadResponse = await fetch(`${API_BASE_URL}/uploads/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const payload = (await uploadResponse.json().catch(() => null)) as
    | { data?: UploadedAsset; error?: { message?: string } }
    | null;

  if (!uploadResponse.ok) {
    throw new Error(payload?.error?.message || "Upload anh that bai.");
  }

  if (!payload?.data) {
    throw new Error("Upload thanh cong nhung khong nhan duoc URL tep.");
  }

  return payload.data;
}
