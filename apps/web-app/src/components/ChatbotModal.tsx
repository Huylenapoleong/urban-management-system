import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Send, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMessageToChatbot } from "@/services/chatbot.api";

type ChatItem = {
  id: string;
  sender: "user" | "bot";
  text: string;
};

type BotMessageLine = {
  kind: "paragraph" | "bullet" | "numbered";
  text: string;
  marker?: string;
};

function formatBotMessage(text: string): BotMessageLine[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(\d+)\.\s*\n+\s*/g, "$1. ")
    .replace(/[-*•]\s*\n+\s*/g, "- ")
    .trim();

  const rawLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const lines =
    rawLines.length === 1 && /\s-\s/.test(rawLines[0])
      ? rawLines[0]
          .split(/\s-\s/)
          .map((part, index) => (index === 0 ? part.trim() : `- ${part.trim()}`))
      : rawLines;

  return lines.map((line) => {
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      return {
        kind: "numbered",
        marker: `${numbered[1]}.`,
        text: numbered[2],
      } satisfies BotMessageLine;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      return {
        kind: "bullet",
        text: bullet[1],
      } satisfies BotMessageLine;
    }

    return {
      kind: "paragraph",
      text: line,
    } satisfies BotMessageLine;
  });
}

export function ChatbotModal({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: "welcome",
      sender: "bot",
      text: "Xin chào, tôi là trợ lý ảo AI. Tôi có thể giúp gì cho bạn trong việc quản lý, báo cáo sự cố hoặc tra cứu thông tin phường/xã?",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(() => {
    if (typeof window === "undefined") {
      return { x: 16, y: 16 };
    }

    const initialWidth = Math.min(window.innerWidth * 0.92, 520);
    const initialHeight = Math.min(window.innerHeight * 0.78, 620);

    return {
      x: Math.max(16, window.innerWidth - initialWidth - 24),
      y: Math.max(16, window.innerHeight - initialHeight - 24),
    };
  });

  const clampPosition = (x: number, y: number) => {
    const width =
      modalRef.current?.offsetWidth ??
      (typeof window === "undefined" ? 520 : Math.min(window.innerWidth * 0.92, 520));
    const height =
      modalRef.current?.offsetHeight ??
      (typeof window === "undefined" ? 620 : Math.min(window.innerHeight * 0.78, 620));

    const maxX = Math.max(16, window.innerWidth - width - 16);
    const maxY = Math.max(16, window.innerHeight - height - 16);

    return {
      x: Math.min(Math.max(16, x), maxX),
      y: Math.min(Math.max(16, y), maxY),
    };
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampPosition(prev.x, prev.y));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      const nextX = drag.originX + (event.clientX - drag.startX);
      const nextY = drag.originY + (event.clientY - drag.startY);
      setPosition(clampPosition(nextX, nextY));
    };

    const stopDragging = () => {
      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, [isDragging]);

  const chatbotMutation = useMutation({
    mutationFn: sendMessageToChatbot,
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), sender: "bot", text: data.answer },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "bot",
          text: "Xin lỗi, hiện tại tôi không thể kết nối tới máy chủ. Vui lòng thử lại sau.",
        },
      ]);
    },
  });

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || chatbotMutation.isPending) return;

    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), sender: "user", text: inputText },
    ]);
    chatbotMutation.mutate({ question: inputText });
    setInputText("");
  };

  const handleHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    const modal = modalRef.current;
    if (!modal) {
      return;
    }

    const rect = modal.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
    };
    setIsDragging(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/35"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="absolute w-[min(92vw,520px)] h-[min(78vh,620px)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col overflow-hidden"
        style={{ left: position.x, top: position.y }}
      >
        <div
          className={`bg-blue-600 p-4 flex items-center justify-between text-white shrink-0 cursor-move select-none touch-none ${
            isDragging ? "opacity-90" : ""
          }`}
          onPointerDown={handleHeaderPointerDown}
        >
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-full">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Trợ lý AI</h2>
              <p className="text-xs text-blue-100">Hỗ trợ tác vụ quản trị đô thị</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-1.5 rounded-md transition-colors"
            title="Đóng chatbot"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 p-4 bg-slate-50 dark:bg-slate-900 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="flex flex-col gap-4">
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              const formattedBotLines = isUser ? [] : formatBotMessage(msg.text);
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 max-w-[85%] ${
                    isUser ? "self-end flex-row-reverse" : "self-start"
                  }`}
                >
                  {!isUser && (
                    <Avatar className="h-8 w-8 mt-1 border border-blue-100 bg-blue-50 shrink-0">
                      <AvatarFallback className="bg-blue-100 text-blue-600">
                        <Bot size={16} />
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                      isUser
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 border border-gray-100 dark:border-slate-700 rounded-tl-sm"
                    }`}
                  >
                    {isUser ? (
                      <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {formattedBotLines.map((line, index) => {
                          if (line.kind === "numbered") {
                            return (
                              <p key={`${msg.id}-${index}`} className="leading-relaxed break-words flex gap-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{line.marker}</span>
                                <span className="whitespace-pre-wrap">{line.text}</span>
                              </p>
                            );
                          }

                          if (line.kind === "bullet") {
                            return (
                              <p key={`${msg.id}-${index}`} className="leading-relaxed break-words flex gap-2">
                                <span className="font-semibold">•</span>
                                <span className="whitespace-pre-wrap">{line.text}</span>
                              </p>
                            );
                          }

                          return (
                            <p key={`${msg.id}-${index}`} className="leading-relaxed whitespace-pre-wrap break-words">
                              {line.text}
                            </p>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {chatbotMutation.isPending && (
              <div className="flex gap-2 max-w-[85%] self-start">
                <Avatar className="h-8 w-8 mt-1 border border-blue-100 bg-blue-50 shrink-0">
                  <AvatarFallback className="bg-blue-100 text-blue-600">
                    <Bot size={16} />
                  </AvatarFallback>
                </Avatar>
                <div className="px-4 py-3 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl rounded-tl-sm shadow-sm flex gap-1 items-center min-h-[36px]">
                  <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-slate-300 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <form onSubmit={handleSend} className="p-3 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700 flex gap-2 shrink-0">
          <Input
            placeholder="Nhắn gì đó..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400 focus-visible:ring-blue-500 rounded-full"
            disabled={chatbotMutation.isPending}
          />
          <Button
            type="submit"
            disabled={!inputText.trim() || chatbotMutation.isPending}
            className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 p-0 flex items-center justify-center shrink-0"
          >
            <Send size={16} className={inputText.trim() ? "text-white" : "text-blue-200"} />
          </Button>
        </form>
      </div>
    </div>
  );
}
