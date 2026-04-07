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

