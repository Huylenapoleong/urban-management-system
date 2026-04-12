import ApiClient from "@/lib/api-client";
import type { ConversationSummary, MessageItem } from "@urban/shared-types";

export async function listConversations(): Promise<ConversationSummary[]> {
  try {
    const [conversations, joinedGroups] = await Promise.all([
      ApiClient.get("/conversations").catch(() => []) as Promise<ConversationSummary[]>,
      ApiClient.get("/groups?mine=true").catch(() => []) as Promise<any[]>,
    ]);

    const result = [...conversations];
    
    // Merge groups that user joined but don't have a conversation yet (because no message was sent)
    for (const group of joinedGroups) {
      const convId = `group:${group.id}`;
      if (!result.find(c => c.conversationId === convId)) {
        result.push({
          conversationId: convId,
          groupName: group.groupName,
          lastMessagePreview: "Nhóm mới tham gia",
          lastSenderName: "Hệ thống",
          unreadCount: 0,
          isGroup: true,
          updatedAt: group.updatedAt || new Date().toISOString(),
        } as any);
      }
    }

    // Sort by updatedAt desc
    result.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

    return result;
  } catch (error) {
    console.error("Failed to list conversations", error);
    return [];
  }
}

export async function listMessages(conversationId: string): Promise<MessageItem[]> {
  return await ApiClient.get(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`);
}

export async function markConversationAsRead(conversationId: string): Promise<void> {
  await ApiClient.post(`/conversations/${encodeURIComponent(conversationId)}/read`);
}

export async function sendMessage(conversationId: string, text: string): Promise<MessageItem> {
  const body = { 
    type: "TEXT", 
    content: JSON.stringify({ text, mention: [] }) 
  };
  return await ApiClient.post(`/conversations/${encodeURIComponent(conversationId)}/messages`, body);
}
