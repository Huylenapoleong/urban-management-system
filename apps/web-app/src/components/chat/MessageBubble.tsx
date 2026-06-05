import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type MessageBubbleContainerProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children: ReactNode;
  focused: boolean;
  isMe: boolean;
  startsSenderBlock: boolean;
};

export const MessageBubbleContainer = forwardRef<
  HTMLDivElement,
  MessageBubbleContainerProps
>(function MessageBubbleContainer(
  { children, className, focused, isMe, startsSenderBlock, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        "group relative flex max-w-[86%] flex-col rounded-2xl transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 sm:max-w-[78%] lg:max-w-[70%]",
        isMe ? "self-end" : "self-start",
        focused
          ? "ring-2 ring-amber-300/80 ring-offset-2 ring-offset-slate-100 dark:ring-amber-400/70 dark:ring-offset-slate-950"
          : "",
        startsSenderBlock ? "" : "-mt-2",
        className,
      )}
    >
      {children}
    </div>
  );
});
