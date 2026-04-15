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

  const uploadResponse = await fetch(`${API_BASE_URL}/api/uploads/media`, {
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

export async function getUploadLimits(): Promise<any> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/uploads/limits`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "Loi khi lay gioi han upload.");
  return payload.data;
}

export async function deleteMedia(key: string): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/uploads/media`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || "Xoa tep media that bai.");
  }
}

export async function getPresignedUploadUrl(params: { fileName: string; contentType: string; target: string; entityId?: string }): Promise<any> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/uploads/presign/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "Loi khi tao presigned upload URL.");
  return payload.data;
}

export async function getPresignedDownloadUrl(key: string): Promise<any> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/uploads/presign/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "Loi khi tao presigned download URL.");
  return payload.data;
}
