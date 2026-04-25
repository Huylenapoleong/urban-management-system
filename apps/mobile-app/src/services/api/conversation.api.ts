import client from "../api/client";
import type { ConversationSummary, MessageItem } from "@urban/shared-types";

export async function listConversations(): Promise<ConversationSummary[]> {
  return await client.get("/conversations");
}

export async function listMessages(conversationId: string): Promise<MessageItem[]> {
  return await client.get(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`);
}

export async function markConversationAsRead(conversationId: string): Promise<void> {
  await client.post(`/conversations/${encodeURIComponent(conversationId)}/read`);
}

export async function sendMessage(conversationId: string, text: string): Promise<MessageItem> {
  const body = { type: "TEXT", content: text };
  return await client.post(`/conversations/${encodeURIComponent(conversationId)}/messages`, body);
}

export async function createDirectConversation(userId: string): Promise<MessageItem> {
  return await client.post("/conversations/direct", { recipientUserId: userId });
}

export async function updateMessage(conversationId: string, messageId: string, content: string): Promise<MessageItem> {
  return await client.patch(`/conversations/${encodeURIComponent(conversationId)}/messages/${messageId}`, { content });
}

export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  await client.delete(`/conversations/${encodeURIComponent(conversationId)}/messages/${messageId}`);
}

export async function listConversationAuditEvents(conversationId: string): Promise<any[]> {
  return await client.get(`/conversations/${encodeURIComponent(conversationId)}/audit`);
}

export async function updateConversationPreferences(conversationId: string, preferences: any): Promise<ConversationSummary> {
  return await client.patch(`/conversations/${encodeURIComponent(conversationId)}/preferences`, preferences);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await client.delete(`/conversations/${encodeURIComponent(conversationId)}`);
}

