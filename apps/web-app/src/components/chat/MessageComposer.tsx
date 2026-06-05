import { type ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type MessageComposerProps = ComponentPropsWithoutRef<"form">;

export function MessageComposer({ className, ...props }: MessageComposerProps) {
  return (
    <form
      {...props}
      className={cn(
        "relative z-10 shrink-0 space-y-1 border-t border-slate-200/80 bg-white px-3 pb-1.5 pt-2 shadow-[0_-1px_0_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900 sm:px-4",
        className,
      )}
    />
  );
}
