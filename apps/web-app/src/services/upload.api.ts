import ApiClient from "@/lib/api-client";
import type { UploadedAsset } from "@urban/shared-types";
import type { AxiosProgressEvent } from "axios";

type UploadMediaParams = {
  file: File;
  target: "REPORT" | "MESSAGE" | "AVATAR" | "GENERAL";
  entityId?: string;
  onProgress?: (progressPercent: number, event: AxiosProgressEvent) => void;
};

type DeleteUploadParams = {
  target: "REPORT" | "MESSAGE" | "AVATAR" | "GENERAL";
  key: string;
  entityId?: string;
};

export interface UploadHistoryItem {
  key: string;
  url: string;
  fileName?: string;
  uploadedAt?: string;
  isInUse?: boolean;
}

export async function uploadMedia({
  file,
  target,
  entityId,
  onProgress,
}: UploadMediaParams): Promise<UploadedAsset> {
  const formData = new FormData();
  formData.append("target", target);
  if (entityId) {
    formData.append("entityId", entityId);
  }
  formData.append("file", file);

  return await ApiClient.post("/uploads/media", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
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
  });
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