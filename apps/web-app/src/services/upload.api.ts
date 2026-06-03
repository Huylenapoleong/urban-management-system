import ApiClient from "@/lib/api-client";
import type { UploadedAsset } from "@urban/shared-types";
import axios, { type AxiosProgressEvent } from "axios";

type UploadTarget = "REPORT" | "MESSAGE" | "AVATAR" | "GENERAL";

type UploadMediaParams = {
  file: File;
  target: UploadTarget;
  entityId?: string;
  onProgress?: (progressPercent: number, event: AxiosProgressEvent) => void;
};

type DeleteUploadParams = {
  target: UploadTarget;
  key: string;
  entityId?: string;
};

type PresignUploadResult = {
  method: "PUT";
  url: string;
  key: string;
  bucket: string;
  target: UploadTarget;
  entityId?: string;
  contentType: string;
  expiresAt: string;
};

type PresignDownloadResult = {
  method: "GET";
  url: string;
  key: string;
  expiresAt: string;
};

export interface UploadHistoryItem {
  key: string;
  url: string;
  fileName?: string;
  uploadedAt?: string;
  isInUse?: boolean;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function resolveContentType(file: File): string {
  if (file.type) {
    return file.type.toLowerCase();
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  return (
    (extension && CONTENT_TYPE_BY_EXTENSION[extension]) ||
    "application/octet-stream"
  );
}

function stripQueryString(url: string): string {
  return url.split("?")[0] || url;
}

export async function uploadMedia({
  file,
  target,
  entityId,
  onProgress,
}: UploadMediaParams): Promise<UploadedAsset> {
  const fileName = file.name || "file.bin";
  const contentType = resolveContentType(file);
  const presignPayload = {
    target,
    fileName,
    contentType,
    size: file.size,
    ...(entityId ? { entityId } : {}),
  };

  const presignData = (await ApiClient.post(
    "/uploads/presign/upload",
    presignPayload,
  )) as PresignUploadResult;

  try {
    await axios.request({
      data: file,
      headers: {
        "Content-Type": presignData.contentType || contentType,
      },
      method: presignData.method,
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!onProgress) {
          return;
        }
        const total = event.total || file.size || 0;
        if (!total) {
          onProgress(0, event);
          return;
        }
        const percent = Math.min(100, Math.round((event.loaded * 100) / total));
        onProgress(percent, event);
      },
      url: presignData.url,
      withCredentials: false,
    });
  } catch (error) {
    if (axios.isAxiosError(error) && !error.response) {
      throw new Error(
        "Direct storage upload failed. Check S3/CloudFront CORS for PUT/OPTIONS and Content-Type.",
      );
    }

    throw error;
  }

  const downloadData = (await ApiClient.post("/uploads/presign/download", {
    target: presignData.target,
    key: presignData.key,
    ...(presignData.entityId ? { entityId: presignData.entityId } : {}),
  }).catch(() => undefined)) as PresignDownloadResult | undefined;

  return {
    key: presignData.key,
    url: downloadData?.url || stripQueryString(presignData.url),
    bucket: presignData.bucket,
    target: presignData.target,
    entityId: presignData.entityId,
    originalFileName: fileName,
    fileName,
    contentType: presignData.contentType || contentType,
    size: file.size,
    uploadedBy: "",
    uploadedAt: new Date().toISOString(),
  };
}

export async function deleteUpload({
  target,
  key,
  entityId,
}: DeleteUploadParams): Promise<void> {
  await ApiClient.delete("/uploads/media", {
    data: {
      target,
      key,
      ...(entityId ? { entityId } : {}),
    },
  });
}

export async function listAvatarUploads(): Promise<UploadHistoryItem[]> {
  return await ApiClient.get("/uploads/media?target=AVATAR&limit=50");
}
