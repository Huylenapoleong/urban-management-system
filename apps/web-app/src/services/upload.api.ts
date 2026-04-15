import ApiClient from "@/lib/api-client";
import type { AxiosProgressEvent } from "axios";
import type { UploadedAsset } from "@urban/shared-types";

type UploadMediaParams = {
  file: File;
  target: "REPORT" | "MESSAGE" | "AVATAR" | "GENERAL";
  entityId?: string;
  onProgress?: (progressPercent: number, event: AxiosProgressEvent) => void;
};

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