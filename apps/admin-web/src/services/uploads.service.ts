import { apiClient, ApiResponse } from "./api-client";

export interface UploadedAsset {
  key: string;
  url: string;
  bucket: string;
  target: "AVATAR" | "REPORT" | "MESSAGE";
  entityId?: string;
  originalFileName: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface PresignDownloadResult {
  method: "GET";
  url: string;
  key: string;
  expiresAt: string;
}

class UploadsService {
  async uploadReportMedia(file: File, entityId?: string): Promise<ApiResponse<UploadedAsset>> {
    const formData = new FormData();
    formData.append("target", "REPORT");
    if (entityId) {
      formData.append("entityId", entityId);
    }
    formData.append("file", file);

    return apiClient.request<UploadedAsset>("POST", "/uploads/media", {
      body: formData,
    });
  }

  async presignReportDownload(key: string, entityId?: string): Promise<ApiResponse<PresignDownloadResult>> {
    return apiClient.post<PresignDownloadResult>("/uploads/presign/download", {
      target: "REPORT",
      key,
      entityId,
    });
  }
}

export const uploadsService = new UploadsService();