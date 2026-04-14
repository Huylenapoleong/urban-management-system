import { useState, useRef, useEffect } from "react";
import { Search, Phone, Video, Info, UserRound, Send, Paperclip, X, FileText, MoreHorizontal, Pencil, Trash2, Quote, Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useWebRTC } from "@/hooks/shared/useWebRTC";
import { CallModal } from "@/components/CallModal";
import { useAuth } from "@/providers/AuthProvider";
import { useConversations, useMessages } from "@/hooks/shared/useChatData";
import { format } from "date-fns";
import { useLocation } from "react-router-dom";
import { uploadMedia } from "@/services/upload.api";
import { useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@urban/shared-types";

type ChatMessageType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOC" | "EMOJI" | "SYSTEM";

type ChatNavigationState = {
  conversationId?: string;
  displayName?: string;
  avatarUrl?: string;
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
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [messageActionError, setMessageActionError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rtc = useWebRTC();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Data fetching
  const { data: conversations = [], isLoading: loadingConversations } = useConversations(conversationSearch);
  const {
    data: messages = [],
    isLoading: loadingMessages,
    sendMessageAsync,
    isSending,
    markAsRead,
    updateMessageAsync,
    deleteMessageAsync,
    isUpdatingMessage,
    isDeletingMessage,
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
          isGroup: false,
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
  const cachedProfile = queryClient.getQueryData<UserProfile>(["profile"]);
  const activeContactAvatarUrl =
    (activeContact as { avatarAsset?: { resolvedUrl?: string }; avatarUrl?: string } | undefined)?.avatarAsset?.resolvedUrl ||
    (activeContact as { avatarAsset?: { resolvedUrl?: string }; avatarUrl?: string } | undefined)?.avatarUrl ||
    chatState.avatarUrl;
  const callerDisplayName = cachedProfile?.fullName || user?.sub || "Người gọi";
  const callerAvatarUrl = cachedProfile?.avatarAsset?.resolvedUrl || cachedProfile?.avatarUrl;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when messages load or new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeChat) {
      return;
    }

    if ((activeContact?.unreadCount ?? 0) <= 0) {
      return;
    }

    markAsRead();
  }, [activeChat, activeContact?.unreadCount, markAsRead]);

  useEffect(() => {
    if (!activeChat) {
      setIsInfoOpen(false);
    }
  }, [activeChat]);

  useEffect(() => {
    setActiveMessageMenuId(null);
    setEditingMessageId(null);
    setEditingText("");
    setMessageActionError("");
  }, [activeChat]);

  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMessageMenuId(null);
    };

    if (!activeMessageMenuId) {
      return;
    }

    window.addEventListener("click", handleClickOutside);
    return () => {
      window.removeEventListener("click", handleClickOutside);
    };
  }, [activeMessageMenuId]);

  const handleStartCall = (isVideo: boolean) => {
    if (!activeContact) return;
    
    rtc.startCall({
      isVideo,
      // Target User ID temporarily set to conversationId for group-based room joining
      targetUserId: activeContact.conversationId,
      callerName: callerDisplayName,
      callerAvatarUrl,
      peerName: activeContact.groupName || activeContact.conversationId,
      peerAvatarUrl: activeContactAvatarUrl,
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

  const isVideoUrl = (url?: string, type?: string): boolean => {
    if (!url) {
      return false;
    }
    if (type === "VIDEO") {
      return true;
    }
    return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
  };

  const extractMessageText = (content: string): string => {
    try {
      const parsed = JSON.parse(content);
      return parsed.text || content;
    } catch {
      return content;
    }
  };

  const handleStartEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingText(extractMessageText(content));
    setActiveMessageMenuId(null);
    setMessageActionError("");
  };

  const handleCancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingText("");
    setMessageActionError("");
  };

  const handleSaveEditMessage = async (messageId: string) => {
    const text = editingText.trim();
    if (!text) {
      setMessageActionError("Nội dung tin nhắn không được để trống");
      return;
    }

    try {
      await updateMessageAsync({ messageId, text });
      setEditingMessageId(null);
      setEditingText("");
      setMessageActionError("");
    } catch (err: any) {
      setMessageActionError(err?.message || "Không thể sửa tin nhắn");
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const shouldDelete = window.confirm("Bạn có chắc muốn xoá tin nhắn này?");
    if (!shouldDelete) {
      return;
    }

    try {
      await deleteMessageAsync(messageId);
      setActiveMessageMenuId(null);
      setMessageActionError("");
    } catch (err: any) {
      setMessageActionError(err?.message || "Không thể xoá tin nhắn");
    }
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
          <div className="rounded-xl bg-white dark:bg-slate-900 px-5 py-3 text-sm font-medium text-blue-700 dark:text-blue-300 shadow border border-slate-200 dark:border-slate-700">
            Thả tệp vào đây để gửi
          </div>
        </div>
      ) : null}
      
      {/* Cột trái: Master (Danh sách hội thoại) */}
      <div className="w-[340px] flex-shrink-0 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-slate-400" />
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
          {loadingConversations && <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">Đang tải cuộc trò chuyện...</div>}
           {!loadingConversations && renderedConversations.length === 0 && (
             <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">
              {conversationSearch.trim() ? "Không tìm thấy hội thoại phù hợp" : "Chưa có hội thoại nào"}
             </div>
          )}
          {renderedConversations.map((chat) => (
            (() => {
              const effectiveUnreadCount = chat.conversationId === activeChat ? 0 : (chat.unreadCount ?? 0);
              return (
            <div 
              key={chat.conversationId} 
              onClick={() => setActiveChat(chat.conversationId)}
              className={`flex items-center gap-3 p-3 mx-2 my-1 rounded-lg cursor-pointer transition-colors ${
                activeChat === chat.conversationId ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-gray-50 dark:hover:bg-slate-800"
              }`}
            >
              <Avatar className="h-12 w-12 border border-gray-100 dark:border-slate-700">
                <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                  {chat.groupName ? chat.groupName.charAt(0).toUpperCase() : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-medium text-[15px] truncate">{chat.groupName || "Không rõ tên"}</span>
                  <span className="text-xs text-gray-500 dark:text-slate-400 flex-shrink-0">
                    {chat.updatedAt ? format(new Date(chat.updatedAt), 'HH:mm') : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={"text-sm truncate " + (effectiveUnreadCount > 0 ? "font-semibold text-slate-800 dark:text-slate-100" : "text-gray-500 dark:text-slate-400")}>
                    {chat.lastMessagePreview || "Chưa có tin nhắn"}
                  </span>
                  {effectiveUnreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {effectiveUnreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
              );
            })()
          ))}
        </div>
      </div>

      {/* Cột phải: Detail (Chi tiết Chat) */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden h-full">
        {!activeChat ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500 gap-4 mt-20">
            <UserRound size={60} className="opacity-20" />
            <p>Chọn một cuộc trò chuyện để bắt đầu nhắn tin</p>
          </div>
        ) : (
          <>
            {/* Header khung chat */}
            <div className="h-16 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-shrink-0 items-center justify-between px-4 z-10 shadow-sm relative">
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
              <div className="flex items-center text-gray-600 dark:text-slate-300">
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
                <button
                  className={`p-2 rounded-full transition ${isInfoOpen ? "bg-blue-50 text-blue-600" : "hover:bg-gray-100"}`}
                  title="Thông tin chi tiết"
                  onClick={() => setIsInfoOpen((prev) => !prev)}
                >
                  <Info size={20} />
                </button>
              </div>
            </div>

            <aside
              className={`absolute right-0 top-16 z-20 h-[calc(100%-4rem)] w-[320px] max-w-[85%] border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl transition-transform duration-200 ${isInfoOpen ? "translate-x-0" : "translate-x-full"}`}
            >
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">Thông tin cuộc trò chuyện</h3>
                <button
                  onClick={() => setIsInfoOpen(false)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  Đóng
                </button>
              </div>
              <div className="space-y-4 p-4 text-sm text-gray-700 dark:text-slate-300">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Tên hiển thị</p>
                  <p className="mt-1 font-medium text-gray-900 dark:text-slate-100">{activeContact?.groupName || "Không rõ tên"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Loại cuộc trò chuyện</p>
                  <p className="mt-1">{activeContact?.isGroup ? "Nhóm" : "Trực tiếp"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Mã hội thoại</p>
                  <p className="mt-1 break-all text-xs text-gray-600 dark:text-slate-300">{activeContact?.conversationId || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Tin nhắn mới</p>
                  <p className="mt-1">{activeContact?.unreadCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Cập nhật gần nhất</p>
                  <p className="mt-1">{activeContact?.updatedAt ? format(new Date(activeContact.updatedAt), "HH:mm dd/MM/yyyy") : "-"}</p>
                </div>
              </div>
            </aside>

            {/* Nội dung tin nhắn */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-slate-50 dark:bg-slate-950 relative">
              {loadingMessages && <div className="text-center py-4 text-sm text-gray-500 dark:text-slate-400">Đang tải tin nhắn...</div>}
              
              <div className="flex flex-col gap-3 pb-4">
                {/* Đảo ngược array nếu API trả về tin mới nhất trước (thường thấy nếu limit offset) */}
                {[...messages].reverse().map((msg) => {
                  const isMe = msg.senderId === user?.sub;
                  const isEditing = editingMessageId === msg.id;
                  const canEditMessage = msg.type === "TEXT" || msg.type === "EMOJI" || msg.type === "SYSTEM";
                  return (
                    <div key={msg.id} className={`group relative flex max-w-[70%] ${isMe ? "self-end" : "self-start"} flex-col`}>
                      {isMe && !isEditing ? (
                        <div
                          className={`absolute -left-24 bottom-6 z-20 flex items-center gap-1 rounded-full bg-slate-900/60 px-1 py-1 shadow-sm backdrop-blur-sm transition-opacity ${
                            activeMessageMenuId === msg.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <button
                            type="button"
                            className="rounded-full p-1.5 text-white/85 transition hover:bg-white/20 hover:text-white"
                            title="Trích dẫn (sẽ có sau)"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Quote size={14} />
                          </button>
                          <button
                            type="button"
                            className="rounded-full p-1.5 text-white/85 transition hover:bg-white/20 hover:text-white"
                            title="Chuyển tiếp (sẽ có sau)"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Share2 size={14} />
                          </button>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveMessageMenuId((prev) => (prev === msg.id ? null : msg.id));
                              }}
                              className="rounded-full p-1.5 text-white/90 transition hover:bg-white/20 hover:text-white"
                              title="Tùy chọn tin nhắn"
                            >
                              <MoreHorizontal size={14} />
                            </button>

                            {activeMessageMenuId === msg.id ? (
                              <div className="absolute right-0 top-9 z-30 w-40 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-lg">
                                {canEditMessage ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100"
                                    onClick={() => handleStartEditMessage(msg.id, msg.content)}
                                  >
                                    <Pencil size={14} />
                                    Sửa tin nhắn
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                  onClick={() => void handleDeleteMessage(msg.id)}
                                >
                                  <Trash2 size={14} />
                                  Xoá tin nhắn
                                </button>
                                <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Sẽ thêm tính năng khác sau</div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      <div
                        onClick={(event) => event.stopPropagation()}
                        className={`px-4 py-2 rounded-2xl shadow-sm ${
                          isMe 
                            ? "bg-blue-600 text-white rounded-br-sm" 
                            : "bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100 border border-gray-100 dark:border-slate-700 rounded-bl-sm"
                        }`}
                      >
                        <div className="relative">
                          {isEditing ? (
                            <div className="space-y-2">
                              <Input
                                value={editingText}
                                onChange={(event) => setEditingText(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    handleCancelEditMessage();
                                    return;
                                  }

                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void handleSaveEditMessage(msg.id);
                                  }
                                }}
                                className="h-9 bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                                autoFocus
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveEditMessage(msg.id)}
                                  disabled={isUpdatingMessage}
                                  className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {isUpdatingMessage ? "Đang lưu..." : "Lưu"}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditMessage}
                                  className="rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                                >
                                  Huỷ
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[15px]">{extractMessageText(msg.content)}</p>
                          )}
                        </div>
                        {msg.attachmentUrl ? (
                          isImageUrl(msg.attachmentUrl, msg.type) ? (
                            <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                              <img
                                src={msg.attachmentUrl}
                                alt="Tin nhan dinh kem"
                                className="max-h-56 max-w-full rounded-lg border border-black/10 object-cover"
                              />
                            </a>
                          ) : isVideoUrl(msg.attachmentUrl, msg.type) ? (
                            <video
                              controls
                              preload="metadata"
                              src={msg.attachmentUrl}
                              className="mt-2 max-h-72 w-full max-w-[320px] rounded-lg border border-black/10 bg-black"
                            />
                          ) : (
                            <a
                              href={msg.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`mt-2 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                                isMe ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                              }`}
                            >
                              <FileText className="h-4 w-4" />
                              Tệp đính kèm
                            </a>
                          )
                        ) : null}
                      </div>
                      <span className={`text-[10px] text-gray-400 dark:text-slate-500 mt-1 ${isMe ? "text-right" : "text-left"}`}>
                        {format(new Date(msg.sentAt), "HH:mm")}
                      </span>
                      {messageActionError && (editingMessageId === msg.id || activeMessageMenuId === msg.id) ? (
                        <span className="mt-1 text-[11px] text-red-500">{messageActionError}</span>
                      ) : null}
                      {isDeletingMessage && activeMessageMenuId === msg.id ? (
                        <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Đang xoá...</span>
                      ) : null}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Vùng nhập liệu */}
            <form onSubmit={handleSend} className="p-4 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 shrink-0 z-10 relative space-y-2">
              {queuedAttachments.length > 0 ? (
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {queuedAttachments.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.file.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {Math.max(1, Math.round(item.file.size / 1024))} KB
                            {item.status === "failed" ? " • Loi upload" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(item.id)}
                          className="rounded-md p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-100"
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
                className="h-11 w-11 flex items-center justify-center border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 rounded-md transition-colors"
                title="Dinh kem anh hoac file"
              >
                <Paperclip size={18} />
              </button>
              <Input 
                type="text" 
                placeholder="Nhập tin nhắn..." 
                className="flex-1 bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400 focus-visible:ring-blue-500 h-11"
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
