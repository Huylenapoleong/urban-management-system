import ApiClient from "@/lib/api-client";
import type { UploadedAsset } from "@urban/shared-types";

type UploadMediaParams = {
  file: File;
  target: "REPORT" | "MESSAGE" | "AVATAR" | "GENERAL";
  entityId?: string;
};

export async function uploadMedia({
  file,
  target,
  entityId,
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
  });
}