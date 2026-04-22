import type { QueryClient } from "@tanstack/react-query";
import type { MessageItem, ReportItem } from "@urban/shared-types";
import { ApiClient } from "@/lib/api-client";
import { queryKeys } from "@/services/query-keys";

const PREFETCH_MESSAGE_LIMIT = 12;

export function prefetchConversationMessages(queryClient: QueryClient, conversationId: string) {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) {
    return Promise.resolve();
  }

  return queryClient.prefetchQuery({
    queryKey: queryKeys.messages(normalizedConversationId),
    queryFn: async ({ signal }) => {
      const data = await ApiClient.get<MessageItem[]>(
        `/conversations/${encodeURIComponent(normalizedConversationId)}/messages`,
        { limit: PREFETCH_MESSAGE_LIMIT },
        { signal },
      );

      return Array.isArray(data) ? [...data].reverse() : [];
    },
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}

export function prefetchReport(queryClient: QueryClient, reportId: string) {
  const normalizedReportId = String(reportId || "").trim();
  if (!normalizedReportId) {
    return Promise.resolve();
  }

  return queryClient.prefetchQuery({
    queryKey: queryKeys.report(normalizedReportId),
    queryFn: ({ signal }) =>
      ApiClient.get<ReportItem>(
        `/reports/${encodeURIComponent(normalizedReportId)}`,
        undefined,
        { signal },
      ),
    staleTime: 30 * 1000,
  });
}
