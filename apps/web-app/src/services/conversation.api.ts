import ApiClient from "@/lib/api-client";
import type { ConversationSummary, MessageItem } from "@urban/shared-types";

export async function listConversations(): Promise<ConversationSummary[]> {
  return await ApiClient.get("/conversations");
}

export async function listMessages(conversationId: string): Promise<MessageItem[]> {
  return await ApiClient.get(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`);
}

export async function markConversationAsRead(conversationId: string): Promise<void> {
  await ApiClient.post(`/conversations/${encodeURIComponent(conversationId)}/read`);
}

export async function sendMessage(conversationId: string, text: string): Promise<MessageItem> {
  const body = { type: "TEXT", content: text };
  return await ApiClient.post(`/conversations/${encodeURIComponent(conversationId)}/messages`, body);
}
