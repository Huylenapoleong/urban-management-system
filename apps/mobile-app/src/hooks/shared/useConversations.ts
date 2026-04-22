import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '../../lib/api-client';

export interface ConversationSummaryItem {
  conversationId: string;
  groupName: string; // Tên hiển thị (Tên Nhóm hoặc Tên người Chat 1-1)
  lastMessagePreview?: string;
  lastSenderName?: string;
  unreadCount: number;
  isGroup: boolean;
  updatedAt: string;
  isPinned?: boolean;
  mutedUntil?: string | null;
}

export const useConversations = (query: { q?: string; unreadOnly?: boolean } = {}) => {
  return useQuery<ConversationSummaryItem[]>({
    queryKey: ['conversations', query],
    queryFn: async ({ signal }) => {
      const params: any = { limit: 20 };
      if (query.q) params.q = query.q;
      if (query.unreadOnly) params.unreadOnly = query.unreadOnly;
      try {
        const result = await ApiClient.get<ConversationSummaryItem[]>('/conversations', params, { signal });
        if (!Array.isArray(result)) {
          return [];
        }

        const deduped = new Map<string, ConversationSummaryItem>();

        for (const item of result) {
          const existing = deduped.get(item.conversationId);

          if (!existing) {
            deduped.set(item.conversationId, item);
            continue;
          }

          const existingScore =
            (existing.unreadCount > 0 ? 1 : 0) * 1_000_000_000_000 +
            new Date(existing.updatedAt || 0).getTime();
          const nextScore =
            (item.unreadCount > 0 ? 1 : 0) * 1_000_000_000_000 +
            new Date(item.updatedAt || 0).getTime();

          if (nextScore >= existingScore) {
            deduped.set(item.conversationId, item);
          }
        }

        return [...deduped.values()];
      } catch (err) {
        throw err;
      }
    },
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};
