import {
  buildSessionMetadataHeaders,
  readAccessToken,
} from "@/lib/api-client";

export type KnowledgeDocumentStatus = "ACTIVE" | "INACTIVE";

export type KnowledgeDocumentMetadata = {
  lawName?: string;
  chapter?: string;
  section?: string;
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  content: string;
  category: string;
  source: string;
  status: KnowledgeDocumentStatus;
  effectiveDate?: string | null;
  metadata?: KnowledgeDocumentMetadata;
  createdAt?: string;
  updatedAt: string;
};

export type KnowledgeListParams = {
  q?: string;
  category?: string;
  status?: KnowledgeDocumentStatus;
  limit?: number;
  cursor?: string;
};

export interface CursorPage<T> {
  items: T[];
  nextCursor?: string;
}

function buildQuery(
  params?: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  if (!params) {
    return "";
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    search.append(key, String(value));
  });

  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

async function getCursorPage<T>(path: string): Promise<CursorPage<T>> {
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
  const token = readAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      ...buildSessionMetadataHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const message =
      payload?.error?.message || payload?.message || "Request failed";
    throw {
      message,
      status: response.status,
    };
  }

  return {
    items: Array.isArray(payload?.data) ? payload.data : [],
    nextCursor:
      typeof payload?.meta?.nextCursor === "string"
        ? payload.meta.nextCursor
        : undefined,
  };
}

export async function listKnowledgeDocumentsPage(
  params?: KnowledgeListParams,
): Promise<CursorPage<KnowledgeDocument>> {
  const query = buildQuery({
    q: params?.q?.trim() || undefined,
    category: params?.category?.trim() || undefined,
    status: params?.status,
    limit: params?.limit ?? 20,
    cursor: params?.cursor,
  });
  return await getCursorPage<KnowledgeDocument>(`/knowledge-base${query}`);
}
