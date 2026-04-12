import { useState, useRef, useEffect } from "react";
import { Search, Phone, Video, Info, UserRound, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useWebRTC } from "@/hooks/shared/useWebRTC";
import { CallModal } from "@/components/CallModal";
import { useAuth } from "@/providers/AuthProvider";
import { useConversations, useMessages } from "@/hooks/shared/useChatData";
import { format } from "date-fns";

export function ChatPage() {
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const rtc = useWebRTC();
  const { user } = useAuth();
  
  // Data fetching
  const { data: conversations = [], isLoading: loadingConversations } = useConversations();
  const { data: messages = [], isLoading: loadingMessages, sendMessage, isSending } = useMessages(activeChat || undefined);

  const activeContact = conversations.find((c) => c.conversationId === activeChat);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when messages load or new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStartCall = (isVideo: boolean) => {
    if (!activeContact) return;
    
    rtc.startCall({
      isVideo,
      // Target User ID temporarily set to conversationId for group-based room joining
      targetUserId: activeContact.conversationId,
      callerName: activeContact.groupName || activeContact.conversationId,
      conversationId: activeContact.conversationId,
    });
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeChat || !inputText.trim() || isSending) return;
    sendMessage(inputText);
    setInputText("");
  };

  return (
    <div className="flex h-full w-full relative overflow-hidden">
      <CallModal rtc={rtc} />
      
      {/* Cột trái: Master (Danh sách hội thoại) */}
      <div className="w-[340px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input 
              type="text" 
              placeholder="Tìm kiếm danh bạ, tin nhắn..." 
              className="pl-9 h-9 bg-gray-100 border-none focus-visible:ring-1 focus-visible:ring-blue-500" 
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingConversations && <div className="p-4 text-center text-gray-500 text-sm">Đang tải cuộc trò chuyện...</div>}
          {!loadingConversations && conversations.length === 0 && (
             <div className="p-4 text-center text-gray-500 text-sm">Chưa có hội thoại nào</div>
          )}
          {conversations.map((chat) => (
            <div 
              key={chat.conversationId} 
              onClick={() => setActiveChat(chat.conversationId)}
              className={`flex items-center gap-3 p-3 mx-2 my-1 rounded-lg cursor-pointer transition-colors ${
                activeChat === chat.conversationId ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
            >
              <Avatar className="h-12 w-12 border border-gray-100">
                <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                  {chat.groupName ? chat.groupName.charAt(0).toUpperCase() : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-medium text-[15px] truncate">{chat.groupName || "Không rõ tên"}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {chat.updatedAt ? format(new Date(chat.updatedAt), 'HH:mm') : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={"text-sm truncate " + (chat.unreadCount > 0 ? "font-semibold text-slate-800" : "text-gray-500")}>
                    {chat.lastMessagePreview || "Chưa có tin nhắn"}
                  </span>
                  {chat.unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cột phải: Detail (Chi tiết Chat) */}
      <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden h-full">
        {!activeChat ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 mt-20">
            <UserRound size={60} className="opacity-20" />
            <p>Chọn một cuộc trò chuyện để bắt đầu nhắn tin</p>
          </div>
        ) : (
          <>
            {/* Header khung chat */}
            <div className="h-16 border-b border-gray-200 bg-white flex flex-shrink-0 items-center justify-between px-4 z-10 shadow-sm relative">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                    {activeContact?.groupName?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-semibold text-base leading-none">
                    {activeContact?.groupName || "Không rõ tên"}
                  </h2>
                  <span className="text-xs text-green-600 font-medium">Vừa mới truy cập</span>
                </div>
              </div>
              <div className="flex items-center text-gray-600">
                <button 
                  className="p-2 hover:bg-gray-100 rounded-full transition" 
                  onClick={() => handleStartCall(false)}
                  title="Gọi thoại"
                >
                  <Phone size={20} />
                </button>
                <button 
                  className="p-2 hover:bg-gray-100 rounded-full transition" 
                  onClick={() => handleStartCall(true)}
                  title="Gọi video"
                >
                  <Video size={20} />
                </button>
                <div className="w-px h-6 bg-gray-200 mx-2"></div>
                <button className="p-2 hover:bg-gray-100 rounded-full transition" title="Thông tin chi tiết"><Info size={20} /></button>
              </div>
            </div>

            {/* Nội dung tin nhắn */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-slate-50 relative">
              {loadingMessages && <div className="text-center py-4 text-sm text-gray-500">Đang tải tin nhắn...</div>}
              
              <div className="flex flex-col gap-3 pb-4">
                {/* Đảo ngược array nếu API trả về tin mới nhất trước (thường thấy nếu limit offset) */}
                {[...messages].reverse().map((msg) => {
                  const isMe = msg.senderId === user?.sub;
                  return (
                    <div key={msg.id} className={`flex max-w-[70%] ${isMe ? "self-end" : "self-start"} flex-col`}>
                      <div 
                        className={`px-4 py-2 rounded-2xl shadow-sm ${
                          isMe 
                            ? "bg-blue-600 text-white rounded-br-sm" 
                            : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm"
                        }`}
                      >
                        <p className="text-[15px]">
                          {(() => {
                            try {
                              const parsed = JSON.parse(msg.content);
                              return parsed.text || msg.content;
                            } catch {
                              return msg.content;
                            }
                          })()}
                        </p>
                      </div>
                      <span className={`text-[10px] text-gray-400 mt-1 ${isMe ? "text-right" : "text-left"}`}>
                        {format(new Date(msg.sentAt), "HH:mm")}
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Vùng nhập liệu */}
            <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-200 flex gap-2 shrink-0 z-10 relative">
              <Input 
                type="text" 
                placeholder="Nhập tin nhắn..." 
                className="flex-1 bg-gray-50 focus-visible:ring-blue-500 h-11"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isSending}
              />
              <button 
                type="submit" 
                disabled={isSending || !inputText.trim()}
                className="h-11 w-11 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 transition-colors"
                title="Gửi"
              >
                <Send size={18} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
