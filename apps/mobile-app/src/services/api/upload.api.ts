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

const buildApiUrl = (path: string) => {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (base.endsWith('/api')) {
    return `${base}${normalizedPath}`;
  }

  return `${base}/api${normalizedPath}`;
};

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
  const lowerCaseName = fileName.toLowerCase();
  const rawMime = (mimeType || '').split(';')[0].trim().toLowerCase();

  const explicitMimeMap: Record<string, string> = {
    'audio/x-m4a': 'audio/mp4',
    'audio/m4a': 'audio/mp4',
    'audio/mp4a-latm': 'audio/aac',
    'video/mov': 'video/quicktime',
  };

  if (rawMime && rawMime !== 'application/octet-stream') {
    return explicitMimeMap[rawMime] || rawMime;
  }

  if (/\.(jpg|jpeg)$/.test(lowerCaseName)) return 'image/jpeg';
  if (lowerCaseName.endsWith('.png')) return 'image/png';
  if (lowerCaseName.endsWith('.webp')) return 'image/webp';
  if (lowerCaseName.endsWith('.gif')) return 'image/gif';
  if (lowerCaseName.endsWith('.mp4')) return 'video/mp4';
  if (lowerCaseName.endsWith('.mov')) return 'video/quicktime';
  if (lowerCaseName.endsWith('.mp3')) return 'audio/mpeg';
  if (lowerCaseName.endsWith('.m4a')) return 'audio/mp4';
  if (lowerCaseName.endsWith('.aac')) return 'audio/aac';
  if (lowerCaseName.endsWith('.pdf')) return 'application/pdf';
  if (lowerCaseName.endsWith('.doc')) return 'application/msword';
  if (lowerCaseName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  return 'image/jpeg';
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
  const uploadUrl = buildApiUrl('/uploads/media');
  
  const formData = new FormData();
  formData.append("target", target);

  if (entityId) {
    formData.append("entityId", entityId);
  }

  if (Platform.OS === 'web') {
    const fileResponse = await fetch(uri);
    const blob = await fileResponse.blob();
    formData.append('file', blob, resolvedFileName);
  } else {
    formData.append("file", {
      uri,
      name: resolvedFileName,
      type: contentType,
    } as any);
  }

  const uploadResponse = await fetch(uploadUrl, {
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
  const response = await fetch(buildApiUrl('/uploads/limits'), {
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
  const response = await fetch(buildApiUrl('/uploads/media'), {
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
  const response = await fetch(buildApiUrl('/uploads/presign/upload'), {
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
  const response = await fetch(buildApiUrl('/uploads/presign/download'), {
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
