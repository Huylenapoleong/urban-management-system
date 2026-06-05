import { type ReactNode, type RefObject } from "react";
import type { MessageItem } from "@urban/shared-types";

import { VirtualizedMessageRows } from "./VirtualizedMessageList";

type MessageListProps = {
  messages: MessageItem[];
  containerRef: RefObject<HTMLDivElement | null>;
  renderMessage: (
    message: MessageItem,
    index: number,
    messages: MessageItem[],
  ) => ReactNode;
};

const getMessageKey = (message: MessageItem) => message.id;

export function MessageList({
  messages,
  containerRef,
  renderMessage,
}: MessageListProps) {
  return (
    <VirtualizedMessageRows
      messages={messages}
      containerRef={containerRef}
      getMessageKey={getMessageKey}
      renderMessage={renderMessage}
    />
  );
}
