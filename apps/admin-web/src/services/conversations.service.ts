import { ApiResponse, apiClient } from "./api-client";

export interface ConversationSummary {
  conversationId: string;
  groupName: string;
  lastMessagePreview: string;
  lastSenderName: string;
  unreadCount: number;
  isGroup: boolean;
  isPinned: boolean;
  archivedAt: string | null;
  mutedUntil: string | null;
  deletedAt: string | null;
  updatedAt: string;
}

export interface MessageItem {
  conversationId: string;
  id: string;
  senderId: string;
  senderName: string;
  type: string;
  content: string;
  sentAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ConversationAuditEventItem {
  id: string;
  scope: "REPORT" | "CONVERSATION";
  action: string;
  actorUserId: string;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

class ConversationsService {
  async listConversationsRaw(params?: {
    cursor?: string;
    limit?: number;
    q?: string;
    includeArchived?: boolean;
  }): Promise<ApiResponse<ConversationSummary[]>> {
    return apiClient.get<ConversationSummary[]>("/conversations", {
      params: {
        cursor: params?.cursor,
        limit: params?.limit ?? 100,
        q: params?.q,
        includeArchived: params?.includeArchived,
      },
    });
  }

  async getAllConversations(options?: { maxPages?: number; pageSize?: number }): Promise<ApiResponse<ConversationSummary[]>> {
    const all: ConversationSummary[] = [];
    let cursor: string | undefined;
    const maxPages = options?.maxPages ?? 10;
    const pageSize = options?.pageSize ?? 100;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.listConversationsRaw({
        cursor,
        limit: pageSize,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error || "Failed to fetch conversations",
          data: all,
        };
      }

      const chunk = response.data || [];
      all.push(...chunk);

      const nextCursor = response.meta?.nextCursor;
      if (!nextCursor || chunk.length === 0) break;
      cursor = nextCursor;
    }

    return {
      success: true,
      data: all,
    };
  }

  async listMessagesRaw(
    conversationId: string,
    params?: { cursor?: string; limit?: number; after?: string; before?: string }
  ): Promise<ApiResponse<MessageItem[]>> {
    return apiClient.get<MessageItem[]>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
      params: {
        cursor: params?.cursor,
        limit: params?.limit ?? 100,
        after: params?.after,
        before: params?.before,
      },
    });
  }

  async getMessagesForConversations(
    conversationIds: string[],
    options?: { after?: string; before?: string; perConversationLimit?: number }
  ): Promise<ApiResponse<MessageItem[]>> {
    const all: MessageItem[] = [];

    for (const conversationId of conversationIds) {
      const response = await this.listMessagesRaw(conversationId, {
        limit: options?.perConversationLimit ?? 120,
        after: options?.after,
        before: options?.before,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error || "Failed to fetch messages",
          data: all,
        };
      }

      all.push(...(response.data || []));
    }

    return {
      success: true,
      data: all,
    };
  }

  async listConversationAuditEventsRaw(
    conversationId: string,
    params?: { cursor?: string; limit?: number }
  ): Promise<ApiResponse<ConversationAuditEventItem[]>> {
    return apiClient.get<ConversationAuditEventItem[]>(`/conversations/${encodeURIComponent(conversationId)}/audit`, {
      params: {
        cursor: params?.cursor,
        limit: params?.limit ?? 50,
      },
    });
  }

  async getConversationAuditEvents(
    conversationId: string,
    options?: { maxPages?: number; pageSize?: number }
  ): Promise<ApiResponse<ConversationAuditEventItem[]>> {
    const all: ConversationAuditEventItem[] = [];
    let cursor: string | undefined;
    const maxPages = options?.maxPages ?? 5;
    const pageSize = options?.pageSize ?? 50;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.listConversationAuditEventsRaw(conversationId, {
        cursor,
        limit: pageSize,
      });

      if (!response.success) {
        return {
          success: false,
          error: response.error || "Failed to fetch conversation audit events",
          data: all,
        };
      }

      const chunk = response.data || [];
      all.push(...chunk);

      const nextCursor = response.meta?.nextCursor;
      if (!nextCursor || chunk.length === 0) {
        break;
      }
      cursor = nextCursor;
    }

    return {
      success: true,
      data: all,
    };
  }
}

export const conversationsService = new ConversationsService();
