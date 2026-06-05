import { useEffect, useState } from "react";
import { Loader2, X, CheckCircle2, CheckCheck } from "lucide-react";
import type { MessageItem, MessageReceipt } from "@urban/shared-types";
import { getMessageReceipts } from "@/services/conversation.api";
import { format } from "date-fns";

interface MessageInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: MessageItem | null;
  conversationId: string;
  getMemberProfile: (userId: string) => { displayName: string; avatarUrl?: string } | null;
}

export function MessageInfoModal({
  isOpen,
  onClose,
  message,
  conversationId,
  getMemberProfile,
}: MessageInfoModalProps) {
  const [activeTab, setActiveTab] = useState<"READ" | "DELIVERED">("READ");
  const [receipts, setReceipts] = useState<MessageReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      if (!isOpen || !message) {
        setReceipts([]);
        setActiveTab("READ");
        return;
      }

      setIsLoading(true);
      setError(null);
      getMessageReceipts(conversationId, message.id)
        .then((res) => {
          if (cancelled) {
            return;
          }

          setReceipts(res);
        })
        .catch((err) => {
          if (cancelled) {
            return;
          }

          console.error(err);
          setError("Không thể lấy thông tin trạng thái.");
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, message, conversationId]);

  if (!isOpen || !message) return null;

  const readReceipts = receipts.filter((r) => r.status === "READ");
  const deliveredReceipts = receipts.filter((r) => r.status === "DELIVERED");

  const currentList = activeTab === "READ" ? readReceipts : deliveredReceipts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col h-[500px] max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Thông tin tin nhắn
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message Preview (Optional but good UX) */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex flex-col items-end">
            <div className="bg-blue-600 text-white rounded-2xl px-4 py-2 max-w-[85%] break-words">
              {message.type === "TEXT" && (
                <p>{message.content ? JSON.parse(message.content).text : ""}</p>
              )}
              {message.type === "IMAGE" && <span className="italic">Đã gửi một hình ảnh</span>}
              {message.type === "DOC" && <span className="italic">Đã gửi một tệp</span>}
              {message.type === "VIDEO" && <span className="italic">Đã gửi một video</span>}
              {message.type === "AUDIO" && <span className="italic">Đã gửi một đoạn ghi âm</span>}
              {message.type === "EMOJI" && <span className="italic">Đã gửi một emoji</span>}
              <div className="text-[10px] text-blue-200 mt-1 text-right">
                {format(new Date(message.sentAt), "HH:mm, dd/MM/yyyy")}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("READ")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === "READ"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            Đã xem ({readReceipts.length})
          </button>
          <button
            onClick={() => setActiveTab("DELIVERED")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === "DELIVERED"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            Đã nhận ({deliveredReceipts.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-500 text-sm">
              {error}
            </div>
          ) : currentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400 text-sm gap-2 text-center px-6">
              <span className="font-medium text-slate-600 dark:text-slate-300">Trống</span>
              {activeTab === "DELIVERED" && (
                <span className="text-xs">Những người đã xem tin nhắn sẽ được chuyển sang tab "Đã xem".</span>
              )}
            </div>
          ) : (
            <ul className="space-y-1">
              {currentList.map((receipt) => {
                // We'd ideally fetch UserProfiles, but since the component is simple,
                // we can just show generic avatars or fetch if possible.
                // However, the prompt implies "hiển thị đầy đủ Avatar, Tên người dùng".
                // In Messenger/Zalo, the backend returns User objects in the receipts API,
                // but our API only returned `userId`.
                // Let's assume we can fetch them via a local store or generic display.
                // Wait, if it's a group, the chat context already has members!
                // Since this component is inside ChatPage, it can receive `getMemberProfile` or similar.
                return (
                  <UserReceiptItem
                    key={receipt.userId}
                    userId={receipt.userId}
                    status={receipt.status}
                    deliveredAt={receipt.deliveredAt}
                    readAt={receipt.readAt}
                    profile={getMemberProfile(receipt.userId)}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-component to fetch/display user profile
function UserReceiptItem({ userId, status, deliveredAt, readAt, profile }: { userId: string, status: string, deliveredAt?: string, readAt?: string, profile: { displayName: string; avatarUrl?: string } | null }) {
  const displayName = profile?.displayName || `User ${userId.substring(userId.length - 4)}`;
  const avatarUrl = profile?.avatarUrl;
  const fallbackInitial = displayName.charAt(0).toUpperCase() || "U";

  return (
    <li className="flex items-center p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl transition-colors">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-10 h-10 rounded-full object-cover bg-slate-200 border border-slate-200 dark:border-slate-700"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-200 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {fallbackInitial}
        </div>
      )}
      <div className="ml-3 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          {displayName}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center mt-0.5">
          {status === "READ" ? (
            <>
              <CheckCheck className="w-3.5 h-3.5 mr-1 text-blue-500" />
              {readAt ? format(new Date(readAt), "HH:mm dd/MM") : "Đã xem"}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
              {deliveredAt
                ? format(new Date(deliveredAt), "HH:mm dd/MM")
                : "Đã nhận"}
            </>
          )}
        </p>
      </div>
    </li>
  );
}
