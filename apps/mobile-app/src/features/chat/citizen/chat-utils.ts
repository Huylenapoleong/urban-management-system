import type { MutableRefObject } from "react";
import type { MessageType } from "@urban/shared-constants";
import type { MessageItem } from "@urban/shared-types";

type StructuredTextContent = {
  text: string;
  mention: unknown[];
};

export type RenderMessage = {
  primaryText: string;
  secondaryText?: string;
  typeLabel?: string;
};

const MAX_TRACKED_EVENT_IDS = 300;

export function parseConversationId(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) ? value[0] : undefined;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function fuzzyScore(query: string, target: string): number {
  if (!query) {
    return 1;
  }

  if (target.includes(query)) {
    return 4;
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);

  if (queryTokens.length > 0 && queryTokens.every((token) => target.includes(token))) {
    return 3;
  }

  let pointer = 0;
  for (const char of target) {
    if (char === query[pointer]) {
      pointer += 1;
      if (pointer === query.length) {
        return 2;
      }
    }
  }

  return 0;
}

export function rememberEvent(
  seen: MutableRefObject<Set<string>>,
  eventId: string,
): boolean {
  if (seen.current.has(eventId)) {
    return false;
  }

  seen.current.add(eventId);

  if (seen.current.size > MAX_TRACKED_EVENT_IDS) {
    const oldest = seen.current.values().next().value;
    if (oldest) {
      seen.current.delete(oldest);
    }
  }

  return true;
}

export function sortMessages(items: MessageItem[]): MessageItem[] {
  return [...items].sort(
    (left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime(),
  );
}

export function upsertSortedMessage(
  items: MessageItem[],
  nextItem: MessageItem,
): MessageItem[] {
  const next = items.filter((item) => item.id !== nextItem.id);
  next.push(nextItem);
  return sortMessages(next);
}

export function buildTextMessagePayload(text: string): string {
  return JSON.stringify({
    text: text.trim(),
    mention: [],
  });
}

function parseStructuredContent(content: string): StructuredTextContent | undefined {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (typeof parsed === "string") {
      return { text: parsed, mention: [] };
    }

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;
    return {
      text: typeof record.text === "string" ? record.text : "",
      mention: Array.isArray(record.mention) ? record.mention : [],
    };
  } catch {
    return undefined;
  }
}

export function getRenderMessage(item: MessageItem): RenderMessage {
  const structured = parseStructuredContent(item.content);
  const normalizedText = structured?.text?.trim() || item.content?.trim() || "";
  const attachmentHint = item.attachmentUrl ? "Co tep dinh kem" : undefined;

  switch (item.type as MessageType) {
    case "TEXT":
    case "EMOJI":
      return {
        primaryText: normalizedText || "(Tin nhan rong)",
        secondaryText: attachmentHint,
      };
    case "SYSTEM":
      return {
        primaryText: normalizedText || "Thong bao he thong",
        typeLabel: "SYSTEM",
      };
    case "IMAGE":
    case "VIDEO":
    case "AUDIO":
    case "DOC":
      return {
        primaryText: normalizedText || `[${item.type}]`,
        secondaryText: item.attachmentUrl || attachmentHint,
        typeLabel: item.type,
      };
    default:
      return {
        primaryText: normalizedText || item.type,
        secondaryText: attachmentHint,
      };
  }
}
