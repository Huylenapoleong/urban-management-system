import ApiClient from "@/lib/api-client";
import { socketClient } from "@/lib/socket-client";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type { ConversationSummary, MessageItem } from "@urban/shared-types";

type ChatMessageType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOC" | "EMOJI" | "SYSTEM";

export interface SendMessageInput {
  text?: string;
  attachmentKey?: string;
  type?: ChatMessageType;
}

function createClientMessageId(): string {
  // Use a deterministic prefix so backend logs can quickly identify web-app send attempts.
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toRouteSafeConversationId(conversationId: string): string {
  const raw = conversationId.trim();
  if (!raw) return conversationId;

  if (/^grp#/i.test(raw)) {
    return `group:${raw.replace(/^grp#/i, "").trim()}`;
  }

  if (/^group#/i.test(raw)) {
    return `group:${raw.replace(/^group#/i, "").trim()}`;
  }

  return raw;
}

function buildConversationIdCandidates(conversationId: string): string[] {
  const raw = conversationId.trim();
  if (!raw) {
    return [conversationId];
  }

  const candidates: string[] = [raw];

  if (/^group:/i.test(raw)) {
    const id = raw.replace(/^group:/i, "").trim();
    if (id) {
      candidates.push(id, `GRP#${id}`);
    }
  } else if (/^grp:/i.test(raw)) {
    const id = raw.replace(/^grp:/i, "").trim();
    if (id) {
      candidates.push(`group:${id}`, id, `GRP#${id}`);
    }
  } else if (/^grp#/i.test(raw)) {
    const id = raw.replace(/^grp#/i, "").trim();
    if (id) {
      candidates.push(`group:${id}`, id);
    }
  } else if (/^group#/i.test(raw)) {
    const id = raw.replace(/^group#/i, "").trim();
    if (id) {
      candidates.push(`group:${id}`, id, `GRP#${id}`);
    }
  } else if (/^dm:/i.test(raw)) {
    const id = raw.replace(/^dm:/i, "").trim();
    if (id) {
      candidates.push(id, `DM#${id}`);
    }
  } else if (/^dm#/i.test(raw)) {
    const id = raw.replace(/^dm#/i, "").trim();
    if (id) {
      candidates.push(`dm:${id}`, id);
    }
  } else {
    // Legacy/bare ids: prefer trying group form first (common for this codebase), then raw.
    candidates.push(`group:${raw}`);
  }

  return [...new Set(candidates.filter(Boolean))];
}

export async function listConversations(searchTerm?: string): Promise<ConversationSummary[]> {
  try {
    const q = searchTerm?.trim();
    const conversationsPath = q
      ? `/conversations?q=${encodeURIComponent(q)}`
      : "/conversations";
    const groupsPath = q
      ? `/groups?mine=true&q=${encodeURIComponent(q)}`
      : "/groups?mine=true";

    const [conversations, joinedGroups] = await Promise.all([
      ApiClient.get(conversationsPath, {
        headers: {
          "Cache-Control": "no-cache, no-store, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }).catch(() => []) as Promise<ConversationSummary[]>,
      ApiClient.get(groupsPath, {
        headers: {
          "Cache-Control": "no-cache, no-store, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }).catch(() => []) as Promise<any[]>,
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
  let lastError: unknown;
  for (const id of buildConversationIdCandidates(conversationId)) {
    try {
      return await ApiClient.get(`/conversations/${encodeURIComponent(id)}/messages?limit=100`);
    } catch (error: any) {
      lastError = error;
      if (error?.status !== 400) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function markConversationAsRead(conversationId: string): Promise<void> {
  let lastError: unknown;
  for (const id of buildConversationIdCandidates(conversationId)) {
    try {
      await ApiClient.post(`/conversations/${encodeURIComponent(id)}/read`);
      return;
    } catch (error: any) {
      lastError = error;
      if (error?.status !== 400) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function sendMessage(
  conversationId: string,
  input: SendMessageInput,
): Promise<void> {
  const trimmedText = input.text?.trim() ?? "";
  const attachmentKey = input.attachmentKey?.trim();

  if (!trimmedText && !attachmentKey) {
    throw {
      message: "Message must contain text or an attachment.",
      status: 400,
    };
  }

  const payload: Record<string, unknown> = {
    conversationId: toRouteSafeConversationId(conversationId),
    clientMessageId: createClientMessageId(),
    type: input.type || (attachmentKey ? "DOC" : "TEXT"),
  };

  if (trimmedText) {
    payload.content = JSON.stringify({ text: trimmedText, mention: [] });
  }

  if (attachmentKey) {
    payload.attachmentKey = attachmentKey;
  }

  await socketClient.safeEmitValidated(
    CHAT_SOCKET_EVENTS.MESSAGE_SEND,
    payload,
  );
}
