import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { sendMessageToChatbot } from "@/services/chatbot.api";
import { Bot, Send, X, MessagesSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ChatItem = {
  id: string;
  sender: "user" | "bot";
  text: string;
};

export function ChatbotFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: "welcome",
      sender: "bot",
      text: "Xin chào, tôi là trợ lý ảo AI. Tôi có thể giúp gì cho bạn trong việc quản lý, báo cáo sự cố hoặc tra cứu thông tin phường/xã?",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const chatbotMutation = useMutation({
    mutationFn: sendMessageToChatbot,
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), sender: "bot", text: data.response },
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
    chatbotMutation.mutate({ message: inputText });
    setInputText("");
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen && (
          <Button
            onClick={() => setIsOpen(true)}
            className="h-14 w-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center p-0"
          >
            <MessagesSquare size={24} />
          </Button>
        )}

        {isOpen && (
          <div className="bg-white w-[350px] h-[500px] max-h-[85vh] rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-10 pointer-events-auto shadow-blue-500/20">
            {/* Header */}
            <div className="bg-blue-600 p-4 flex items-center justify-between text-white shrink-0 z-10 shadow-sm relative">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-full">
                  <Bot size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Trợ lý AI</h3>
                  <p className="text-xs text-blue-100">Luôn sẵn sàng hỗ trợ</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20 p-1.5 rounded-md transition-colors"
                title="Đóng trợ lý"
              >
                <X size={20} />
              </button>
            </div>

            {/* Chat Content */}
            <div className="flex-1 p-4 bg-slate-50 overflow-y-auto overflow-x-hidden min-h-0 relative">
              <div className="flex flex-col gap-4">
                {messages.map((msg) => {
                  const isUser = msg.sender === "user";
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
                            : "bg-white text-gray-800 border border-gray-100 rounded-tl-sm"
                        }`}
                      >
                        {msg.text}
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
                    <div className="px-4 py-3 bg-white border border-gray-100 rounded-2xl rounded-tl-sm shadow-sm flex gap-1 items-center h-auto min-h-[36px]">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input area */}
            <form
              onSubmit={handleSend}
              className="p-3 bg-white border-t border-gray-100 flex gap-2 shrink-0"
            >
              <Input
                placeholder="Nhắn gì đó..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-gray-50 focus-visible:ring-blue-500 rounded-full"
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
        )}
      </div>
    </>
  );
}