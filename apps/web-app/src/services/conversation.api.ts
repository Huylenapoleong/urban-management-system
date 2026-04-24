import ApiClient, {
  buildSessionMetadataHeaders,
  readAccessToken,
} from "@/lib/api-client";
import { socketClient } from "@/lib/socket-client";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type {
  ConversationSummary,
  GroupMetadata,
  MessageItem,
} from "@urban/shared-types";

type ChatMessageType =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "DOC"
  | "EMOJI"
  | "SYSTEM";

export interface SendMessageInput {
  text?: string;
  attachmentKey?: string;
  type?: ChatMessageType;
  replyTo?: string;
  mentions?: string[];
}

export type RecallScope = "SELF" | "EVERYONE";

export interface CursorPage<T> {
  items: T[];
  nextCursor?: string;
}

type ConversationListCacheEntry = {
  lastFetchedAt: number;
  data: ConversationSummary[];
  inFlight?: Promise<ConversationSummary[]>;
};

type MessagePagePayload = {
  success?: boolean;
  data?: MessageItem[];
  meta?: {
    nextCursor?: string;
  };
  message?: string;
  error?: {
    message?: string;
  };
};

type SendMessageAck = {
  message?: MessageItem;
  data?: MessageItem | { message?: MessageItem };
};

const CONVERSATION_LIST_MIN_FETCH_INTERVAL_MS = 1500;
const conversationListCache = new Map<string, ConversationListCacheEntry>();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorStatus(error: unknown): number | undefined {
  if (!isObject(error)) {
    return undefined;
  }

  return typeof error.status === "number" ? error.status : undefined;
}

function getErrorMessage(error: unknown): string | undefined {
  if (!isObject(error)) {
    return undefined;
  }

  return typeof error.message === "string" ? error.message : undefined;
}

function isMessageItem(value: unknown): value is MessageItem {
  return isObject(value) && typeof value.id === "string";
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

function shouldRetryOnConversationId400(error: unknown): boolean {
  if (getErrorStatus(error) !== 400) {
    return false;
  }

  const message = String(getErrorMessage(error) || "").toLowerCase();
  return (
    message.includes("conversation id") ||
    message.includes("unsupported conversation") ||
    message.includes("invalid dm conversation") ||
    message.includes("incomplete")
  );
}

export async function listConversations(
  searchTerm?: string,
): Promise<ConversationSummary[]> {
  const q = searchTerm?.trim() ?? "";
  const cacheKey = q.toLowerCase();
  const now = Date.now();
  const cachedEntry = conversationListCache.get(cacheKey);

  if (cachedEntry?.inFlight) {
    return cachedEntry.inFlight;
  }

  if (
    cachedEntry &&
    now - cachedEntry.lastFetchedAt < CONVERSATION_LIST_MIN_FETCH_INTERVAL_MS
  ) {
    return cachedEntry.data;
  }

  const requestPromise = (async () => {
    try {
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
        }).catch(() => []) as Promise<GroupMetadata[]>,
      ]);

      const result = [...conversations];

      // Merge groups that user joined but don't have a conversation yet (because no message was sent)
      for (const group of joinedGroups) {
        const convId = `group:${group.id}`;
        if (
          !result.find((conversation) => conversation.conversationId === convId)
        ) {
          result.push({
            conversationId: convId,
            groupName: group.groupName,
            lastMessagePreview: "Nhóm mới tham gia",
            lastSenderName: "Hệ thống",
            unreadCount: 0,
            isGroup: true,
            deletedAt: null,
            updatedAt: group.updatedAt || new Date().toISOString(),
          });
        }
      }

      // Sort by updatedAt desc
      result.sort(
        (a, b) =>
          new Date(b.updatedAt || 0).getTime() -
          new Date(a.updatedAt || 0).getTime(),
      );

      conversationListCache.set(cacheKey, {
        lastFetchedAt: Date.now(),
        data: result,
      });

      return result;
    } catch (error) {
      console.error("Failed to list conversations", error);
      return cachedEntry?.data ?? [];
    } finally {
      const latestEntry = conversationListCache.get(cacheKey);
      if (latestEntry?.inFlight) {
        conversationListCache.set(cacheKey, {
          lastFetchedAt: latestEntry.lastFetchedAt,
          data: latestEntry.data,
        });
      }
    }
  })();

  conversationListCache.set(cacheKey, {
    lastFetchedAt: cachedEntry?.lastFetchedAt ?? 0,
    data: cachedEntry?.data ?? [],
    inFlight: requestPromise,
  });

  return requestPromise;
}

export async function listMessages(
  conversationId: string,
): Promise<MessageItem[]> {
  const page = await listMessagesPage(conversationId, { limit: 100 });
  return page.items;
}

export async function listMessagesPage(
  conversationId: string,
  params?: {
    cursor?: string;
    limit?: number;
  },
): Promise<CursorPage<MessageItem>> {
  const limit = params?.limit ?? 40;
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  if (params?.cursor) {
    query.set("cursor", params.cursor);
  }

  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
  const token = readAccessToken();

  let lastError: unknown;
  for (const id of buildConversationIdCandidates(conversationId)) {
    try {
      const response = await fetch(
        `${baseUrl}/conversations/${encodeURIComponent(id)}/messages?${query.toString()}`,
        {
          method: "GET",
          headers: {
            ...buildSessionMetadataHeaders(),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );

      const payload = (await response
        .json()
        .catch(() => null)) as MessagePagePayload | null;
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
    } catch (error: unknown) {
      lastError = error;
      if (getErrorStatus(error) !== 400) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function markConversationAsRead(
  conversationId: string,
): Promise<void> {
  let lastError: unknown;
  for (const id of buildConversationIdCandidates(conversationId)) {
    try {
      await ApiClient.post(`/conversations/${encodeURIComponent(id)}/read`);
      return;
    } catch (error: unknown) {
      lastError = error;
      if (getErrorStatus(error) !== 400) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function sendMessage(
  conversationId: string,
  input: SendMessageInput,
): Promise<MessageItem | undefined> {
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
    payload.content = JSON.stringify({
      text: trimmedText,
      mention: Array.isArray(input.mentions)
        ? [...new Set(input.mentions.filter(Boolean))]
        : [],
    });
  }

  if (attachmentKey) {
    payload.attachmentKey = attachmentKey;
  }

  if (input.replyTo?.trim()) {
    payload.replyTo = input.replyTo.trim();
  }

  const response = await socketClient.safeEmitValidated<SendMessageAck>(
    CHAT_SOCKET_EVENTS.MESSAGE_SEND,
    payload,
  );

  const candidate =
    response.message ||
    (isObject(response.data) && isMessageItem(response.data.message)
      ? response.data.message
      : undefined) ||
    (isMessageItem(response.data) ? response.data : undefined);

  if (isMessageItem(candidate)) {
    return candidate;
  }

  return undefined;
}

export async function updateMessage(
  conversationId: string,
  messageId: string,
  text: string,
): Promise<void> {
  let lastError: unknown;
  const normalizedText = text.trim();
  const normalizedConversationId = toRouteSafeConversationId(conversationId);
  const canonicalContent = JSON.stringify({
    text: normalizedText,
    mention: [],
  });

  // Prefer websocket update path to match realtime contract and avoid REST-specific validation mismatches.
  try {
    await socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.MESSAGE_UPDATE, {
      conversationId: normalizedConversationId,
      messageId,
      content: canonicalContent,
    });
    return;
  } catch (error) {
    lastError = error;
  }

  for (const id of buildConversationIdCandidates(conversationId)) {
    try {
      await ApiClient.patch(
        `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`,
        {
          content: canonicalContent,
        },
      );
      return;
    } catch (error: unknown) {
      lastError = error;
      if (!shouldRetryOnConversationId400(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
  scope: RecallScope = "SELF",
): Promise<{
  conversationId: string;
  messageId: string;
  scope: RecallScope;
  recalledAt: string;
}> {
  let lastError: unknown;

  for (const id of buildConversationIdCandidates(conversationId)) {
    try {
      return await ApiClient.post(
        `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/recall`,
        { scope },
      );
    } catch (error: unknown) {
      lastError = error;
      if (getErrorStatus(error) !== 400) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function forwardMessage(
  conversationId: string,
  messageId: string,
  targetConversationIds: string[],
): Promise<MessageItem[]> {
  const conversationIds = [
    ...new Set(targetConversationIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (conversationIds.length === 0) {
    throw {
      message: "conversationIds is required.",
      status: 400,
    };
  }

  let lastError: unknown;

  for (const id of buildConversationIdCandidates(conversationId)) {
    try {
      return await ApiClient.post(
        `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/forward`,
        { conversationIds },
      );
    } catch (error: unknown) {
      lastError = error;
      if (getErrorStatus(error) !== 400) {
        throw error;
      }
    }
  }

  throw lastError;
}
