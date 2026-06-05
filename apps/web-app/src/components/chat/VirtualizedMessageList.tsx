import { ChevronDown } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type VirtualizedMessageListProps<T> = {
  messages: T[];
  containerRef: RefObject<HTMLDivElement | null>;
  endRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
  showScrollDown: boolean;
  onScroll: () => void;
  onRetryLoadMore: () => void;
  onScrollToBottom: () => void;
  getMessageKey: (message: T, index: number) => string;
  renderMessage: (message: T, index: number, messages: T[]) => ReactNode;
  afterMessages?: ReactNode;
  estimatedRowHeight?: number;
  overscan?: number;
  virtualizationThreshold?: number;
};

type VirtualizedMessageRowsProps<T> = {
  messages: T[];
  containerRef: RefObject<HTMLDivElement | null>;
  getMessageKey: (message: T, index: number) => string;
  renderMessage: (message: T, index: number, messages: T[]) => ReactNode;
  estimatedRowHeight?: number;
  overscan?: number;
  virtualizationThreshold?: number;
};

export function VirtualizedMessageRows<T>({
  messages,
  containerRef,
  getMessageKey,
  renderMessage,
  estimatedRowHeight = 112,
  overscan = 10,
  virtualizationThreshold = 120,
}: VirtualizedMessageRowsProps<T>) {
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });
  const [measuredHeights, setMeasuredHeights] = useState(
    () => new Map<string, number>(),
  );
  const rowObserversRef = useRef(new Map<string, ResizeObserver>());

  const updateViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    setViewport((current) => {
      const next = {
        height: container.clientHeight,
        scrollTop: container.scrollTop,
      };

      if (
        Math.abs(current.height - next.height) < 1 &&
        Math.abs(current.scrollTop - next.scrollTop) < 16
      ) {
        return current;
      }

      return next;
    });
  }, [containerRef]);

  useEffect(() => {
    updateViewport();
  }, [messages.length, updateViewport]);

  useEffect(() => {
    const handleResize = () => updateViewport();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateViewport]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => updateViewport();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, updateViewport]);

  useEffect(() => {
    const activeKeys = new Set(
      messages.map((message, index) => getMessageKey(message, index)),
    );

    setMeasuredHeights((current) => {
      let next: Map<string, number> | null = null;

      for (const key of current.keys()) {
        if (!activeKeys.has(key)) {
          next ??= new Map(current);
          next.delete(key);
        }
      }

      return next ?? current;
    });

    for (const [key, observer] of rowObserversRef.current.entries()) {
      if (!activeKeys.has(key)) {
        observer.disconnect();
        rowObserversRef.current.delete(key);
      }
    }
  }, [getMessageKey, messages]);

  const virtualWindow = useMemo(() => {
    const count = messages.length;
    const shouldVirtualize =
      count > virtualizationThreshold && viewport.height > 0;

    const heights = messages.map((message, index) => {
      const key = getMessageKey(message, index);
      return measuredHeights.get(key) ?? estimatedRowHeight;
    });
    const offsets = new Array<number>(count + 1);
    offsets[0] = 0;
    for (let index = 0; index < count; index += 1) {
      offsets[index + 1] = offsets[index] + heights[index];
    }

    if (!shouldVirtualize) {
      return {
        items: messages.map((message, index) => ({ index, message })),
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const overscanPx = overscan * estimatedRowHeight;
    const windowTop = Math.max(0, viewport.scrollTop - overscanPx);
    const windowBottom = Math.min(
      offsets[count],
      viewport.scrollTop + viewport.height + overscanPx,
    );

    let start = 0;
    while (start < count && offsets[start + 1] < windowTop) {
      start += 1;
    }

    let end = start;
    while (end < count && offsets[end] <= windowBottom) {
      end += 1;
    }

    return {
      items: messages
        .slice(start, end)
        .map((message, offset) => ({ index: start + offset, message })),
      paddingTop: offsets[start],
      paddingBottom: offsets[count] - offsets[end],
    };
  }, [
    estimatedRowHeight,
    getMessageKey,
    measuredHeights,
    messages,
    overscan,
    viewport.height,
    viewport.scrollTop,
    virtualizationThreshold,
  ]);

  const setRowRef = useCallback(
    (key: string) => (element: HTMLDivElement | null) => {
      rowObserversRef.current.get(key)?.disconnect();
      rowObserversRef.current.delete(key);

      if (!element) {
        return;
      }

      const updateHeight = () => {
        const height = element.offsetHeight;
        if (height <= 0) {
          return;
        }

        setMeasuredHeights((current) => {
          const previousHeight = current.get(key);
          if (previousHeight && Math.abs(previousHeight - height) < 1) {
            return current;
          }

          const next = new Map(current);
          next.set(key, height);
          return next;
        });
      };

      updateHeight();

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(updateHeight);
        observer.observe(element);
        rowObserversRef.current.set(key, observer);
      }
    },
    [],
  );

  useEffect(() => {
    const rowObservers = rowObserversRef.current;
    return () => {
      for (const observer of rowObservers.values()) {
        observer.disconnect();
      }
      rowObservers.clear();
    };
  }, []);

  return (
    <>
      {virtualWindow.paddingTop > 0 ? (
        <div style={{ height: virtualWindow.paddingTop }} aria-hidden />
      ) : null}

      {virtualWindow.items.map(({ index, message }) => {
        const key = getMessageKey(message, index);
        return (
          <div key={key} ref={setRowRef(key)} className="flex flex-col">
            {renderMessage(message, index, messages)}
          </div>
        );
      })}

      {virtualWindow.paddingBottom > 0 ? (
        <div style={{ height: virtualWindow.paddingBottom }} aria-hidden />
      ) : null}
    </>
  );
}

export function VirtualizedMessageList<T>({
  messages,
  containerRef,
  endRef,
  isLoading,
  isLoadingMore,
  loadMoreFailed,
  showScrollDown,
  onScroll,
  onRetryLoadMore,
  onScrollToBottom,
  getMessageKey,
  renderMessage,
  afterMessages,
  estimatedRowHeight = 112,
  overscan = 10,
  virtualizationThreshold = 120,
}: VirtualizedMessageListProps<T>) {
  const handleScroll = useCallback(() => {
    onScroll();
  }, [onScroll]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 min-h-0 bg-slate-50 dark:bg-slate-950 relative hide-scrollbar"
    >
      {isLoading ? (
        <div className="text-center py-4 text-sm text-gray-500 dark:text-slate-400">
          Dang tai tin nhan...
        </div>
      ) : null}

      <div className="flex flex-col gap-3 pb-4">
        {isLoadingMore ? (
          <div className="flex justify-center py-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent dark:border-slate-600 dark:border-t-transparent" />
              <span>Dang tai tin nhan cu...</span>
            </div>
          </div>
        ) : loadMoreFailed ? (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={onRetryLoadMore}
              className="flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              <span>Tai that bai</span>
              <span className="underline">Thu lai</span>
            </button>
          </div>
        ) : null}

        <VirtualizedMessageRows
          messages={messages}
          containerRef={containerRef}
          getMessageKey={getMessageKey}
          renderMessage={renderMessage}
          estimatedRowHeight={estimatedRowHeight}
          overscan={overscan}
          virtualizationThreshold={virtualizationThreshold}
        />

        {afterMessages}

        <div ref={endRef} />
      </div>

      {showScrollDown ? (
        <button
          type="button"
          onClick={onScrollToBottom}
          className="absolute bottom-24 right-6 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          title="Cuon xuong tin nhan moi nhat"
        >
          <ChevronDown size={18} />
        </button>
      ) : null}
    </div>
  );
}
