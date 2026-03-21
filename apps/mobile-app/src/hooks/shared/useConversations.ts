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
}

export const useConversations = (query: { q?: string; unreadOnly?: boolean } = {}) => {
  return useQuery<ConversationSummaryItem[]>({
    queryKey: ['conversations', query],
    queryFn: async () => {
      const params: any = {};
      if (query.q) params.q = query.q;
      if (query.unreadOnly) params.unreadOnly = query.unreadOnly;
      console.log('[useConversations] Fetching with params:', params);
      try {
        const result = await ApiClient.get<ConversationSummaryItem[]>('/conversations', params);
        console.log('[useConversations] Raw result:', JSON.stringify(result));
        console.log('[useConversations] isArray:', Array.isArray(result));
        if (result && !Array.isArray(result)) {
          console.warn('[useConversations] result is NOT an array, keys:', Object.keys(result as any));
        }
        return result;
      } catch (err) {
        console.error('[useConversations] Error fetching conversations:', err);
        throw err;
      }
    },
  });
};
