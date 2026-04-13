import { useState, useRef, useEffect } from "react";
import { Search, Phone, Video, Info, UserRound, Send, Paperclip, X, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useWebRTC } from "@/hooks/shared/useWebRTC";
import { CallModal } from "@/components/CallModal";
import { useAuth } from "@/providers/AuthProvider";
import { useConversations, useMessages } from "@/hooks/shared/useChatData";
import { format } from "date-fns";
import { useLocation } from "react-router-dom";
import { uploadMedia } from "@/services/upload.api";

type ChatMessageType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOC" | "EMOJI" | "SYSTEM";

type ChatNavigationState = {
  conversationId?: string;
  displayName?: string;
};

type QueuedAttachment = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "failed";
};

export function ChatPage() {
  const location = useLocation();
  const chatState = (location.state ?? {}) as ChatNavigationState;
  const [activeChat, setActiveChat] = useState<string | null>(chatState.conversationId ?? null);
  const [inputText, setInputText] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [queuedAttachments, setQueuedAttachments] = useState<QueuedAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rtc = useWebRTC();
  const { user } = useAuth();
  
  // Data fetching
  const { data: conversations = [], isLoading: loadingConversations } = useConversations(conversationSearch);
  const {
    data: messages = [],
    isLoading: loadingMessages,
    sendMessageAsync,
    isSending,
  } = useMessages(activeChat || undefined);

  const syntheticConversation =
    chatState.conversationId && chatState.displayName
      ? {
          conversationId: chatState.conversationId,
          groupName: chatState.displayName,
          updatedAt: new Date().toISOString(),
          unreadCount: 0,
          lastMessagePreview: "",
          lastSenderName: "",
        }
      : null;

  const mergedConversations = syntheticConversation
    ? [
        syntheticConversation,
        ...conversations.filter((c) => c.conversationId !== syntheticConversation.conversationId),
      ]
    : conversations;

  const normalizedSearch = conversationSearch.trim().toLowerCase();
  const renderedConversations = normalizedSearch
    ? mergedConversations.filter((conversation) => {
        const haystack = [
          conversation.groupName,
          conversation.lastMessagePreview,
          conversation.lastSenderName,
          conversation.conversationId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : mergedConversations;

  const activeContact = renderedConversations.find((c) => c.conversationId === activeChat);
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

  const resolveMessageType = (file?: File | null): ChatMessageType => {
    if (!file) {
      return "TEXT";
    }

    if (file.type.startsWith("image/")) {
      return "IMAGE";
    }

    if (file.type.startsWith("video/")) {
      return "VIDEO";
    }

    if (file.type.startsWith("audio/")) {
      return "AUDIO";
    }

    return "DOC";
  };

  const isImageUrl = (url?: string, type?: string): boolean => {
    if (!url) {
      return false;
    }
    if (type === "IMAGE") {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
  };

  const toAttachmentId = (file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  };

  const enqueueAttachments = (files?: File[] | FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    const nextItems = Array.from(files);
    setQueuedAttachments((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const additions: QueuedAttachment[] = [];

      nextItems.forEach((file) => {
        const id = toAttachmentId(file);
        if (existingIds.has(id)) {
          return;
        }
        additions.push({
          id,
          file,
          progress: 0,
          status: "queued",
        });
      });

      return [...prev, ...additions];
    });
  };

  const removeAttachment = (id: string) => {
    setQueuedAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleComposerPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = Array.from(e.clipboardData.items || []);
    const pastedFiles = items
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (pastedFiles.length === 0) {
      return;
    }

    e.preventDefault();
    enqueueAttachments(pastedFiles);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!activeChat) {
      return;
    }
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const nextTarget = e.relatedTarget as Node | null;
    if (nextTarget && e.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!activeChat) {
      return;
    }
    e.preventDefault();
    setIsDragOver(false);
    enqueueAttachments(e.dataTransfer.files);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeChat || isSending || isUploading) return;

    const hasText = Boolean(inputText.trim());
    const hasAttachment = queuedAttachments.length > 0;
    if (!hasText && !hasAttachment) {
      return;
    }

    try {
      let pendingText = inputText;
      let sentAny = false;
      setIsUploading(true);

      if (queuedAttachments.length === 0) {
        await sendMessageAsync({ text: pendingText, type: "TEXT" });
        pendingText = "";
        sentAny = true;
      } else {
        for (const item of queuedAttachments) {
          setQueuedAttachments((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: "uploading", progress: 0 }
                : entry,
            ),
          );

          try {
            const uploaded = await uploadMedia({
              file: item.file,
              target: "MESSAGE",
              entityId: activeChat,
              onProgress: (percent) => {
                setQueuedAttachments((prev) =>
                  prev.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, progress: percent, status: "uploading" }
                      : entry,
                  ),
                );
              },
            });

            await sendMessageAsync({
              text: pendingText,
              attachmentKey: uploaded.key,
              type: resolveMessageType(item.file),
            });

            pendingText = "";
            sentAny = true;
            setQueuedAttachments((prev) => prev.filter((entry) => entry.id !== item.id));
          } catch {
            setQueuedAttachments((prev) =>
              prev.map((entry) =>
                entry.id === item.id
                  ? { ...entry, status: "failed" }
                  : entry,
              ),
            );
          }
        }
      }

      if (sentAny) {
        setInputText(pendingText);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="flex h-full w-full relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CallModal rtc={rtc} />
      {isDragOver ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-blue-600/10 border-2 border-dashed border-blue-400 pointer-events-none">
          <div className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-blue-700 shadow">
            Thả tệp vào đây để gửi
          </div>
        </div>
      ) : null}
      
      {/* Cột trái: Master (Danh sách hội thoại) */}
      <div className="w-[340px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input 
              type="text" 
              placeholder="Tìm kiếm danh bạ, tin nhắn..." 
              className="pl-9 h-9 bg-gray-100 border-none focus-visible:ring-1 focus-visible:ring-blue-500" 
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingConversations && <div className="p-4 text-center text-gray-500 text-sm">Đang tải cuộc trò chuyện...</div>}
           {!loadingConversations && renderedConversations.length === 0 && (
             <div className="p-4 text-center text-gray-500 text-sm">
              {conversationSearch.trim() ? "Không tìm thấy hội thoại phù hợp" : "Chưa có hội thoại nào"}
             </div>
          )}
          {renderedConversations.map((chat) => (
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
                        {msg.attachmentUrl ? (
                          isImageUrl(msg.attachmentUrl, msg.type) ? (
                            <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                              <img
                                src={msg.attachmentUrl}
                                alt="Tin nhan dinh kem"
                                className="max-h-56 max-w-full rounded-lg border border-black/10 object-cover"
                              />
                            </a>
                          ) : (
                            <a
                              href={msg.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`mt-2 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                                isMe ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              <FileText className="h-4 w-4" />
                              Tep dinh kem
                            </a>
                          )
                        ) : null}
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
            <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-200 shrink-0 z-10 relative space-y-2">
              {queuedAttachments.length > 0 ? (
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {queuedAttachments.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700">{item.file.name}</p>
                          <p className="text-xs text-slate-500">
                            {Math.max(1, Math.round(item.file.size / 1024))} KB
                            {item.status === "failed" ? " • Loi upload" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(item.id)}
                          className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                          title="Bo tep"
                          disabled={item.status === "uploading"}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            item.status === "failed" ? "bg-red-500" : "bg-blue-500"
                          }`}
                          style={{ width: `${item.status === "failed" ? 100 : item.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => enqueueAttachments(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-11 w-11 flex items-center justify-center border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-md transition-colors"
                title="Dinh kem anh hoac file"
              >
                <Paperclip size={18} />
              </button>
              <Input 
                type="text" 
                placeholder="Nhập tin nhắn..." 
                className="flex-1 bg-gray-50 focus-visible:ring-blue-500 h-11"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isSending || isUploading}
                onPaste={handleComposerPaste}
              />
              <button 
                type="submit" 
                disabled={isSending || isUploading || (!inputText.trim() && queuedAttachments.length === 0)}
                className="h-11 w-11 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 transition-colors"
                title="Gửi"
              >
                {isUploading ? <span className="text-xs">...</span> : <Send size={18} />}
              </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
