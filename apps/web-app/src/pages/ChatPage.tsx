import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useConversations, useMessages } from "@/hooks/shared/useChatData";
import type { CallEndedSummary } from "@/hooks/shared/useWebRTC";
import { socketClient } from "@/lib/socket-client";
import { useAuth } from "@/providers/auth-context";
import { useWebRTCRuntime } from "@/providers/webrtc-context";
import {
  clearConversationHistory,
  clearConversationListCache,
  deleteConversation,
  deleteConversationAlias,
  listConversationAliases,
  listPinnedMessages,
  pinMessage,
  setConversationAlias,
  unpinMessage,
} from "@/services/conversation.api";
import {
  listMyFriendRequests,
  listMyFriends,
  sendFriendRequest,
} from "@/services/friends.api";
import {
  addGroupMember,
  banGroupMember,
  createGroupInviteLink,
  dissolveGroup,
  leaveGroupWithPayload,
  listAuditEvents,
  listGroupBans,
  listGroupInviteLinks,
  listGroupMembers,
  removeGroupMember,
  revokeGroupInviteLink,
  transferOwnership,
  unbanGroupMember,
  updateGroup,
  updateGroupMemberRole,
} from "@/services/group.api";
import { uploadMedia } from "@/services/upload.api";
import {
  getUserById,
  getUserPresence,
  searchUserExactByContact,
  type PresenceState,
} from "@/services/user.api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GroupMemberRole } from "@urban/shared-constants";
import type {
  GroupInviteLink,
  MessageItem,
  MessageReplyReference,
  UserProfile,
} from "@urban/shared-types";
import { format } from "date-fns";
import EmojiPicker, { Theme, type EmojiClickData } from "emoji-picker-react";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Copy,
  Download,
  Eraser,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Gift,
  History,
  ImagePlus,
  Info,
  KeyRound,
  Link2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Plus,
  Quote,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  ShieldAlert,
  Smile,
  SmilePlus,
  Trash2,
  UserRound,
  Video,
  X,
} from "lucide-react";
import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";

const formatFileSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const truncateFileName = (name: string, maxLength: number = 24) => {
  if (!name || name.length <= maxLength) return name;
  const extIndex = name.lastIndexOf(".");
  if (extIndex === -1 || name.length - extIndex > 8) {
    return name.slice(0, maxLength - 3) + "...";
  }
  const ext = name.slice(extIndex);
  const base = name.slice(0, extIndex);
  const keep = Math.max(5, maxLength - ext.length - 3);
  return base.slice(0, keep) + "..." + ext;
};

const cleanFileName = (name: string) => {
  if (!name) return name;
  // Match a prefix of 12-40 alphanumeric chars followed by a space, dash or underscore
  // Example: "01KRE9S90KEKQ0PWMC S3TS9TZM-doanmonhoc2025" -> "S3TS9TZM-doanmonhoc2025"
  const regex = /^[0-9A-Z]{12,40}[\s\-_]/i;
  const match = name.match(regex);
  if (match) {
    const cleaned = name.slice(match[0].length).trim();
    // Ensure we don't end up with an empty string or just an extension
    if (cleaned.length > 3) return cleaned;
  }
  return name;
};

const getFileIcon = (fileName: string, size: number = 24) => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const props = { size };
  switch (ext) {
    case "pdf":
      return <FileText className="text-red-500" {...props} />;
    case "zip":
    case "rar":
    case "7z":
      return <FileArchive className="text-purple-500" {...props} />;
    case "doc":
    case "docx":
      return <FileText className="text-blue-500" {...props} />;
    case "xls":
    case "xlsx":
      return <FileSpreadsheet className="text-green-500" {...props} />;
    case "js":
    case "ts":
    case "tsx":
    case "html":
    case "css":
    case "json":
      return <FileCode className="text-orange-500" {...props} />;
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "webp":
      return <FileImage className="text-pink-500" {...props} />;
    case "mp3":
    case "wav":
    case "ogg":
      return <FileAudio className="text-emerald-500" {...props} />;
    case "mp4":
    case "mov":
    case "avi":
      return <FileVideo className="text-indigo-500" {...props} />;
    default:
      return <FileText className="text-slate-400" {...props} />;
  }
};

type ChatMessageType =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "DOC"
  | "EMOJI"
  | "SYSTEM";

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

type GifItem = {
  id: string;
  url: string;
  previewUrl: string;
};

type PollOption = {
  id: string;
  text: string;
  votes: string[];
};

type PollMessageContent = {
  text?: string;
  poll?: {
    question: string;
    options: PollOption[];
    isMultipleChoice?: boolean;
  };
};

type ParsedPollMessage = {
  pollData?: PollMessageContent;
  text?: string;
};

type ManageGroupTab = "members" | "bans" | "links" | "audit" | "settings";

const MANAGE_GROUP_TABS: Array<{
  id: ManageGroupTab;
  label: string;
  icon: typeof UserRound;
}> = [
  { id: "members", label: "Thành viên", icon: UserRound },
  { id: "bans", label: "Danh sách cấm", icon: Ban },
  { id: "links", label: "Link tham gia", icon: Link2 },
  { id: "audit", label: "Nhật ký hoạt động", icon: History },
  { id: "settings", label: "Cài đặt", icon: ShieldAlert },
];

type RecallScope = "SELF" | "EVERYONE";

const CALL_SUMMARY_STORAGE_KEY = "urban:web-app:call-summaries:v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function loadCallSummaries(): CallEndedSummary[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CALL_SUMMARY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is CallEndedSummary =>
      Boolean(item && item.conversationId && item.endedAt),
    );
  } catch {
    return [];
  }
}

function saveCallSummaries(summaries: CallEndedSummary[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    CALL_SUMMARY_STORAGE_KEY,
    JSON.stringify(summaries),
  );
}

type ConversationAvatarLike = {
  conversationId?: string;
  peerUserId?: string;
  userId?: string;
  targetUserId?: string;
  avatarAsset?: { resolvedUrl?: string };
  avatarUrl?: string;
  peerAvatarAsset?: { resolvedUrl?: string };
  peerAvatarUrl?: string;
  participantAvatarAsset?: { resolvedUrl?: string };
  participantAvatarUrl?: string;
  userAvatarAsset?: { resolvedUrl?: string };
  userAvatarUrl?: string;
};

function resolveConversationAvatarUrl(
  conversation?: ConversationAvatarLike | null,
): string | undefined {
  if (!conversation) {
    return undefined;
  }

  return (
    conversation.avatarAsset?.resolvedUrl ||
    conversation.avatarUrl ||
    conversation.peerAvatarAsset?.resolvedUrl ||
    conversation.peerAvatarUrl ||
    conversation.participantAvatarAsset?.resolvedUrl ||
    conversation.participantAvatarUrl ||
    conversation.userAvatarAsset?.resolvedUrl ||
    conversation.userAvatarUrl
  );
}

function extractDirectPeerUserId(
  conversation?: ConversationAvatarLike | null,
  currentUserId?: string,
): string | undefined {
  if (!conversation) {
    return undefined;
  }

  const explicitId =
    conversation.peerUserId || conversation.userId || conversation.targetUserId;
  if (explicitId && explicitId !== currentUserId) {
    return explicitId;
  }

  const conversationId = conversation.conversationId?.trim();
  if (!conversationId) {
    return undefined;
  }

  if (/^dm[:#]/i.test(conversationId)) {
    const raw = conversationId.replace(/^dm[:#]/i, "").trim();
    if (!raw) {
      return undefined;
    }

    const decoded = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();

    const parts = decoded
      .split(/[#:,]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length <= 1) {
      return parts[0] || undefined;
    }

    const peer = parts.find((part) => part !== currentUserId);
    return peer || parts[0];
  }

  return undefined;
}

function resolveDmAvatarFromFriendMap(
  conversation?: ConversationAvatarLike | null,
  friendAvatarByUserId?: Record<string, string>,
  currentUserId?: string,
): string | undefined {
  if (!conversation || !friendAvatarByUserId) {
    return undefined;
  }

  const peerUserId = extractDirectPeerUserId(conversation, currentUserId);
  if (!peerUserId) {
    return undefined;
  }

  return friendAvatarByUserId[peerUserId];
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }

  return fallback;
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }

  return undefined;
}

function formatLastSeenShort(
  presence?: PresenceState | null,
  fallbackLastSeenAt?: string | null,
): string | null {
  if (presence?.isActive) {
    return null;
  }

  const lastSeenSource = presence?.lastSeenAt || fallbackLastSeenAt;
  if (!lastSeenSource) {
    return null;
  }

  const lastSeenMs = new Date(lastSeenSource).getTime();
  if (Number.isNaN(lastSeenMs)) {
    return null;
  }

  const diffMinutes = Math.max(
    1,
    Math.floor((Date.now() - lastSeenMs) / 60000),
  );
  if (diffMinutes < 60) {
    return `${diffMinutes} phút`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} giờ`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ngày`;
}

function formatPresenceText(
  presence: PresenceState | null,
  fallbackLastSeenAt?: string | null,
): string {
  if (presence?.isActive) {
    return "Đang hoạt động";
  }

  const relative = formatLastSeenShort(presence, fallbackLastSeenAt);
  if (relative) {
    return `Hoạt động ${relative} trước`;
  }

  return "Hoạt động vài phút trước";
}

type MentionCandidate = {
  userId: string;
  displayName: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(\+?84|0)\d{9,10}$/;
const GROUP_AVATAR_OVERRIDES_STORAGE_KEY = "web-app-group-avatar-overrides";
const CONVERSATION_ALIAS_STORAGE_KEY = "web-app-conversation-aliases";
const MESSAGE_REACTIONS_STORAGE_KEY = "web-app-message-reactions";
const PRESENCE_POLL_INTERVAL_MS = 60_000;
const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;
const MESSAGE_BLOCK_GAP_MS = 10 * 60 * 1000;
const USER_ID_PATTERN = /\b[0-9A-Z]{20,32}\b/g;
const GIPHY_PAGE_SIZE = 20;

function extractGroupIdFromConversationId(
  conversationId?: string | null,
): string | undefined {
  if (!conversationId) {
    return undefined;
  }

  if (/^group:/i.test(conversationId)) {
    return conversationId.replace(/^group:/i, "").trim() || undefined;
  }

  if (/^grp#/i.test(conversationId)) {
    return conversationId.replace(/^grp#/i, "").trim() || undefined;
  }

  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeUrlToken(rawUrl: string): string {
  return rawUrl.replace(/[),.!?;:]+$/g, "");
}

function extractFirstUrl(text: string): string | undefined {
  const match = text.match(URL_PATTERN);
  if (!match || match.length === 0) {
    return undefined;
  }

  const sanitized = sanitizeUrlToken(match[0]);
  if (!sanitized) {
    return undefined;
  }

  return sanitized;
}

function buildLinkPreview(
  url: string,
): { href: string; host: string; path: string; faviconUrl: string } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "");
    const path = `${parsed.pathname}${parsed.search}` || "/";
    return {
      href: parsed.toString(),
      host,
      path: path.length > 72 ? `${path.slice(0, 69)}...` : path,
      faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`,
    };
  } catch {
    return null;
  }
}

export function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const chatState = (location.state ?? {}) as ChatNavigationState;
  const [activeChat, setActiveChat] = useState<string | null>(
    chatState.conversationId ?? null,
  );

  useEffect(() => {
    if (chatState.conversationId && chatState.conversationId !== activeChat) {
      setActiveChat(chatState.conversationId);
    }
  }, [activeChat, chatState.conversationId]);

  useEffect(() => {
    if (chatState.conversationId) {
      // Clear state after a short delay so it doesn't persist on refresh
      const timer = setTimeout(() => {
        navigate(location.pathname, { replace: true, state: {} });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [chatState.conversationId, location.pathname, navigate]);
  const failedPresenceUserIdsRef = useRef<Set<string>>(new Set());
  const [inputText, setInputText] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [queuedAttachments, setQueuedAttachments] = useState<
    QueuedAttachment[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [messageTypeFilter, setMessageTypeFilter] = useState<string>("");
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(
    null,
  );
  const [messageMenuPlacement, setMessageMenuPlacement] = useState<
    "up" | "down"
  >("up");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [replyingMessage, setReplyingMessage] =
    useState<MessageReplyReference | null>(null);
  const [messageActionError, setMessageActionError] = useState("");
  const [isForwardDialogOpen, setIsForwardDialogOpen] = useState(false);
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(
    null,
  );
  const [selectedForwardConversationIds, setSelectedForwardConversationIds] =
    useState<string[]>([]);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardActionError, setForwardActionError] = useState("");
  const [memberLookupInput, setMemberLookupInput] = useState("");
  const [memberRoleInput, setMemberRoleInput] =
    useState<GroupMemberRole>("MEMBER");
  const [memberActionError, setMemberActionError] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(
    null,
  );
  const [selectedMentions, setSelectedMentions] = useState<MentionCandidate[]>(
    [],
  );
  const [leaveGroupError, setLeaveGroupError] = useState("");
  const [isLeaveGroupDialogOpen, setIsLeaveGroupDialogOpen] = useState(false);
  const [leaveSuccessorUserId, setLeaveSuccessorUserId] = useState("");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteSearchText, setInviteSearchText] = useState("");
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<string[]>(
    [],
  );
  const [renameGroupName, setRenameGroupName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [inviteLinkError, setInviteLinkError] = useState("");
  const [sendingFriendRequestUserId, setSendingFriendRequestUserId] = useState<
    string | null
  >(null);
  const [pendingRemoveMemberUserId, setPendingRemoveMemberUserId] = useState<
    string | null
  >(null);
  const [activeMemberActionUserId, setActiveMemberActionUserId] = useState<
    string | null
  >(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [isUpdatingGroupAvatar, setIsUpdatingGroupAvatar] = useState(false);
  const [isManageGroupModalOpen, setIsManageGroupModalOpen] = useState(false);
  const [manageGroupActiveTab, setManageGroupActiveTab] =
    useState<ManageGroupTab>("members");
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<
    string | null
  >(null);
  const [successorSearchText, setSuccessorSearchText] = useState("");
  const [convContextMenu, setConvContextMenu] = useState<{
    x: number;
    y: number;
    conversationId: string;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    intent?: "default" | "danger";
    requireInput?: {
      label: string;
      placeholder?: string;
      expectedValue: string;
      helperText?: string;
    };
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [nicknameModal, setNicknameModal] = useState<{
    conversationId: string;
    userId: string;
    fullName: string;
    currentAlias?: string;
  } | null>(null);
  const [modalNicknameInput, setModalNicknameInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [messageReactionsByConversation, setMessageReactionsByConversation] =
    useState<Record<string, Record<string, string[]>>>(() => {
      if (typeof window === "undefined") {
        return {};
      }

      try {
        const raw = window.localStorage.getItem(MESSAGE_REACTIONS_STORAGE_KEY);
        if (!raw) {
          return {};
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          return {};
        }

        return parsed as Record<string, Record<string, string[]>>;
      } catch {
        return {};
      }
    });
  const [conversationAliases, setConversationAliases] = useState<
    Record<string, string>
  >(() => {
    if (typeof window === "undefined") {
      return {};
    }

    try {
      const raw = window.localStorage.getItem(CONVERSATION_ALIAS_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      // Automatically migrate out any legacy DM entries from local storage
      const cleaned: Record<string, string> = {};
      let changed = false;
      const keys = Object.keys(parsed) as string[];
      for (const key of keys) {
        if (key.startsWith("dm:")) {
          changed = true;
        } else {
          cleaned[key] = (parsed as Record<string, string>)[key];
        }
      }

      if (changed) {
        window.localStorage.setItem(
          CONVERSATION_ALIAS_STORAGE_KEY,
          JSON.stringify(cleaned),
        );
      }

      return cleaned;
    } catch {
      return {};
    }
  });
  const [aliasInput, setAliasInput] = useState("");
  const [groupAvatarOverrides, setGroupAvatarOverrides] = useState<
    Record<string, string>
  >(() => {
    if (typeof window === "undefined") {
      return {};
    }

    try {
      const raw = window.localStorage.getItem(
        GROUP_AVATAR_OVERRIDES_STORAGE_KEY,
      );
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      return parsed as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [successModal, setSuccessModal] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);
  const requestedDmAvatarIdsRef = useRef<Set<string>>(new Set());
  const [friendAvatarByUserId, setFriendAvatarByUserId] = useState<
    Record<string, string>
  >({});
  const [dmAvatarMap, setDmAvatarMap] = useState<Record<string, string>>({});
  const [activeDmPresence, setActiveDmPresence] =
    useState<PresenceState | null>(null);
  const [dmPresenceByUserId, setDmPresenceByUserId] = useState<
    Record<string, PresenceState>
  >({});
  const [callSummaries, setCallSummaries] = useState<CallEndedSummary[]>(() =>
    loadCallSummaries(),
  );
  const rtc = useWebRTCRuntime();
  const { startCall, lastEndedCall } = rtc;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const trimmed = conversationSearch.trim();
    if (!trimmed) return;

    // Detect full invite URLs
    if (trimmed.includes("/groups/invite/")) {
      const parts = trimmed.split("/groups/invite/");
      const code = parts[parts.length - 1].split(/[?#]/)[0];
      if (code && code.length >= 6) {
        setConversationSearch("");
        navigate(`/groups/invite/${code}`);
      }
    }
    // Detect raw invite codes (usually starts with uppercase letters/numbers)
    else if (/^[A-Z0-9]{8,12}$/.test(trimmed)) {
      setConversationSearch("");
      navigate(`/groups/invite/${trimmed}`);
    }
  }, [conversationSearch, navigate]);

  // Data fetching
  const { data: conversations = [], isLoading: loadingConversations } =
    useConversations(conversationSearch);
  const {
    data: messages = [],
    isLoading: loadingMessages,
    hasMore,
    isLoadingMore,
    loadMore,
    sendMessageAsync,
    isSending,
    markAsRead,
    updateMessageAsync,
    deleteMessageAsync,
    forwardMessageAsync,
    isUpdatingMessage,
    isDeletingMessage,
    isForwardingMessage,
    typingUsers,
    sendTyping,
  } = useMessages(activeChat || undefined, messageSearch, messageTypeFilter);

  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [showAllPinned, setShowAllPinned] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [gifSearch, setGifSearch] = useState("");
  const [gifResults, setGifResults] = useState<GifItem[]>([]);
  const [gifNext, setGifNext] = useState<number | null>(null);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState("");
  const hasGifResults = gifResults.length > 0;
  const hasGifError = Boolean(gifError);
  const handleGifSearchChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setGifSearch(event.target.value);
  };
  const clearGifSearch = () => setGifSearch("");

  const handleTogglePin = (msg: MessageItem) => {
    if (!activeChat) {
      return;
    }

    if (msg.pinnedAt) {
      void unpinMessageMutation.mutate(msg.id);
    } else {
      void pinMessageMutation.mutate({ messageId: msg.id });
    }
    setActiveMessageMenuId(null);
  };

  const parsePollMessage = (rawContent: string): ParsedPollMessage => {
    try {
      const parsed: unknown = JSON.parse(rawContent);
      if (isRecord(parsed)) {
        if ("poll" in parsed) {
          return {
            pollData: parsed as PollMessageContent,
            text: typeof parsed.text === "string" ? parsed.text : undefined,
          };
        }

        const nestedText = parsed.text;
        if (typeof nestedText === "string") {
          try {
            const nestedParsed: unknown = JSON.parse(nestedText);
            if (isRecord(nestedParsed)) {
              if ("poll" in nestedParsed) {
                return {
                  pollData: nestedParsed as PollMessageContent,
                  text:
                    typeof nestedParsed.text === "string"
                      ? nestedParsed.text
                      : nestedText,
                };
              }
            }
          } catch {
            return { text: nestedText };
          }
          return { text: nestedText };
        }
      }
    } catch {
      return { text: rawContent };
    }

    return { text: rawContent };
  };

  const handleCreatePoll = async () => {
    if (
      !pollQuestion.trim() ||
      pollOptions.filter((o) => o.trim()).length < 2
    ) {
      toast.error("Vui lòng nhập câu hỏi và ít nhất 2 lựa chọn");
      return;
    }

    const pollData = {
      text: `📊 Bình chọn: ${pollQuestion}`,
      poll: {
        question: pollQuestion,
        options: pollOptions
          .map((option) => option.trim())
          .filter(Boolean)
          .map((option, index) => ({
            id: String(index),
            text: option,
            votes: [],
          })),
        isMultipleChoice: false,
      },
    };

    try {
      await sendMessageAsync({
        text: JSON.stringify(pollData),
        type: "TEXT",
      });
      setIsPollModalOpen(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
    } catch {
      toast.error("Không thể tạo bình chọn");
    }
  };

  const handleVote = async (msg: MessageItem, optionId: string) => {
    try {
      const voterId = user?.sub;
      if (!voterId) return;

      const parsed = parsePollMessage(msg.content);
      const pollData = parsed.pollData;
      const poll = pollData?.poll;
      if (!poll) return;

      const newOptions = poll.options.map((opt) => {
        const votes = opt.votes || [];
        const hasVoted = votes.includes(voterId);

        if (opt.id === optionId) {
          return {
            ...opt,
            votes: hasVoted
              ? votes.filter((id) => id !== voterId)
              : [...votes, voterId],
          };
        }

        // Single choice logic: remove vote from other options
        if (!poll.isMultipleChoice) {
          return {
            ...opt,
            votes: votes.filter((id) => id !== voterId),
          };
        }

        return opt;
      });

      const newContent = JSON.stringify({
        ...pollData,
        poll: { ...poll, options: newOptions },
      });

      await updateMessageAsync({ messageId: msg.id, text: newContent });
    } catch {
      toast.error("Không thể bình chọn");
    }
  };

  const handleSendGif = async (url: string) => {
    if (!activeChat || isSending || isUploading) {
      return;
    }

    try {
      setIsUploading(true);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch GIF");
      }

      const blob = await response.blob();
      const file = new File([blob], `gif-${Date.now()}.gif`, {
        type: blob.type || "image/gif",
      });
      const uploaded = await uploadMedia({
        file,
        target: "MESSAGE",
        entityId: activeChat,
      });

      await sendMessageAsync({
        attachmentKey: uploaded.key,
        type: "IMAGE",
      });
      setIsGifPickerOpen(false);
    } catch {
      toast.error("Không thể gửi GIF");
    } finally {
      setIsUploading(false);
    }
  };

  const fetchGiphyGifs = useCallback(
    async ({ query, offset }: { query?: string; offset?: number | null }) => {
      const apiKey = import.meta.env.VITE_GIPHY_API_KEY || "";
      if (!apiKey) {
        throw new Error("Missing Giphy API key");
      }

      const endpoint = query
        ? "https://api.giphy.com/v1/gifs/search"
        : "https://api.giphy.com/v1/gifs/trending";
      const params = new URLSearchParams({
        api_key: apiKey,
        limit: String(GIPHY_PAGE_SIZE),
        rating: "pg-13",
      });
      if (query) {
        params.set("q", query);
        params.set("lang", "vi");
      }
      if (typeof offset === "number") {
        params.set("offset", String(offset));
      }

      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Giphy request failed");
      }

      const payload = (await response.json()) as {
        data?: unknown;
        pagination?: { offset?: number; count?: number; total_count?: number };
      };
      const data = Array.isArray(payload.data) ? payload.data : [];
      const items = data
        .map((item): GifItem | null => {
          if (!isRecord(item)) {
            return null;
          }
          const images = isRecord(item.images) ? item.images : {};
          const original = isRecord(images.original) ? images.original : {};
          const fixedSmall = isRecord(images.fixed_width_small)
            ? images.fixed_width_small
            : {};
          const fixed = isRecord(images.fixed_width) ? images.fixed_width : {};
          const url =
            (typeof original.url === "string" && original.url) ||
            (typeof fixed.url === "string" && fixed.url) ||
            (typeof fixedSmall.url === "string" && fixedSmall.url);
          if (!url) {
            return null;
          }
          const previewUrl =
            (typeof fixedSmall.url === "string" && fixedSmall.url) ||
            (typeof fixed.url === "string" && fixed.url) ||
            url;
          return {
            id: typeof item.id === "string" ? item.id : url,
            url,
            previewUrl,
          };
        })
        .filter((item: GifItem | null): item is GifItem => Boolean(item));

      const currentOffset =
        typeof payload.pagination?.offset === "number"
          ? payload.pagination.offset
          : offset || 0;
      const nextOffset = items.length > 0 ? currentOffset + items.length : null;

      return {
        items,
        next: nextOffset,
      };
    },
    [],
  );

  useEffect(() => {
    if (!isGifPickerOpen) {
      return;
    }

    let cancelled = false;
    setGifError("");
    const query = gifSearch.trim();
    const timer = window.setTimeout(async () => {
      setGifLoading(true);
      try {
        const result = await fetchGiphyGifs({ query, offset: 0 });
        if (cancelled) return;
        setGifResults(result.items);
        setGifNext(result.next);
      } catch (error) {
        if (cancelled) return;
        setGifResults([]);
        setGifNext(null);
        setGifError(
          error instanceof Error && error.message === "Missing Giphy API key"
            ? "Thiếu VITE_GIPHY_API_KEY"
            : "Không thể tải GIF",
        );
      } finally {
        if (!cancelled) {
          setGifLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fetchGiphyGifs, gifSearch, isGifPickerOpen]);

  const handleLoadMoreGifs = async () => {
    if (!gifNext || gifLoading) {
      return;
    }

    setGifLoading(true);
    try {
      const result = await fetchGiphyGifs({
        query: gifSearch.trim(),
        offset: gifNext,
      });
      setGifResults((prev) => [...prev, ...result.items]);
      setGifNext(result.next);
    } catch {
      setGifError("Không thể tải thêm GIF");
    } finally {
      setGifLoading(false);
    }
  };

  const syntheticConversation = useMemo(
    () =>
      chatState.conversationId
        ? {
            conversationId: chatState.conversationId,
            groupName: chatState.displayName || "Đang tải...",
            avatarUrl: chatState.avatarUrl,
            updatedAt: new Date().toISOString(),
            unreadCount: 0,
            lastMessagePreview: "Bạn đã tham gia nhóm",
            lastSenderName: "",
            isGroup: chatState.conversationId.includes("group:"),
          }
        : null,
    [chatState.avatarUrl, chatState.conversationId, chatState.displayName],
  );

  const mergedConversations = useMemo(
    () =>
      syntheticConversation
        ? [
            syntheticConversation,
            ...conversations.filter(
              (conversation) =>
                conversation.conversationId !==
                syntheticConversation.conversationId,
            ),
          ]
        : conversations,
    [conversations, syntheticConversation],
  );

  const normalizedSearch = conversationSearch.trim().toLowerCase();
  const renderedConversations = normalizedSearch
    ? mergedConversations.filter((conversation) => {
        const alias = conversationAliases[conversation.conversationId];
        const haystack = [
          alias,
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

  const activeContact = renderedConversations.find(
    (c) => c.conversationId === activeChat,
  );


  const resolveConversationAlias = useCallback(
    (conversationId?: string | null) => {
      if (!conversationId) {
        return "";
      }

      const alias = conversationAliases[conversationId];
      return alias?.trim() || "";
    },
    [conversationAliases],
  );
  const resolveConversationDisplayName = useCallback(
    (
      conversation?: {
        conversationId?: string | null;
        groupName?: string | null;
      } | null,
    ) => {
      if (!conversation) {
        return "Không rõ tên";
      }

      // Check if this is a direct message (DM starts with "dm:")
      const isDm = conversation.conversationId?.startsWith("dm:");
      if (isDm && conversation.conversationId) {
        // Direct messages use the backend-synced name/alias directly from conversation.groupName
        return conversation.groupName || "Không rõ tên";
      }

      // For groups, use the custom group name from local storage if set, otherwise fallback to groupName
      const alias = resolveConversationAlias(conversation.conversationId);
      return alias || conversation.groupName || "Không rõ tên";
    },
    [resolveConversationAlias],
  );

  const activeDmUserId = extractDirectPeerUserId(
    activeContact as ConversationAvatarLike | undefined,
    user?.sub,
  );

  const { data: activeConversationAliases = [] } = useQuery({
    queryKey: ["conversation-aliases", activeChat],
    queryFn: () => listConversationAliases(activeChat!),
    enabled: Boolean(activeChat),
    staleTime: 5 * 60 * 1000,
  });

  const conversationAliasByUserId = useMemo(() => {
    const map = new Map<string, string>();
    activeConversationAliases.forEach((alias) =>
      map.set(alias.userId, alias.alias),
    );
    return map;
  }, [activeConversationAliases]);

  const activeDmPeerAlias = useMemo(
    () =>
      activeDmUserId
        ? conversationAliasByUserId.get(activeDmUserId) || null
        : null,
    [activeDmUserId, conversationAliasByUserId],
  );

  const activeConversationAlias = resolveConversationAlias(activeChat);
  const activeConversationDisplayName =
    (!activeContact?.isGroup && activeDmPeerAlias) ||
    (activeContact?.isGroup && activeConversationAlias) ||
    activeContact?.groupName ||
    (activeChat === chatState.conversationId ? chatState.displayName : "") ||
    "Không rõ tên";
  const activePrivateAlias =
    !activeContact?.isGroup && activeDmPeerAlias
      ? activeDmPeerAlias
      : activeConversationAlias;
  const activeGroupId = extractGroupIdFromConversationId(activeChat);
  const activeTypingParticipants = Object.values(typingUsers).filter(
    (participant) => participant.isTyping && participant.userId !== user?.sub,
  );
  const typingIndicatorText = (() => {
    const typingCount = activeTypingParticipants.length;
    if (typingCount === 0) {
      return "";
    }

    if (typingCount >= 3) {
      return "Nhiều người đang soạn tin...";
    }

    const uniqueNames = Array.from(
      new Set(
        activeTypingParticipants
          .map((participant) => participant.fullName?.trim())
          .map((name, index) => {
            const participant = activeTypingParticipants[index];
            return participant
              ? conversationAliasByUserId.get(participant.userId) || name
              : name;
          })
          .filter((name): name is string => Boolean(name)),
      ),
    );

    if (typingCount === 1) {
      return `${uniqueNames[0] || "Một thành viên"} đang soạn tin...`;
    }

    if (typingCount === 2) {
      if (uniqueNames.length >= 2) {
        return `${uniqueNames[0]} và ${uniqueNames[1]} đang soạn tin...`;
      }

      return "Hai người đang soạn tin...";
    }

    return "Nhiều người đang soạn tin...";
  })();
  const normalizedForwardSearch = forwardSearch.trim().toLowerCase();
  const activeMessageReactions = useMemo(
    () => (activeChat ? messageReactionsByConversation[activeChat] || {} : {}),
    [activeChat, messageReactionsByConversation],
  );
  const forwardDestinationConversations = mergedConversations.filter(
    (conversation) => {
      if (conversation.conversationId === activeChat) {
        return false;
      }

      if (!normalizedForwardSearch) {
        return true;
      }

      const haystack = [
        conversation.groupName,
        conversation.lastMessagePreview,
        conversation.lastSenderName,
        conversation.conversationId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedForwardSearch);
    },
  );
  const cachedProfile = queryClient.getQueryData<UserProfile>(["profile"]);
  const activeContactAvatarFromConversation = resolveConversationAvatarUrl(
    activeContact as ConversationAvatarLike | undefined,
  );
  const activeContactAvatarFromFriendMap = resolveDmAvatarFromFriendMap(
    activeContact as ConversationAvatarLike | undefined,
    friendAvatarByUserId,
    user?.sub,
  );
  const activeContactAvatarFromDmMap = activeChat
    ? dmAvatarMap[activeChat]
    : undefined;
  const activeContactBaseAvatarUrl =
    (
      activeContact as
        | { avatarAsset?: { resolvedUrl?: string }; avatarUrl?: string }
        | undefined
    )?.avatarAsset?.resolvedUrl ||
    (
      activeContact as
        | { avatarAsset?: { resolvedUrl?: string }; avatarUrl?: string }
        | undefined
    )?.avatarUrl;
  const activeContactAvatarUrl =
    (activeGroupId ? groupAvatarOverrides[activeGroupId] : undefined) ||
    activeContactAvatarFromConversation ||
    activeContactAvatarFromFriendMap ||
    activeContactAvatarFromDmMap ||
    activeContactBaseAvatarUrl ||
    chatState.avatarUrl;

  const activePresence = activeDmUserId
    ? dmPresenceByUserId[activeDmUserId] || activeDmPresence
    : null;
  const activeStatusText = (() => {
    if (!activeContact) {
      return "";
    }

    if (activeContact.isGroup) {
      return "Nhóm trò chuyện";
    }

    return formatPresenceText(activePresence, activeContact?.updatedAt);
  })();
  const activeStatusToneClass = activePresence?.isActive
    ? "text-green-600"
    : "text-gray-500 dark:text-slate-400";
  const activeLastSeenBadge = formatLastSeenShort(
    activePresence,
    activeContact?.updatedAt,
  );
  const callerDisplayName = cachedProfile?.fullName || user?.sub || "Người gọi";
  const callerAvatarUrl =
    cachedProfile?.avatarAsset?.resolvedUrl || cachedProfile?.avatarUrl;
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const messageFocusTimerRef = useRef<number | null>(null);
  const previousMessageCountRef = useRef(0);
  const loadingOlderMessagesRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
  const lastMarkedReadRef = useRef<{ id: string; count: number } | null>(null);
  const lastActiveChatRef = useRef<string | null>(null);
  const {
    data: activeGroupMembers = [],
    isLoading: isLoadingGroupMembers,
    isFetching: isFetchingGroupMembers,
    error: activeGroupMembersError,
    refetch: refetchGroupMembers,
  } = useQuery({
    queryKey: ["group-members", activeGroupId],
    queryFn: () => listGroupMembers(activeGroupId!),
    enabled: Boolean(activeGroupId),
  });
  const currentUserMembership = activeGroupMembers.find(
    (membership) => membership.userId === user?.sub,
  );
  const { data: memberProfilesById = {} } = useQuery({
    queryKey: [
      "group-members",
      "profiles",
      activeGroupId,
      activeGroupMembers.map((item) => item.userId).join("|"),
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        activeGroupMembers.map(async (member) => {
          try {
            const profile = await getUserById(member.userId);
            return [member.userId, profile] as const;
          } catch {
            return [member.userId, undefined] as const;
          }
        }),
      );

      return Object.fromEntries(entries) as Record<
        string,
        UserProfile | undefined
      >;
    },
    enabled: Boolean(activeGroupId) && activeGroupMembers.length > 0,
    staleTime: 60 * 1000,
  });
  const { data: myFriends = [] } = useQuery({
    queryKey: ["friends", "list", "for-group-member-picker"],
    queryFn: () => listMyFriends({ limit: 200 }),
    staleTime: 30 * 1000,
  });
  const { data: activeGroupInviteLinks = [] } = useQuery({
    queryKey: ["group-invite-links", activeGroupId],
    queryFn: () => listGroupInviteLinks(activeGroupId!),
    enabled: Boolean(activeGroupId && (isInfoOpen || isManageGroupModalOpen)),
    staleTime: 30 * 1000,
  });
  const { data: outgoingFriendRequests = [] } = useQuery({
    queryKey: ["friends", "requests", "outgoing", "for-group-member-picker"],
    queryFn: () => listMyFriendRequests({ direction: "OUTGOING", limit: 200 }),
    staleTime: 30 * 1000,
  });
  const { data: incomingFriendRequests = [] } = useQuery({
    queryKey: ["friends", "requests", "incoming", "for-group-member-picker"],
    queryFn: () => listMyFriendRequests({ direction: "INCOMING", limit: 200 }),
    staleTime: 30 * 1000,
  });
  const { data: auditLogs = [] } = useQuery({
    queryKey: ["group-audit", activeGroupId],
    queryFn: () => listAuditEvents(activeGroupId!, { limit: 100 }),
    enabled: Boolean(
      activeGroupId &&
      isManageGroupModalOpen &&
      manageGroupActiveTab === "audit",
    ),
    staleTime: 30 * 1000,
  });
  const { data: groupBans = [] } = useQuery({
    queryKey: ["group-bans", activeGroupId],
    queryFn: () => listGroupBans(activeGroupId!),
    enabled: Boolean(
      activeGroupId &&
      isManageGroupModalOpen &&
      manageGroupActiveTab === "bans",
    ),
    staleTime: 30 * 1000,
  });

  const bannedUserIds = useMemo(
    () => groupBans.map((ban) => ban.userId).filter(Boolean),
    [groupBans],
  );
  const { data: bannedProfilesById = {} } = useQuery({
    queryKey: [
      "group-bans",
      "profiles",
      activeGroupId,
      bannedUserIds.join("|"),
    ],
    queryFn: async () => {
      const entries = await Promise.all(
        bannedUserIds.map(async (userId) => {
          try {
            const profile = await getUserById(userId);
            return [userId, profile] as const;
          } catch {
            return [userId, undefined] as const;
          }
        }),
      );

      return Object.fromEntries(entries) as Record<
        string,
        UserProfile | undefined
      >;
    },
    enabled:
      Boolean(activeGroupId) &&
      bannedUserIds.length > 0 &&
      isManageGroupModalOpen &&
      manageGroupActiveTab === "bans",
    staleTime: 60 * 1000,
  });

  const friendUserIds = useMemo(
    () => new Set(myFriends.map((friend) => friend.userId)),
    [myFriends],
  );

  const { data: pinnedMessages = [], refetch: refetchPinnedMessages } =
    useQuery({
      queryKey: ["pinned-messages", activeChat],
      queryFn: () => listPinnedMessages(activeChat!),
      enabled: Boolean(activeChat),
      staleTime: 30 * 1000,
    });

  const pinMessageMutation = useMutation({
    mutationFn: (args: { messageId: string; replaceMessageId?: string }) =>
      pinMessage(activeChat!, args.messageId, args.replaceMessageId),
    onSuccess: () => {
      void refetchPinnedMessages();
      toast.success("Đã ghim tin nhắn");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể ghim tin nhắn."));
    },
  });

  const unpinMessageMutation = useMutation({
    mutationFn: (messageId: string) => unpinMessage(activeChat!, messageId),
    onSuccess: () => {
      void refetchPinnedMessages();
      toast.success("Đã bỏ ghim tin nhắn");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể bỏ ghim tin nhắn."));
    },
  });
  const messageSenderNameByUserId = useMemo(() => {
    const map = new Map<string, string>();

    messages.forEach((message) => {
      const senderName = message.senderName?.trim();
      if (message.senderId && senderName) {
        map.set(message.senderId, senderName);
      }
    });

    return map;
  }, [messages]);
  const mentionNameByUserId = useMemo(() => {
    const map = new Map<string, string>();

    activeGroupMembers.forEach((member) => {
      const profile = memberProfilesById[member.userId];
      const displayName =
        conversationAliasByUserId.get(member.userId) ||
        profile?.fullName ||
        myFriends.find((friend) => friend.userId === member.userId)?.fullName ||
        messageSenderNameByUserId.get(member.userId);

      if (displayName) {
        map.set(member.userId, displayName);
      }
    });

    if (user?.sub) {
      map.set(
        user.sub,
        conversationAliasByUserId.get(user.sub) ||
          cachedProfile?.fullName ||
          "Bạn",
      );
    }

    return map;
  }, [
    activeGroupMembers,
    cachedProfile?.fullName,
    conversationAliasByUserId,
    memberProfilesById,
    messageSenderNameByUserId,
    myFriends,
    user?.sub,
  ]);
  const displayNameByUserId = useMemo(() => {
    const map = new Map<string, string>();

    myFriends.forEach((friend) => {
      if (friend.userId && friend.fullName?.trim()) {
        map.set(friend.userId, friend.fullName.trim());
      }
    });

    activeGroupMembers.forEach((member, index) => {
      const profile = memberProfilesById[member.userId];
      const alias = conversationAliasByUserId.get(member.userId);
      const displayName =
        alias ||
        profile?.fullName ||
        mentionNameByUserId.get(member.userId) ||
        messageSenderNameByUserId.get(member.userId) ||
        `Thành viên ${index + 1}`;

      map.set(member.userId, displayName);
    });

    messages.forEach((message) => {
      if (message.senderId && !map.has(message.senderId)) {
        const alias = conversationAliasByUserId.get(message.senderId);
        if (alias) {
          map.set(message.senderId, alias);
        } else if (message.senderName?.trim()) {
          map.set(message.senderId, message.senderName.trim());
        }
      }
    });

    if (user?.sub) {
      map.set(
        user.sub,
        conversationAliasByUserId.get(user.sub) ||
          cachedProfile?.fullName ||
          "Bạn",
      );
    }

    return map;
  }, [
    activeGroupMembers,
    cachedProfile?.fullName,
    conversationAliasByUserId,
    memberProfilesById,
    mentionNameByUserId,
    messageSenderNameByUserId,
    messages,
    myFriends,
    user?.sub,
  ]);
  const groupRoleByUserId = useMemo(() => {
    const map = new Map<string, GroupMemberRole>();

    activeGroupMembers.forEach((member) => {
      map.set(member.userId, member.roleInGroup);
    });

    return map;
  }, [activeGroupMembers]);
  const groupMemberAvatarByUserId = useMemo(() => {
    const map = new Map<string, string>();

    activeGroupMembers.forEach((member) => {
      const profile = memberProfilesById[member.userId];
      const avatarUrl = profile?.avatarAsset?.resolvedUrl || profile?.avatarUrl;

      if (avatarUrl) {
        map.set(member.userId, avatarUrl);
      }
    });

    return map;
  }, [activeGroupMembers, memberProfilesById]);
  const renderGroupRoleKeyBadge = (memberUserId?: string) => {
    if (!activeContact?.isGroup || !memberUserId) {
      return null;
    }

    const role = groupRoleByUserId.get(memberUserId);
    if (role !== "OWNER" && role !== "DEPUTY") {
      return null;
    }

    const isOwner = role === "OWNER";

    return (
      <span
        className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white shadow-sm dark:border-slate-900 ${isOwner
          ? "bg-amber-400 text-amber-950"
          : "bg-slate-300 text-slate-700"
          }`}
        title={isOwner ? "Trưởng nhóm" : "Phó nhóm"}
      >
        <KeyRound size={10} strokeWidth={2.8} />
      </span>
    );
  };
  const outgoingFriendRequestUserIds = useMemo(
    () =>
      new Set(
        outgoingFriendRequests.map((friendRequest) => friendRequest.userId),
      ),
    [outgoingFriendRequests],
  );
  const incomingFriendRequestUserIds = useMemo(
    () =>
      new Set(
        incomingFriendRequests.map((friendRequest) => friendRequest.userId),
      ),
    [incomingFriendRequests],
  );
  const memberIdsInCurrentGroup = useMemo(
    () => new Set(activeGroupMembers.map((membership) => membership.userId)),
    [activeGroupMembers],
  );
  const normalizedInviteSearchText = inviteSearchText.trim().toLowerCase();
  const inviteCandidateFriends = useMemo(
    () =>
      myFriends
        .filter((friend) => !memberIdsInCurrentGroup.has(friend.userId))
        .filter((friend) => {
          if (!normalizedInviteSearchText) {
            return true;
          }

          return [friend.fullName, friend.userId]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedInviteSearchText);
        })
        .slice(0, 40),
    [memberIdsInCurrentGroup, myFriends, normalizedInviteSearchText],
  );
  const mentionCandidates = useMemo(() => {
    if (!activeGroupId || mentionStartIndex === null) {
      return [] as MentionCandidate[];
    }

    const keyword = mentionQuery.trim().toLowerCase();
    const candidates = activeGroupMembers
      .map((member, index) => {
        const displayName = mentionNameByUserId.get(member.userId);

        return {
          userId: member.userId,
          displayName: displayName || `Thành viên ${index + 1}`,
        };
      })
      .filter((candidate) => candidate.userId !== user?.sub);

    const filtered = keyword
      ? candidates.filter((candidate) =>
          `${candidate.displayName}`.toLowerCase().includes(keyword),
        )
      : candidates;

    return filtered.slice(0, 6);
  }, [
    activeGroupId,
    activeGroupMembers,
    mentionNameByUserId,
    mentionStartIndex,
    mentionQuery,
    user?.sub,
  ]);
  const isMentionMenuOpen =
    mentionStartIndex !== null && mentionCandidates.length > 0;
  const canManageGroupMembers =
    currentUserMembership?.roleInGroup === "OWNER" ||
    currentUserMembership?.roleInGroup === "DEPUTY";
  const isCurrentUserOwner = currentUserMembership?.roleInGroup === "OWNER";
  const canShowAddMemberSection =
    user?.role !== "CITIZEN" &&
    (canManageGroupMembers || user?.role === "ADMIN");
  const canViewGroupMemberList = Boolean(user?.sub);
  const canViewConversationCode = user?.role === "ADMIN";
  const canViewSensitiveUserIds = user?.role === "ADMIN";
  const canInviteGroupFriends = Boolean(activeGroupId && user?.sub);
  const canUpdateGroupAvatar = Boolean(
    activeGroupId && (canManageGroupMembers || user?.role === "ADMIN"),
  );
  const canRenameGroup = Boolean(
    activeGroupId && (isCurrentUserOwner || user?.role === "ADMIN"),
  );
  const canManageInviteLinks = Boolean(
    activeGroupId && (canManageGroupMembers || user?.role === "ADMIN"),
  );
  const pendingRemoveMemberDisplayName = pendingRemoveMemberUserId
    ? displayNameByUserId.get(pendingRemoveMemberUserId) || "Thành viên"
    : "";

  const renameGroupMutation = useMutation({
    mutationFn: ({
      groupId,
      groupName,
    }: {
      groupId: string;
      groupName: string;
    }) => updateGroup(groupId, { groupName }),
    onSuccess: (updatedGroup) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setRenameGroupName(updatedGroup.groupName || "");
      setIsRenaming(false);
      toast.success("Đã đổi tên nhóm");
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || "Không thể đổi tên nhóm lúc này.");
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: (_, conversationId) => {
      clearConversationListCache();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.removeQueries({ queryKey: ["messages", conversationId] });
      if (activeChat === conversationId) {
        setActiveChat(null);
        navigate(location.pathname, { replace: true, state: {} });
      }
      toast.success("Đã xóa cuộc trò chuyện khỏi hộp thư");
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || "Không thể xóa cuộc trò chuyện");
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: (conversationId: string) =>
      clearConversationHistory(conversationId),
    onSuccess: (_, conversationId) => {
      clearConversationListCache();
      queryClient.removeQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Đã xóa lịch sử tin nhắn");
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || "Không thể xóa lịch sử tin nhắn");
    },
  });

  const createInviteLinkMutation = useMutation({
    mutationFn: ({ groupId }: { groupId: string }) =>
      createGroupInviteLink(groupId),
    onSuccess: () => {
      setInviteLinkError("");
      queryClient.invalidateQueries({
        queryKey: ["group-invite-links", activeGroupId],
      });
      toast.success("Đã tạo link tham gia nhóm");
    },
    onError: (error: { message?: string }) => {
      const message = error?.message || "Không thể tạo link tham gia.";
      setInviteLinkError(message);
      toast.error(message);
    },
  });

  const revokeInviteLinkMutation = useMutation({
    mutationFn: ({
      groupId,
      inviteId,
    }: {
      groupId: string;
      inviteId: string;
    }) => revokeGroupInviteLink(groupId, inviteId),
    onSuccess: () => {
      setInviteLinkError("");
      queryClient.invalidateQueries({
        queryKey: ["group-invite-links", activeGroupId],
      });
      toast.success("Đã vô hiệu hóa link mời");
    },
    onError: (error: { message?: string }) => {
      const message = error?.message || "Không thể vô hiệu hóa link mời.";
      setInviteLinkError(message);
      toast.error(message);
    },
  });

  const manageGroupMemberMutation = useMutation({
    mutationFn: ({
      groupId,
      userId,
      action,
      roleInGroup,
    }: {
      groupId: string;
      userId: string;
      action: "add" | "update" | "remove" | "transfer";
      roleInGroup?: GroupMemberRole;
    }) =>
      (async () => {
        if (action === "add") {
          return addGroupMember(groupId, {
            userId,
            roleInGroup: roleInGroup === "DEPUTY" ? "DEPUTY" : "MEMBER",
          });
        }

        if (action === "update") {
          return updateGroupMemberRole(groupId, userId, {
            roleInGroup: roleInGroup === "DEPUTY" ? "DEPUTY" : "MEMBER",
          });
        }

        if (action === "transfer") {
          return transferOwnership(groupId, {
            targetUserId: userId,
          });
        }

        return removeGroupMember(groupId, userId);
      })(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["group-members", variables.groupId],
      });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setMemberActionError("");
      if (variables.action === "remove") {
        toast.success("Đã xóa thành viên khỏi nhóm");
      }
      if (variables.action === "update") {
        toast.success("Đã cập nhật vai trò thành viên");
      }
      if (variables.action === "add") {
        setMemberLookupInput("");
        toast.success("Đã thêm thành viên vào nhóm");
      }
      if (variables.action === "transfer") {
        toast.success("Đã chuyển quyền nhóm trưởng thành công");
        queryClient.invalidateQueries({
          queryKey: ["conversation", variables.groupId],
        });
      }
    },
    onError: (error: { message?: string }) => {
      setMemberActionError(
        error?.message || "Không thể cập nhật thành viên nhóm.",
      );
    },
  });

  const banUserMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      banGroupMember(activeGroupId!, userId, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["group-members", activeGroupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["group-bans", activeGroupId],
      });
      toast.success("Đã cấm người dùng khỏi nhóm");
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || "Không thể cấm người dùng.");
    },
  });

  const unbanUserMutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      unbanGroupMember(activeGroupId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["group-bans", activeGroupId],
      });
      toast.success("Đã bỏ cấm người dùng");
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || "Không thể bỏ cấm người dùng.");
    },
  });

  const dissolveGroupMutation = useMutation({
    mutationFn: () => dissolveGroup(activeGroupId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveChat(null);
      setIsManageGroupModalOpen(false);
      navigate(location.pathname, { replace: true, state: {} });
      toast.success("Đã giải tán nhóm thành công");
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || "Không thể giải tán nhóm.");
    },
  });
  const sendFriendRequestMutation = useMutation({
    mutationFn: (targetUserId: string) => sendFriendRequest(targetUserId),
    onMutate: (targetUserId) => {
      setSendingFriendRequestUserId(targetUserId);
      setMemberActionError("");
    },
    onSuccess: () => {
      toast.success("Đã gửi lời mời kết bạn");
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (error: { message?: string }) => {
      const message = error?.message || "Không thể gửi lời mời kết bạn.";
      setMemberActionError(message);
      toast.error(message);
    },
    onSettled: () => {
      setSendingFriendRequestUserId(null);
    },
  });
  const leaveGroupMutation = useMutation({
    mutationFn: ({
      groupId,
      successorUserId,
    }: {
      groupId: string;
      successorUserId?: string;
    }) =>
      leaveGroupWithPayload(
        groupId,
        successorUserId ? { successorUserId } : undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["group-members"] });
      setLeaveGroupError("");
      setLeaveSuccessorUserId("");
      setIsInfoOpen(false);
      setIsLeaveGroupDialogOpen(false);
      setActiveChat(null);
      navigate(location.pathname, { replace: true, state: {} });
      toast.success("Đã rời nhóm");
    },
    onError: (error: { message?: string }) => {
      setLeaveGroupError(error?.message || "Không thể rời nhóm lúc này.");
    },
  });

  const manageAliasMutation = useMutation({
    mutationFn: async ({
      conversationId,
      userId,
      alias,
    }: {
      conversationId: string;
      userId: string;
      alias: string | null;
    }) => {
      if (alias) {
        return setConversationAlias(conversationId, userId, alias);
      } else {
        return deleteConversationAlias(conversationId, userId);
      }
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["conversation-aliases", variables.conversationId],
      });
      clearConversationListCache();
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({
        queryKey: ["messages", variables.conversationId],
      });
      setNicknameModal(null);
      setSuccessModal({
        title: "Thành công",
        message: "Biệt danh đã được cập nhật trong cuộc trò chuyện",
      });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể cập nhật biệt danh"));
    },
  });

  useEffect(() => {
    if (successModal) {
      const timer = setTimeout(() => setSuccessModal(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [successModal]);

  useEffect(() => {
    if (!lastEndedCall) {
      return;
    }

    setCallSummaries((prev) => {
      const next = [...prev];
      const nextKey = [
        lastEndedCall.conversationId,
        lastEndedCall.endedAt,
        lastEndedCall.peerUserId || "",
        lastEndedCall.direction,
        String(lastEndedCall.durationSeconds),
      ].join("|");

      const hasDuplicate = next.some(
        (item) =>
          [
            item.conversationId,
            item.endedAt,
            item.peerUserId || "",
            item.direction,
            String(item.durationSeconds),
          ].join("|") === nextKey,
      );

      if (!hasDuplicate) {
        next.push(lastEndedCall);
      }

      saveCallSummaries(next);
      return next;
    });
  }, [lastEndedCall]);

  useEffect(() => {
    if (!Array.isArray(myFriends) || myFriends.length === 0) {
      setFriendAvatarByUserId({});
      return;
    }

    const nextMap: Record<string, string> = {};
    myFriends.forEach((friend) => {
      const avatarUrl = friend.avatarAsset?.resolvedUrl || friend.avatarUrl;
      if (avatarUrl) {
        nextMap[friend.userId] = avatarUrl;
      }
    });

    setFriendAvatarByUserId(nextMap);
  }, [myFriends]);

  useEffect(() => {
    const dmTargets = mergedConversations
      .map((conversation) => {
        const conv = conversation as ConversationAvatarLike;
        const existingAvatar = resolveConversationAvatarUrl(conv);
        if (existingAvatar) {
          return null;
        }

        const peerUserId = extractDirectPeerUserId(conv, user?.sub);
        if (!peerUserId) {
          return null;
        }

        if (requestedDmAvatarIdsRef.current.has(peerUserId)) {
          return null;
        }

        return {
          conversationId: conversation.conversationId,
          peerUserId,
        };
      })
      .filter((item): item is { conversationId: string; peerUserId: string } =>
        Boolean(item),
      );

    if (dmTargets.length === 0) {
      return;
    }

    dmTargets.forEach(({ peerUserId }) => {
      requestedDmAvatarIdsRef.current.add(peerUserId);
    });

    void Promise.all(
      dmTargets.map(async ({ conversationId, peerUserId }) => {
        try {
          const profile = await getUserById(peerUserId);
          const avatarUrl =
            profile.avatarAsset?.resolvedUrl || profile.avatarUrl;
          if (!avatarUrl) {
            return;
          }

          setDmAvatarMap((prev) => {
            if (prev[conversationId] === avatarUrl) {
              return prev;
            }

            return {
              ...prev,
              [conversationId]: avatarUrl,
            };
          });
        } catch {
          // Keep silent for missing/forbidden profiles; fallback avatar will still render.
        }
      }),
    );
  }, [mergedConversations, user?.sub]);

  const dmUserIdsString = useMemo(() => {
    return Array.from(
      new Set(
        mergedConversations
          .filter((conversation) => !conversation.isGroup)
          .map((conversation) =>
            extractDirectPeerUserId(
              conversation as ConversationAvatarLike,
              user?.sub,
            ),
          )
          .filter((value): value is string => Boolean(value)),
      ),
    )
      .slice(0, 30)
      .sort()
      .join(",");
  }, [mergedConversations, user?.sub]);

  useEffect(() => {
    let cancelled = false;

    if (!dmUserIdsString || friendUserIds.size === 0) {
      return;
    }

    const dmUserIds = dmUserIdsString
      .split(",")
      .filter((id) => friendUserIds.has(id));
    if (dmUserIds.length === 0) return;

    const loadDmPresence = async () => {
      const results: Array<readonly [string, PresenceState] | null> = [];

      for (let i = 0; i < dmUserIds.length; i += 5) {
        if (cancelled) return;

        const chunk = dmUserIds.slice(i, i + 5);
        const chunkResults = await Promise.all(
          chunk.map(async (userId) => {
            if (failedPresenceUserIdsRef.current.has(userId)) {
              return null;
            }
            try {
              const presence = await getUserPresence(userId);
              return [userId, presence] as const;
            } catch (error: unknown) {
              const status = getErrorStatus(error);
              if (status === 403 || status === 404) {
                failedPresenceUserIdsRef.current.add(userId);
              }
              return null;
            }
          }),
        );

        results.push(...chunkResults);

        if (i + 5 < dmUserIds.length) {
          await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
      }

      if (cancelled) {
        return;
      }

      setDmPresenceByUserId((prev) => {
        const next = { ...prev };
        results.forEach((entry) => {
          if (!entry) {
            return;
          }

          const [userId, presence] = entry;
          next[userId] = presence;
        });
        return next;
      });
    };

    void loadDmPresence();
    const intervalId = window.setInterval(() => {
      void loadDmPresence();
    }, PRESENCE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dmUserIdsString, friendUserIds]);

  useEffect(() => {
    let cancelled = false;

    if (!activeDmUserId || !friendUserIds.has(activeDmUserId)) {
      setActiveDmPresence(null);
      return;
    }

    const loadPresence = async () => {
      if (failedPresenceUserIdsRef.current.has(activeDmUserId)) {
        if (!cancelled) setActiveDmPresence(null);
        return;
      }
      try {
        const presence = await getUserPresence(activeDmUserId);
        if (!cancelled) {
          setActiveDmPresence(presence);
          setDmPresenceByUserId((prev) => ({
            ...prev,
            [activeDmUserId]: presence,
          }));
        }
      } catch (error: unknown) {
        const status = getErrorStatus(error);
        if (status === 403 || status === 404) {
          failedPresenceUserIdsRef.current.add(activeDmUserId);
        }
        if (!cancelled) {
          setActiveDmPresence(null);
        }
      }
    };

    void loadPresence();
    const intervalId = window.setInterval(() => {
      void loadPresence();
    }, PRESENCE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeDmUserId, friendUserIds]);

  // Auto scroll to bottom for new messages, preserve position while loading older pages.
  useEffect(() => {
    const container = messagesContainerRef.current;

    // Reset tracking if the user switched conversations
    if (lastActiveChatRef.current !== activeChat) {
      lastActiveChatRef.current = activeChat;
      previousMessageCountRef.current = 0;
      loadingOlderMessagesRef.current = false;
      previousScrollHeightRef.current = 0;
    }

    if (loadingOlderMessagesRef.current && container) {
      const delta = container.scrollHeight - previousScrollHeightRef.current;
      container.scrollTop = container.scrollTop + Math.max(0, delta);
      loadingOlderMessagesRef.current = false;
      previousScrollHeightRef.current = 0;
      previousMessageCountRef.current = messages.length;
      return;
    }

    const previousCount = previousMessageCountRef.current;
    const isFirstLoad = previousCount === 0 && messages.length > 0;
    const hasNewMessage = previousCount > 0 && messages.length > previousCount;

    if (isFirstLoad || hasNewMessage) {
      // Short delay to ensure DOM is ready and animations have settled
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: isFirstLoad ? "auto" : "smooth",
          block: "end",
        });
      }, 50);
    }

    previousMessageCountRef.current = messages.length;
  }, [messages, activeChat]);

  const handleLoadMoreMessages = async () => {
    const container = messagesContainerRef.current;
    if (!container || !hasMore || isLoadingMore) {
      return;
    }

    previousScrollHeightRef.current = container.scrollHeight;
    loadingOlderMessagesRef.current = true;
    await loadMore();
  };

  useEffect(() => {
    if (!activeChat) {
      return;
    }

    const unreadCount = activeContact?.unreadCount ?? 0;
    if (unreadCount <= 0) {
      lastMarkedReadRef.current = null;
      return;
    }

    if (
      lastMarkedReadRef.current?.id === activeChat &&
      lastMarkedReadRef.current?.count === unreadCount
    ) {
      return;
    }

    lastMarkedReadRef.current = { id: activeChat, count: unreadCount };
    markAsRead();
  }, [activeChat, activeContact?.unreadCount, markAsRead]);

  useEffect(() => {
    if (!activeChat) {
      setIsInfoOpen(false);
    }
  }, [activeChat]);

  useEffect(() => {
    if (!activeContact?.isGroup) {
      setRenameGroupName("");
      return;
    }

    setRenameGroupName(activeContact.groupName || "");
  }, [activeContact?.groupName, activeContact?.isGroup]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        GROUP_AVATAR_OVERRIDES_STORAGE_KEY,
        JSON.stringify(groupAvatarOverrides),
      );
    } catch {
      // Ignore storage quota or privacy mode failures.
    }
  }, [groupAvatarOverrides]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        CONVERSATION_ALIAS_STORAGE_KEY,
        JSON.stringify(conversationAliases),
      );
    } catch {
      // Ignore storage quota or privacy mode failures.
    }
  }, [conversationAliases]);

  useEffect(() => {
    if (!activeChat) {
      setAliasInput("");
      return;
    }

    if (!activeContact?.isGroup && activeDmUserId) {
      setAliasInput(activeDmPeerAlias || "");
      return;
    }

    setAliasInput(conversationAliases[activeChat] || "");
  }, [
    activeChat,
    activeContact?.isGroup,
    activeDmPeerAlias,
    activeDmUserId,
    conversationAliases,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        MESSAGE_REACTIONS_STORAGE_KEY,
        JSON.stringify(messageReactionsByConversation),
      );
    } catch {
      // Ignore persistence issues.
    }
  }, [messageReactionsByConversation]);

  useEffect(() => {
    setReactionPickerMessageId(null);
  }, [activeChat]);

  useEffect(() => {
    setActiveMessageMenuId(null);
    setMessageMenuPlacement("down");
    setEditingMessageId(null);
    setEditingText("");
    setReplyingMessage(null);
    setMessageActionError("");
    setIsForwardDialogOpen(false);
    setForwardingMessageId(null);
    setSelectedForwardConversationIds([]);
    setForwardSearch("");
    setForwardActionError("");
    setMemberActionError("");
    setMemberLookupInput("");
    setMemberRoleInput("MEMBER");
    setMentionQuery("");
    setMentionStartIndex(null);
    setSelectedMentions([]);
    setLeaveGroupError("");
    setLeaveSuccessorUserId("");
    setIsLeaveGroupDialogOpen(false);
    setIsInviteDialogOpen(false);
    setInviteSearchText("");
    setSelectedInviteUserIds([]);
    setRenameGroupName("");
    setInviteLinkError("");
    setPendingRemoveMemberUserId(null);
    setActiveMemberActionUserId(null);
    setFocusedMessageId(null);
    setModalNicknameInput("");
    previousMessageCountRef.current = 0;
    loadingOlderMessagesRef.current = false;
    previousScrollHeightRef.current = 0;
    setShowAllPinned(false);
  }, [activeChat]);

  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMemberActionUserId(null);
    };

    if (!activeMemberActionUserId) {
      return;
    }

    window.addEventListener("click", handleClickOutside);
    return () => {
      window.removeEventListener("click", handleClickOutside);
    };
  }, [activeMemberActionUserId]);

  useEffect(() => {
    const handleContactAliasUpdated = () => {
      // Invalidate the incoming contact aliases query to refresh
      void queryClient.invalidateQueries({
        queryKey: ["contacts", "aliases", "incoming"],
      });
      // Also clear the conversations cache since the display names may have changed
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    socketClient.on("contact.alias.updated", handleContactAliasUpdated);
    return () => {
      socketClient.off("contact.alias.updated", handleContactAliasUpdated);
    };
  }, [queryClient]);

  useEffect(() => {
    return () => {
      if (messageFocusTimerRef.current !== null) {
        window.clearTimeout(messageFocusTimerRef.current);
      }
    };
  }, []);

  const toggleInviteSelection = (userId: string) => {
    setSelectedInviteUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const buildInviteJoinUrl = (invite: GroupInviteLink): string => {
    if (typeof window === "undefined") {
      return invite.code;
    }

    return `${window.location.origin}/groups/invite/${invite.code}`;
  };

  const handleCopyInviteLink = async (invite: GroupInviteLink) => {
    const inviteUrl = buildInviteJoinUrl(invite);

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = inviteUrl;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      toast.success("Đã sao chép link tham gia");
    } catch {
      toast.error("Không thể sao chép link tham gia.");
    }
  };

  const handleSaveConversationAlias = () => {
    if (!activeChat) {
      return;
    }

    const nextAlias = aliasInput.trim();

    if (!activeContact?.isGroup && activeDmUserId) {
      void manageAliasMutation.mutateAsync({
        conversationId: activeChat,
        userId: activeDmUserId,
        alias: nextAlias || null,
      });
      return;
    }

    setConversationAliases((prev) => {
      const next = { ...prev };
      if (nextAlias) {
        next[activeChat] = nextAlias;
      } else {
        delete next[activeChat];
      }
      return next;
    });

    toast.success(nextAlias ? "Đã lưu biệt danh" : "Đã xóa biệt danh");
  };

  const handleClearConversationAlias = () => {
    if (!activeChat) {
      return;
    }

    if (!activeContact?.isGroup && activeDmUserId) {
      setAliasInput("");
      void manageAliasMutation.mutateAsync({
        conversationId: activeChat,
        userId: activeDmUserId,
        alias: null,
      });
      return;
    }

    setAliasInput("");
    setConversationAliases((prev) => {
      const next = { ...prev };
      delete next[activeChat];
      return next;
    });
    toast.success("Đã xóa biệt danh");
  };

  const handleDeleteConversation = (conversationId?: string | null) => {
    const targetId = conversationId || activeChat;
    if (!targetId || deleteConversationMutation.isPending) {
      return;
    }

    setConfirmDialog({
      title: "Xóa cuộc trò chuyện",
      description:
        "Xóa cuộc trò chuyện này khỏi danh sách tin nhắn của bạn. Dữ liệu tin nhắn vẫn được bảo toàn cho các thành viên khác.",
      confirmLabel: "Xóa khỏi inbox",
      cancelLabel: "Hủy",
      intent: "danger",
      onConfirm: async () => {
        await deleteConversationMutation.mutateAsync(targetId);
      },
    });
  };

  const handleClearHistory = (conversationId?: string | null) => {
    const targetId = conversationId || activeChat;
    if (!targetId || clearHistoryMutation.isPending) {
      return;
    }

    setConfirmDialog({
      title: "Xóa lịch sử tin nhắn",
      description:
        "Xóa toàn bộ tin nhắn của cuộc trò chuyện này ở phía bạn. Hành động này không thể hoàn tác.",
      confirmLabel: "Xóa lịch sử",
      cancelLabel: "Hủy",
      intent: "danger",
      onConfirm: async () => {
        await clearHistoryMutation.mutateAsync(targetId);
      },
    });
  };

  const handleRenameGroup = async () => {
    if (!activeGroupId) {
      return;
    }

    const nextName = renameGroupName.trim();
    if (!nextName) {
      toast.error("Tên nhóm không được để trống.");
      return;
    }

    if (nextName === (activeContact?.groupName || "").trim()) {
      toast("Tên nhóm chưa thay đổi.");
      return;
    }

    await renameGroupMutation.mutateAsync({
      groupId: activeGroupId,
      groupName: nextName,
    });
  };

  const handleConfirmInviteMembers = async () => {
    if (!activeGroupId) {
      return;
    }

    if (selectedInviteUserIds.length === 0) {
      setMemberActionError("Vui lòng chọn ít nhất một bạn bè để mời.");
      return;
    }

    const results = await Promise.allSettled(
      selectedInviteUserIds.map((userId) =>
        manageGroupMemberMutation.mutateAsync({
          groupId: activeGroupId,
          userId,
          action: "add",
          roleInGroup: "MEMBER",
        }),
      ),
    );

    const successCount = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const failedCount = results.length - successCount;

    if (successCount > 0) {
      toast.success(`Đã mời ${successCount} thành viên`);
    }

    if (failedCount > 0) {
      toast.error(`${failedCount} lời mời không thành công`);
    }

    if (failedCount === 0) {
      setIsInviteDialogOpen(false);
      setSelectedInviteUserIds([]);
      setInviteSearchText("");
    }
  };

  const handleAddGroupMember = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!activeGroupId) {
      return;
    }

    const lookupValue = memberLookupInput.trim();
    if (!lookupValue) {
      setMemberActionError("Vui lòng nhập số điện thoại hoặc email.");
      return;
    }

    const isEmail = EMAIL_REGEX.test(lookupValue);
    const isPhone = PHONE_REGEX.test(lookupValue);
    if (!isEmail && !isPhone) {
      setMemberActionError(
        "Định dạng không hợp lệ. Hãy nhập đúng số điện thoại hoặc email.",
      );
      return;
    }

    let resolvedUser: UserProfile;
    try {
      resolvedUser = await searchUserExactByContact(lookupValue);
    } catch (error: unknown) {
      setMemberActionError(
        getErrorMessage(
          error,
          "Khong the tim thay nguoi dung theo so dien thoai/email.",
        ),
      );
      return;
    }

    if (resolvedUser.id === user?.sub) {
      setMemberActionError(
        "Không tìm thấy người dùng theo số điện thoại/email.",
      );
      return;
    }

    if (memberIdsInCurrentGroup.has(resolvedUser.id)) {
      setMemberActionError("Bạn đã là thành viên của nhóm này.");
      return;
    }

    await manageGroupMemberMutation.mutateAsync({
      groupId: activeGroupId,
      userId: resolvedUser.id,
      action: "add",
      roleInGroup: memberRoleInput,
    });
  };

  const handleRemoveGroupMember = async (memberUserId: string) => {
    if (!activeGroupId) {
      return;
    }

    if (manageGroupMemberMutation.isPending) {
      return;
    }

    setPendingRemoveMemberUserId(memberUserId);
  };

  const handleConfirmRemoveGroupMember = async () => {
    if (!activeGroupId || !pendingRemoveMemberUserId) {
      return;
    }

    await manageGroupMemberMutation.mutateAsync({
      groupId: activeGroupId,
      userId: pendingRemoveMemberUserId,
      action: "remove",
    });

    setPendingRemoveMemberUserId(null);
  };

  const handleToggleMemberRole = async (
    memberUserId: string,
    currentRole: GroupMemberRole,
  ) => {
    if (!activeGroupId) {
      return;
    }

    const nextRole: GroupMemberRole =
      currentRole === "DEPUTY" ? "MEMBER" : "DEPUTY";

    await manageGroupMemberMutation.mutateAsync({
      groupId: activeGroupId,
      userId: memberUserId,
      action: "update",
      roleInGroup: nextRole,
    });
  };

  const handleLeaveGroupFromChat = async () => {
    if (!activeGroupId || leaveGroupMutation.isPending) {
      return;
    }

    if (isCurrentUserOwner && !leaveSuccessorUserId.trim()) {
      setLeaveGroupError(
        "Bạn là chủ nhóm, vui lòng chọn người kế nhiệm trước khi rời nhóm.",
      );
      return;
    }

    await leaveGroupMutation.mutateAsync({
      groupId: activeGroupId,
      successorUserId: isCurrentUserOwner
        ? leaveSuccessorUserId.trim()
        : undefined,
    });
  };

  const handleTransferOwnership = async (targetUserId: string) => {
    if (
      !activeGroupId ||
      !targetUserId ||
      manageGroupMemberMutation.isPending
    ) {
      return;
    }

    setConfirmInput("");
    setConfirmDialog({
      title: "Chuyển quyền nhóm trưởng",
      description:
        "Bạn có chắc chắn muốn chuyển quyền nhóm trưởng cho người này? Bạn sẽ trở thành thành viên thông thường.",
      confirmLabel: "Chuyển quyền",
      cancelLabel: "Hủy",
      intent: "danger",
      onConfirm: async () => {
        await manageGroupMemberMutation.mutateAsync({
          groupId: activeGroupId,
          userId: targetUserId,
          action: "transfer",
        });
      },
    });
  };

  const closeConfirmDialog = () => {
    if (isConfirming) {
      return;
    }

    setConfirmDialog(null);
    setConfirmInput("");
  };

  const handleConfirmDialogAction = async () => {
    if (!confirmDialog) {
      return;
    }

    if (
      confirmDialog.requireInput &&
      confirmInput.trim() !== confirmDialog.requireInput.expectedValue
    ) {
      return;
    }

    setIsConfirming(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
      setConfirmInput("");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSendFriendRequest = async (targetUserId: string) => {
    if (!targetUserId || targetUserId === user?.sub) {
      return;
    }

    if (friendUserIds.has(targetUserId)) {
      return;
    }

    if (outgoingFriendRequestUserIds.has(targetUserId)) {
      return;
    }

    await sendFriendRequestMutation.mutateAsync(targetUserId);
  };

  const closeMentionMenu = () => {
    setMentionStartIndex(null);
    setMentionQuery("");
  };

  const syncMentionContext = (
    nextValue: string,
    cursorPosition: number | null,
  ) => {
    if (!activeGroupId || cursorPosition === null) {
      closeMentionMenu();
      return;
    }

    const textBeforeCursor = nextValue.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    if (lastAtIndex < 0) {
      closeMentionMenu();
      return;
    }

    const hasValidPrefix =
      lastAtIndex === 0 || /\s/.test(textBeforeCursor[lastAtIndex - 1] || "");
    if (!hasValidPrefix) {
      closeMentionMenu();
      return;
    }

    const keyword = textBeforeCursor.slice(lastAtIndex + 1);
    if (/\s/.test(keyword)) {
      closeMentionMenu();
      return;
    }

    setMentionStartIndex(lastAtIndex);
    setMentionQuery(keyword);
  };

  const handleComposerInputChange = (
    nextValue: string,
    cursorPosition: number | null,
  ) => {
    setInputText(nextValue);
    setSelectedMentions((prev) =>
      prev.filter((mention) => nextValue.includes(`@${mention.displayName}`)),
    );
    syncMentionContext(nextValue, cursorPosition);
  };

  const handleInsertMention = (candidate: MentionCandidate) => {
    const input = composerInputRef.current;
    if (!input || mentionStartIndex === null) {
      return;
    }

    const cursorPosition = input.selectionStart ?? inputText.length;
    const prefix = inputText.slice(0, mentionStartIndex);
    const suffix = inputText.slice(cursorPosition);
    const mentionToken = `@${candidate.displayName} `;
    const nextValue = `${prefix}${mentionToken}${suffix}`;
    const nextCursorPosition = (prefix + mentionToken).length;

    setInputText(nextValue);
    setSelectedMentions((prev) => {
      if (prev.some((item) => item.userId === candidate.userId)) {
        return prev;
      }
      return [...prev, candidate];
    });
    closeMentionMenu();

    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  const handleComposerKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (!isMentionMenuOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMentionMenu();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const firstCandidate = mentionCandidates[0];
      if (firstCandidate) {
        handleInsertMention(firstCandidate);
      }
    }
  };

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

  const handleStartCall = (isVideo: boolean, isJoining = false) => {
    if (!activeContact) return;

    const participantNames = Object.fromEntries(displayNameByUserId.entries());
    const participantAvatarUrls = Object.fromEntries([
      ...groupMemberAvatarByUserId.entries(),
      ...Object.entries(friendAvatarByUserId),
      ...(user?.sub && callerAvatarUrl ? [[user.sub, callerAvatarUrl]] : []),
      ...(activeDmUserId && activeContactAvatarUrl
        ? [[activeDmUserId, activeContactAvatarUrl]]
        : []),
    ]);
    const config = {
      isVideo,
      conversationId: activeContact.conversationId,
      targetUserId: activeDmUserId,
      callerId: user?.sub,
      callerName:
        (user?.sub ? conversationAliasByUserId.get(user.sub) : undefined) ||
        callerDisplayName,
      callerAvatarUrl,
      peerName: activeConversationDisplayName,
      peerAvatarUrl: activeContactAvatarUrl,
      participantNames,
      participantAvatarUrls,
    };

    if (isJoining && rtc.joinCall) {
      rtc.joinCall(config);
    } else {
      startCall(config);
    }
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

  const replaceMentionIdsWithNames = useCallback(
    (text: string, mentionPayload: unknown): string => {
    if (
      !text ||
      !Array.isArray(mentionPayload) ||
      mentionPayload.length === 0
    ) {
      return text;
    }

    const mentionIds = mentionPayload
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        if (!entry || typeof entry !== "object") {
          return undefined;
        }

        const record = entry as Record<string, unknown>;
        if (typeof record.userId === "string") {
          return record.userId;
        }

        if (typeof record.id === "string") {
          return record.id;
        }

        return undefined;
      })
      .filter((value): value is string => Boolean(value?.trim()));

    let nextText = text;
    mentionIds.forEach((userId) => {
      const displayName = mentionNameByUserId.get(userId);
      if (!displayName) {
        return;
      }

      const escapedUserId = escapeRegExp(userId);
      const mentionPattern = new RegExp(`@${escapedUserId}(?=\\b|\\s|$)`, "g");
      nextText = nextText.replace(mentionPattern, `@${displayName}`);
    });

    return nextText;
    },
    [mentionNameByUserId],
  );

  const extractMentionDisplayNames = (mentionPayload: unknown): string[] => {
    if (!Array.isArray(mentionPayload)) {
      return [];
    }

    const uniqueNames = new Set<string>();
    mentionPayload.forEach((entry) => {
      let userId: string | undefined;

      if (typeof entry === "string") {
        userId = entry;
      } else if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        if (typeof record.userId === "string") {
          userId = record.userId;
        } else if (typeof record.id === "string") {
          userId = record.id;
        }
      }

      if (!userId) {
        return;
      }

      const displayName = mentionNameByUserId.get(userId);
      if (displayName) {
        uniqueNames.add(displayName);
      }
    });

    return Array.from(uniqueNames);
  };

  const renderMessageTextWithLinks = (
    text: string,
    isMe: boolean,
    keyPrefix: string,
  ): ReactNode => {
    const urlMatches = Array.from(text.matchAll(URL_PATTERN));
    if (urlMatches.length === 0) {
      return text;
    }

    const nodes: ReactNode[] = [];
    let cursor = 0;

    urlMatches.forEach((match, urlIndex) => {
      const matched = match[0];
      const start = match.index ?? 0;
      const end = start + matched.length;

      if (start > cursor) {
        nodes.push(
          <span key={`${keyPrefix}-plain-${urlIndex}`}>
            {text.slice(cursor, start)}
          </span>,
        );
      }

      const sanitized = sanitizeUrlToken(matched);
      const trailing = matched.slice(sanitized.length);

      nodes.push(
        <a
          key={`${keyPrefix}-url-${urlIndex}`}
          href={sanitized}
          target="_blank"
          rel="noreferrer"
          className={
            isMe
              ? "font-medium underline break-all text-blue-100"
              : "font-medium underline break-all text-blue-600 dark:text-blue-400"
          }
        >
          {sanitized}
        </a>,
      );

      if (trailing) {
        nodes.push(
          <span key={`${keyPrefix}-tail-${urlIndex}`}>{trailing}</span>,
        );
      }

      cursor = end;
    });

    if (cursor < text.length) {
      nodes.push(<span key={`${keyPrefix}-rest`}>{text.slice(cursor)}</span>);
    }

    return nodes;
  };

  const renderMessageTextWithMentions = (content: string, isMe: boolean) => {
    let parsedMentionPayload: unknown;
    let textValue = content;

    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        textValue =
          typeof (parsed as { text?: unknown }).text === "string"
            ? (parsed as { text: string }).text
            : content;
        parsedMentionPayload = (parsed as { mention?: unknown }).mention;
      }
    } catch {
      textValue = content;
    }

    const normalizedText = replaceMentionIdsWithNames(
      textValue,
      parsedMentionPayload,
    );
    const mentionTokens = extractMentionDisplayNames(parsedMentionPayload)
      .map((name) => `@${name}`)
      .sort((left, right) => right.length - left.length);

    if (mentionTokens.length === 0) {
      return renderMessageTextWithLinks(normalizedText, isMe, "no-mention");
    }

    const mentionPattern = new RegExp(
      `(${mentionTokens.map((token) => escapeRegExp(token)).join("|")})`,
      "g",
    );
    const parts = normalizedText.split(mentionPattern).filter(Boolean);
    const mentionTokenSet = new Set(mentionTokens);

    return parts.map((part, index) => {
      if (mentionTokenSet.has(part)) {
        return (
          <span
            key={`mention-${index}`}
            className={
              isMe
                ? "font-bold text-blue-100"
                : "font-bold text-blue-600 dark:text-blue-400"
            }
          >
            {part}
          </span>
        );
      }

      return (
        <Fragment key={`mixed-${index}`}>
          {renderMessageTextWithLinks(part, isMe, `mention-part-${index}`)}
        </Fragment>
      );
    });
  };

  const formatSystemMessageText = useCallback((text: string): string => {
    if (!text.trim()) {
      return text;
    }

    return text.replace(USER_ID_PATTERN, (token) => {
      const displayName = displayNameByUserId.get(token);
      if (displayName) {
        return canViewSensitiveUserIds
          ? `${displayName} (${token})`
          : displayName;
      }

      return canViewSensitiveUserIds ? token : "một thành viên";
    });
  }, [canViewSensitiveUserIds, displayNameByUserId]);

  const extractMessageText = useCallback(
    (content: string, messageType?: ChatMessageType): string => {
      const normalizeText = (value: string) => {
        if (messageType === "SYSTEM") {
          return formatSystemMessageText(value);
        }

        return value;
      };

      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const text =
            typeof (parsed as { text?: unknown }).text === "string"
              ? (parsed as { text: string }).text
              : content;
          return normalizeText(
            replaceMentionIdsWithNames(
              text,
              (parsed as { mention?: unknown }).mention,
            ),
          );
        }

        return normalizeText(content);
      } catch {
        return normalizeText(content);
      }
    },
    [formatSystemMessageText, replaceMentionIdsWithNames],
  );

  const normalizedMessageSearch = messageSearch.trim().toLowerCase();
  const filteredMessages = useMemo(() => {
    if (!normalizedMessageSearch) {
      return messages;
    }

    return messages.filter((message) => {
      const messageText = extractMessageText(
        message.content,
        message.type,
      ).toLowerCase();
      const senderName = message.senderName?.toLowerCase() || "";
      return (
        messageText.includes(normalizedMessageSearch) ||
        senderName.includes(normalizedMessageSearch)
      );
    });
  }, [extractMessageText, messages, normalizedMessageSearch]);

  const formatCallDuration = (totalSeconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;

    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const resolveCallSummary = (
    msg: MessageItem,
    expectedIsVideo: boolean,
  ): CallEndedSummary | null => {
    const candidates = callSummaries.filter(
      (item) =>
        (item.conversationId === msg.conversationId ||
          item.peerUserId === activeDmUserId) &&
        item.peerUserId === activeDmUserId,
    );

    if (candidates.length === 0) {
      return null;
    }

    const scopedCandidates = candidates.filter(
      (item) => item.isVideo === expectedIsVideo,
    );
    const finalCandidates =
      scopedCandidates.length > 0 ? scopedCandidates : candidates;

    const messageTime = new Date(msg.sentAt).getTime();
    const nearest = finalCandidates
      .map((item) => ({
        item,
        diff: Math.abs(new Date(item.endedAt).getTime() - messageTime),
      }))
      .sort((left, right) => left.diff - right.diff)[0];

    if (!nearest || nearest.diff > 10 * 60 * 1000) {
      return null;
    }

    return nearest.item;
  };

  const getReplyPreviewText = (message: MessageReplyReference): string => {
    if (message.recalledAt || message.deletedAt) {
      return "Tin nhắn đã được thu hồi";
    }

    const text = extractMessageText(message.content, message.type).trim();
    if (text) {
      return text;
    }

    if (message.attachmentUrl) {
      if (message.type === "IMAGE") {
        return "Ảnh";
      }

      if (message.type === "VIDEO") {
        return "Video";
      }

      if (message.type === "AUDIO") {
        return "Âm thanh";
      }

      return "Tệp đính kèm";
    }

    return "Tin nhắn";
  };

  const normalizeQuotedMessage = (
    message: MessageItem,
  ): MessageReplyReference => ({
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    type: message.type,
    content: message.content,
    attachmentAsset: message.attachmentAsset,
    attachmentUrl: message.attachmentUrl,
    deletedAt: message.deletedAt,
    recalledAt: message.recalledAt,
    sentAt: message.sentAt,
  });

  const handleStartEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingText(extractMessageText(content));
    setActiveMessageMenuId(null);
    setMessageActionError("");
  };

  const handleStartReplyMessage = (message: MessageItem) => {
    setReplyingMessage(normalizeQuotedMessage(message));
    setActiveMessageMenuId(null);
    setMessageActionError("");
  };

  const handleFocusMessageById = (messageId?: string) => {
    if (!messageId) {
      return;
    }

    const target = messageItemRefs.current[messageId];
    if (!target) {
      toast("Tin nhắn gốc chưa được tải. Hãy kéo lên để tải thêm.");
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setFocusedMessageId(messageId);

    if (messageFocusTimerRef.current !== null) {
      window.clearTimeout(messageFocusTimerRef.current);
    }

    messageFocusTimerRef.current = window.setTimeout(() => {
      setFocusedMessageId(null);
      messageFocusTimerRef.current = null;
    }, 1800);
  };

  const handleCancelReplyMessage = () => {
    setReplyingMessage(null);
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
    } catch (error: unknown) {
      setMessageActionError(getErrorMessage(error, "Khong the sua tin nhan"));
    }
  };

  const handleDeleteMessage = async (
    messageId: string,
    scope: RecallScope = "SELF",
  ) => {
    setConfirmInput("");
    setConfirmDialog({
      title: scope === "EVERYONE" ? "Thu hồi tin nhắn" : "Xóa tin nhắn",
      description:
        scope === "EVERYONE"
          ? "Bạn có chắc muốn thu hồi tin nhắn này với mọi người?"
          : "Xóa tin nhắn này chỉ với bạn?",
      confirmLabel: scope === "EVERYONE" ? "Thu hồi" : "Xóa",
      cancelLabel: "Hủy",
      intent: "danger",
      onConfirm: async () => {
        try {
          await deleteMessageAsync({ messageId, scope });
          setActiveMessageMenuId(null);
          setMessageActionError("");
        } catch (error: unknown) {
          setMessageActionError(
            getErrorMessage(error, "Khong the xu ly xoa tin nhan"),
          );
        }
      },
    });
  };

  const handleOpenForwardDialog = (messageId: string) => {
    setForwardingMessageId(messageId);
    setSelectedForwardConversationIds([]);
    setForwardSearch("");
    setForwardActionError("");
    setIsForwardDialogOpen(true);
    setActiveMessageMenuId(null);
  };

  const handleCloseForwardDialog = () => {
    if (isForwardingMessage) {
      return;
    }

    setIsForwardDialogOpen(false);
    setForwardingMessageId(null);
    setSelectedForwardConversationIds([]);
    setForwardSearch("");
    setForwardActionError("");
  };

  const focusComposer = () => {
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const clearTypingTimer = useCallback(() => {
    if (typingStopTimerRef.current !== null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  }, []);

  const stopTyping = useCallback(() => {
    clearTypingTimer();

    if (!isTypingRef.current) {
      return;
    }

    isTypingRef.current = false;
    void sendTyping(false);
  }, [clearTypingTimer, sendTyping]);

  const scheduleTypingStop = useCallback(() => {
    clearTypingTimer();

    typingStopTimerRef.current = window.setTimeout(() => {
      typingStopTimerRef.current = null;
      if (!isTypingRef.current) {
        return;
      }

      isTypingRef.current = false;
      void sendTyping(false);
    }, 1200);
  }, [clearTypingTimer, sendTyping]);

  const handleToggleForwardTarget = (conversationId: string) => {
    setSelectedForwardConversationIds((prev) =>
      prev.includes(conversationId)
        ? prev.filter((id) => id !== conversationId)
        : [...prev, conversationId],
    );
  };

  const handleConfirmForwardMessage = async () => {
    if (!forwardingMessageId) {
      setForwardActionError("Không xác định được tin nhắn cần chuyển tiếp.");
      return;
    }

    if (selectedForwardConversationIds.length === 0) {
      setForwardActionError("Vui lòng chọn ít nhất một cuộc trò chuyện.");
      return;
    }

    try {
      await forwardMessageAsync({
        messageId: forwardingMessageId,
        conversationIds: selectedForwardConversationIds,
      });
      handleCloseForwardDialog();
    } catch (error: unknown) {
      setForwardActionError(
        getErrorMessage(error, "Khong the chuyen tiep tin nhan."),
      );
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

  const handleGroupAvatarFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !activeGroupId) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn tệp ảnh hợp lệ.");
      return;
    }

    try {
      setIsUpdatingGroupAvatar(true);
      const uploaded = await uploadMedia({
        file,
        target: "GENERAL",
        entityId: activeGroupId,
      });

      setGroupAvatarOverrides((prev) => ({
        ...prev,
        [activeGroupId]: uploaded.url,
      }));
      toast.success("Đã cập nhật ảnh nhóm.");
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Khong the cap nhat anh nhom luc nay."),
      );
    } finally {
      setIsUpdatingGroupAvatar(false);
    }
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

  const handleToggleMessageReaction = (messageId: string, emoji: string) => {
    if (!activeChat) {
      return;
    }

    setMessageReactionsByConversation((prev) => {
      const currentConversation = prev[activeChat] || {};
      const currentReactions = currentConversation[messageId] || [];
      const hasReaction = currentReactions.includes(emoji);
      const nextReactions = hasReaction
        ? currentReactions.filter((item) => item !== emoji)
        : [...currentReactions, emoji];

      const nextConversation = { ...currentConversation };
      if (nextReactions.length === 0) {
        delete nextConversation[messageId];
      } else {
        nextConversation[messageId] = nextReactions;
      }

      return {
        ...prev,
        [activeChat]: nextConversation,
      };
    });
  };

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    const input = composerInputRef.current;

    if (!input) {
      const nextText = `${inputText}${emoji}`;
      handleComposerInputChange(nextText, nextText.length);
      return;
    }

    const cursorStart = input.selectionStart ?? inputText.length;
    const cursorEnd = input.selectionEnd ?? cursorStart;
    const nextText = `${inputText.slice(0, cursorStart)}${emoji}${inputText.slice(cursorEnd)}`;
    const nextCursor = cursorStart + emoji.length;

    handleComposerInputChange(nextText, nextCursor);

    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });

    if (!activeChat) {
      return;
    }

    if (!nextText.trim()) {
      stopTyping();
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      void sendTyping(true);
    }

    scheduleTypingStop();
  };

  useEffect(() => {
    if (!isEmojiPickerOpen) {
      return;
    }

    const handleOutsideEmojiPicker = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (emojiPickerRef.current?.contains(target)) {
        return;
      }

      setIsEmojiPickerOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideEmojiPicker);
    return () => {
      document.removeEventListener("mousedown", handleOutsideEmojiPicker);
    };
  }, [isEmojiPickerOpen]);

  useEffect(() => {
    const handleCloseConvMenu = () => setConvContextMenu(null);
    window.addEventListener("click", handleCloseConvMenu);
    return () => window.removeEventListener("click", handleCloseConvMenu);
  }, []);

  const handleConvContextMenu = (
    e: React.MouseEvent,
    conversationId: string,
  ) => {
    e.preventDefault();
    setConvContextMenu({
      x: e.clientX,
      y: e.clientY,
      conversationId,
    });
  };

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [activeChat, stopTyping]);

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
      let pendingMentions = [
        ...new Set(
          selectedMentions
            .filter((mention) => inputText.includes(`@${mention.displayName}`))
            .map((mention) => mention.userId),
        ),
      ];
      let sentAny = false;
      const replyTo = replyingMessage?.id;
      closeMentionMenu();

      if (queuedAttachments.length === 0) {
        setInputText("");
        setSelectedMentions([]);
        setReplyingMessage(null);
        stopTyping();
        focusComposer();

        await sendMessageAsync({
          text: pendingText,
          type: "TEXT",
          replyTo,
          mentions: pendingMentions,
        });
        pendingText = "";
        pendingMentions = [];
        sentAny = true;
      } else {
        setIsUploading(true);
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
              replyTo,
              mentions: pendingMentions,
            });

            pendingText = "";
            pendingMentions = [];
            sentAny = true;
            setQueuedAttachments((prev) =>
              prev.filter((entry) => entry.id !== item.id),
            );
          } catch {
            setQueuedAttachments((prev) =>
              prev.map((entry) =>
                entry.id === item.id ? { ...entry, status: "failed" } : entry,
              ),
            );
          }
        }
      }

      if (sentAny) {
        setInputText(pendingText);
        setSelectedMentions([]);
        setReplyingMessage(null);
        stopTyping();
        focusComposer();
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } finally {
      if (queuedAttachments.length > 0) {
        setIsUploading(false);
      }
    }
  };

  return (
    <div
      className="flex h-full w-full relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-blue-600/10 border-2 border-dashed border-blue-400 pointer-events-none">
          <div className="rounded-xl bg-white dark:bg-slate-900 px-5 py-3 text-sm font-medium text-blue-700 dark:text-blue-300 shadow border border-slate-200 dark:border-slate-700">
            Thả tệp vào đây để gửi
          </div>
        </div>
      ) : null}

      {/* Cột trái: Master (Danh sách hội thoại) */}
      <div
        className={`${activeChat ? "hidden md:flex" : "flex"} w-full md:w-[340px] md:flex-shrink-0 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-col h-full overflow-hidden`}
      >
        <div className="h-16 border-b border-gray-100 dark:border-slate-700 glass flex items-center justify-between px-4 shrink-0">
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

        <div className="flex-1 overflow-y-auto min-h-0 hide-scrollbar">
          {loadingConversations && (
            <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">
              Đang tải cuộc trò chuyện...
            </div>
          )}
          {!loadingConversations && renderedConversations.length === 0 && (
            <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">
              {conversationSearch.trim()
                ? "Không tìm thấy hội thoại phù hợp"
                : "Chưa có hội thoại nào"}
            </div>
          )}
          {renderedConversations.map((chat) =>
            (() => {
              const effectiveUnreadCount =
                chat.conversationId === activeChat
                  ? 0
                  : (chat.unreadCount ?? 0);
              const chatDmUserId = chat.isGroup
                ? undefined
                : extractDirectPeerUserId(
                    chat as ConversationAvatarLike,
                    user?.sub,
                  );
              const chatPresence = chatDmUserId
                ? dmPresenceByUserId[chatDmUserId]
                : undefined;
              const chatLastSeenBadge = formatLastSeenShort(
                chatPresence,
                chat.updatedAt,
              );
              const chatGroupId = extractGroupIdFromConversationId(
                chat.conversationId,
              );
              const chatAvatarFromConversation = resolveConversationAvatarUrl(
                chat as ConversationAvatarLike,
              );
              const chatAvatarFromFriendMap = resolveDmAvatarFromFriendMap(
                chat as ConversationAvatarLike,
                friendAvatarByUserId,
                user?.sub,
              );
              const chatAvatarUrl =
                (chatGroupId ? groupAvatarOverrides[chatGroupId] : undefined) ||
                chatAvatarFromConversation ||
                chatAvatarFromFriendMap ||
                dmAvatarMap[chat.conversationId] ||
                (
                  chat as {
                    avatarAsset?: { resolvedUrl?: string };
                    avatarUrl?: string;
                  }
                ).avatarAsset?.resolvedUrl ||
                (
                  chat as {
                    avatarAsset?: { resolvedUrl?: string };
                    avatarUrl?: string;
                  }
                ).avatarUrl;
              return (
                <div
                  key={chat.conversationId}
                  onClick={() => setActiveChat(chat.conversationId)}
                  onContextMenu={(e) =>
                    handleConvContextMenu(e, chat.conversationId)
                  }
                  className={`flex items-center gap-3 p-3 mx-2 my-1 rounded-lg cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-95 animate-in fade-in ${
                    activeChat === chat.conversationId
                      ? "bg-blue-50 dark:bg-blue-950/40 shadow-sm"
                      : "hover:bg-gray-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12 border border-gray-100 dark:border-slate-700">
                      {chatAvatarUrl ? (
                        <AvatarImage
                          src={chatAvatarUrl}
                          alt={resolveConversationDisplayName(chat)}
                        />
                      ) : null}
                      <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                        {resolveConversationDisplayName(chat)
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {!chat.isGroup && chatPresence?.isActive ? (
                      <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-900" />
                    ) : null}
                    {!chat.isGroup && !chatPresence?.isActive ? (
                      <span className="absolute -right-1 -bottom-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
                        {chatLastSeenBadge || "1m"}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-medium text-[15px] truncate">
                        {resolveConversationDisplayName(chat)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-400 flex-shrink-0">
                        {chat.updatedAt
                          ? format(new Date(chat.updatedAt), "HH:mm")
                          : ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span
                        className={
                          "text-sm truncate " +
                          (effectiveUnreadCount > 0
                            ? "font-semibold text-slate-800 dark:text-slate-100"
                            : "text-gray-500 dark:text-slate-400")
                        }
                      >
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
            })(),
          )}
        </div>

        {convContextMenu && (
          <div
            className="fixed z-[100] w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-100"
            style={{ top: convContextMenu.y, left: convContextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                const cid = convContextMenu.conversationId;
                setConvContextMenu(null);
                handleClearHistory(cid);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <Eraser size={16} />
              Xóa lịch sử
            </button>
            <button
              onClick={() => {
                const cid = convContextMenu.conversationId;
                setConvContextMenu(null);
                handleDeleteConversation(cid);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <Trash2 size={16} />
              Xóa cuộc trò chuyện
            </button>
          </div>
        )}
      </div>

      {/* Cột phải: Detail (Chi tiết chat) */}
      <div
        className={`${activeChat ? "flex" : "hidden md:flex"} flex-1 min-h-0 flex-col bg-[#f3f6fb] dark:bg-slate-950 relative overflow-hidden h-full lg:transition-[padding] lg:duration-200 ${isInfoOpen ? "lg:pr-[356px]" : ""}`}
      >
        {!activeChat ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500 gap-4 mt-20">
            <UserRound size={60} className="opacity-20" />
            <p>Chọn một cuộc trò chuyện để bắt đầu nhắn tin</p>
          </div>
        ) : (
          <>
            {/* Header khung chat */}
            <div className="h-16 border-b border-gray-200 dark:border-slate-700 glass flex flex-shrink-0 items-center justify-between px-4 z-10 shadow-sm relative">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setActiveChat(null)}
                    className="md:hidden rounded-full p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    title="Quay lại danh sách hội thoại"
                  >
                    <X size={18} />
                  </button>
                  <Avatar className="h-10 w-10">
                    {activeContactAvatarUrl ? (
                      <AvatarImage
                        src={activeContactAvatarUrl}
                        alt={activeConversationDisplayName}
                      />
                    ) : null}
                    <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                      {activeConversationDisplayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!activeContact?.isGroup && activePresence?.isActive ? (
                    <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-900" />
                  ) : null}
                  {!activeContact?.isGroup && !activePresence?.isActive ? (
                    <span className="absolute -right-1 -bottom-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
                      {activeLastSeenBadge || "1m"}
                    </span>
                  ) : null}
                </div>
                <div>
                  <h2 className="font-semibold text-base leading-none">
                    {activeConversationDisplayName}
                  </h2>
                  <span
                    className={`text-xs font-medium ${activeStatusToneClass}`}
                  >
                    {activeStatusText}
                  </span>
                </div>
              </div>
              <div className="flex items-center text-gray-600 dark:text-slate-300">
                <button
                  type="button"
                  className="rounded-full p-2.5 transition hover:bg-gray-100 dark:hover:bg-slate-800"
                  title="Bắt đầu cuộc gọi thoại"
                  onClick={() => handleStartCall(false)}
                >
                  <Phone size={19} />
                </button>
                <button
                  type="button"
                  className="rounded-full p-2.5 transition hover:bg-gray-100 dark:hover:bg-slate-800"
                  title="Bắt đầu cuộc gọi video"
                  onClick={() => handleStartCall(true)}
                >
                  <Video size={19} />
                </button>
                <div className="mx-1 h-8 w-px bg-gray-200 dark:bg-slate-700" />
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className={`rounded-full p-2.5 transition ${isSearchOpen ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30" : "hover:bg-gray-100 dark:hover:bg-slate-800"}`}
                  title="Tìm kiếm tin nhắn"
                >
                  <Search size={19} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsInfoOpen(!isInfoOpen)}
                  className={`rounded-full p-2.5 transition ${isInfoOpen ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30" : "hover:bg-gray-100 dark:hover:bg-slate-800"}`}
                  title="Thông tin hội thoại"
                >
                  <Info size={19} />
                </button>
                <button
                  type="button"
                  className="rounded-full p-2.5 transition hover:bg-gray-100 dark:hover:bg-slate-800"
                  title="Thêm"
                  onClick={() =>
                    activeContact?.isGroup && setIsManageGroupModalOpen(true)
                  }
                >
                  <MoreHorizontal size={19} />
                </button>
              </div>
            </div>

            {/* Thanh tin nhắn ghim */}
            {pinnedMessages.length > 0 && (() => {
              // Sort pinned messages: newest first
              const sortedPinned = [...pinnedMessages].sort(
                (a, b) => new Date(b.pinnedAt || b.sentAt || 0).getTime() - new Date(a.pinnedAt || a.sentAt || 0).getTime()
              );
              
              const displayedPinned = showAllPinned ? sortedPinned : [sortedPinned[0]];
              const hasMorePinned = sortedPinned.length > 1;

              return (
                <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-gray-100 dark:border-slate-800 px-4 py-2.5 flex items-start gap-3 animate-in slide-in-from-top duration-300 z-20 shadow-sm transition-all duration-300">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Pin size={15} className="rotate-45" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {displayedPinned.map((m) => (
                      <div
                        key={`pinned-${m.id}`}
                        className="flex items-start justify-between gap-3 rounded-md px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        onClick={() => {
                          const el = document.getElementById(`msg-${m.id}`);
                          if (el) {
                            el.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                            Tin nhắn đã ghim {sortedPinned.indexOf(m) === 0 ? "(mới nhất)" : ""}
                          </p>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate mt-0.5">
                            {(() => {
                              try {
                                const p = JSON.parse(m.content);
                                return p.text || p.poll?.question || m.content;
                              } catch {
                                return m.content;
                              }
                            })()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleTogglePin(m);
                          }}
                          className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          title="Bỏ ghim"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    
                    {hasMorePinned && (
                      <div className="px-2.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setShowAllPinned(!showAllPinned)}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1 focus:outline-none"
                        >
                          {showAllPinned ? "Thu gọn" : `Xem thêm (${sortedPinned.length - 1} tin nhắn ghim khác)`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Thanh tìm kiếm tin nhắn */}
            {isSearchOpen && (
              <div className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2 flex flex-col gap-2 z-10 animate-in slide-in-from-top duration-200">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={messageSearch}
                      onChange={(event) => setMessageSearch(event.target.value)}
                      placeholder="Tìm tin nhắn..."
                      className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                    />
                    {messageSearch ? (
                      <button
                        type="button"
                        onClick={() => setMessageSearch("")}
                        className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                        title="Xóa tìm kiếm"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                  <button
                    onClick={() => {
                      setIsSearchOpen(false);
                      setMessageSearch("");
                      setMessageTypeFilter("");
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Đóng
                  </button>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
                  {[
                    { label: "Tất cả", value: "" },
                    { label: "Hình ảnh", value: "IMAGE" },
                    { label: "Video", value: "VIDEO" },
                    { label: "Tệp tin", value: "DOC" },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => setMessageTypeFilter(filter.value)}
                      className={`px-3 py-1 rounded-full text-[10px] font-medium transition ${
                        messageTypeFilter === filter.value
                          ? "bg-blue-600 text-white shadow-sm"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isInfoOpen ? (
              <button
                type="button"
                aria-label="Đóng thông tin cuộc trò chuyện"
                onClick={() => setIsInfoOpen(false)}
                className="absolute inset-0 z-20 bg-black/35 backdrop-blur-[1px] lg:hidden"
              />
            ) : null}

            <aside
              className={`absolute right-0 top-16 z-30 flex h-[calc(100%-4rem)] w-full max-w-full flex-col border-l border-slate-200 bg-slate-50/80 backdrop-blur-xl shadow-2xl transition-transform duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-950/80 sm:w-[360px] sm:max-w-[90%] md:w-[340px] lg:right-0 lg:top-0 lg:h-full lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:shadow-none ${isInfoOpen ? "translate-x-0" : "translate-x-full"}`}
            >
              <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Thông tin cuộc trò chuyện
                </h3>
                <button
                  onClick={() => setIsInfoOpen(false)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Đóng
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm text-slate-700 dark:text-slate-300 hide-scrollbar">
                <div className="rounded-2xl glass-card px-4 py-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
                      Tên hiển thị
                    </p>
                    {activeGroupId && canRenameGroup && !isRenaming && (
                      <button
                        onClick={() => {
                          setRenameGroupName(activeContact?.groupName || "");
                          setIsRenaming(true);
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:underline"
                      >
                        ĐỔI TÊN
                      </button>
                    )}
                  </div>

                  {isRenaming ? (
                    <div className="mt-2 flex flex-col gap-2 animate-in slide-in-from-top-1 duration-200">
                      <Input
                        value={renameGroupName}
                        onChange={(event) =>
                          setRenameGroupName(event.target.value)
                        }
                        placeholder="Nhập tên nhóm mới"
                        className="h-9 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-sm"
                        maxLength={100}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRenameGroup()}
                          disabled={renameGroupMutation.isPending}
                          className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-md shadow-blue-500/20"
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsRenaming(false)}
                          className="flex-1 rounded-lg bg-slate-100 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-lg font-extrabold text-slate-900 dark:text-slate-100">
                      {activeConversationDisplayName}
                    </p>
                  )}
                </div>
                {activeChat ? (
                  <div className="rounded-2xl glass-card px-4 py-3.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
                        {activeContact?.isGroup ? "Tên nhóm (Cá nhân)" : "Biệt danh đối phương"}
                      </p>
                      {activePrivateAlias ? (
                        <button
                          type="button"
                          onClick={handleClearConversationAlias}
                          className="text-[10px] font-bold text-rose-600 hover:underline"
                        >
                          XOA
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={aliasInput}
                        onChange={(event) => setAliasInput(event.target.value)}
                        placeholder={
                          activeContact?.isGroup
                            ? "Nhập tên hiển thị cho nhóm..."
                            : "Nhập biệt danh người này..."
                        }
                        className="h-9 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-sm"
                        maxLength={100}
                      />
                      <button
                        type="button"
                        onClick={handleSaveConversationAlias}
                        className="rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        Luu
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {activeContact?.isGroup
                        ? "Tên nhóm này chỉ thay đổi trên thiết bị của bạn."
                        : "Đối phương sẽ nhận được thông báo khi bạn đổi biệt danh."}
                    </p>
                  </div>
                ) : null}
                {activeGroupId ? (
                  <div className="rounded-2xl glass-card px-4 py-3.5 shadow-sm">
                    <p className="text-sm uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
                      Ảnh nhóm
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <Avatar className="h-14 w-14">
                        {activeContactAvatarUrl ? (
                          <AvatarImage
                            src={activeContactAvatarUrl}
                            alt={activeConversationDisplayName}
                          />
                        ) : null}
                        <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold text-lg">
                          {activeConversationDisplayName
                            .charAt(0)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Tải ảnh nhóm để hiển thị ngay trong giao diện chat của
                          cuộc trò chuyện.
                        </p>
                        {canUpdateGroupAvatar ? (
                          <>
                            <input
                              ref={groupAvatarInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) =>
                                void handleGroupAvatarFileChange(event)
                              }
                            />
                            <button
                              type="button"
                              onClick={() =>
                                groupAvatarInputRef.current?.click()
                              }
                              disabled={isUpdatingGroupAvatar}
                              className="mt-2 inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <ImagePlus size={12} />
                              {isUpdatingGroupAvatar
                                ? "Đang tải..."
                                : "Đổi ảnh nhóm"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl glass-card px-4 py-3.5 shadow-sm">
                    <p className="text-sm uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
                      Người dùng
                    </p>
                    <div className="mt-3 flex flex-col items-center text-center">
                      <div className="relative">
                        <Avatar className="h-20 w-20 border-2 border-white dark:border-slate-800 shadow-md">
                          {activeContactAvatarUrl ? (
                            <AvatarImage
                              src={activeContactAvatarUrl}
                              alt="Avatar"
                            />
                          ) : null}
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-2xl">
                            {activeConversationDisplayName
                              .charAt(0)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {activePresence?.isActive && (
                          <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-green-500 dark:border-slate-800"></span>
                        )}
                      </div>
                      <h4 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
                        {activeConversationDisplayName}
                      </h4>
                      <p
                        className={`mt-0.5 text-xs font-medium ${activePresence?.isActive ? "text-green-600" : "text-slate-500"}`}
                      >
                        {activePresence?.isActive
                          ? "Đang hoạt động"
                          : "Ngoại tuyến"}
                      </p>

                    </div>
                  </div>
                )}
                <div className="rounded-2xl glass-card px-4 py-3.5 shadow-sm">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Loại cuộc trò chuyện
                  </p>
                  <p className="mt-2 font-semibold text-slate-800 dark:text-slate-100 text-sm">
                    {activeContact?.isGroup ? "Nhóm" : "Trực tiếp"}
                  </p>
                </div>
                {canViewConversationCode ? (
                  <div className="rounded-2xl glass-card px-4 py-3.5 shadow-sm">
                    <p className="text-sm uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
                      Mã hội thoại
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-600 dark:text-slate-300">
                      {activeContact?.conversationId || "-"}
                    </p>
                  </div>
                ) : null}
                {canManageInviteLinks ? (
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setManageGroupActiveTab("members");
                        setIsManageGroupModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-sm"
                    >
                      <Settings size={18} />
                      Quản lý nhóm nâng cao
                    </button>
                  </div>
                ) : null}
                {/* <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Tin nhắn mới</p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{activeContact?.unreadCount ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Cập nhật gần nhất</p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{activeContact?.updatedAt ? format(new Date(activeContact.updatedAt), "HH:mm dd/MM/yyyy") : "-"}</p>
                </div> */}

                {activeGroupId ? (
                  <div className="space-y-4 rounded-2xl glass-card p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
                        Thành viên nhóm
                      </p>
                      <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        {activeGroupMembers.length}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isLoadingGroupMembers
                        ? "Đang đồng bộ danh sách thành viên..."
                        : activeGroupMembersError
                          ? "Không tải được danh sách thành viên."
                          : isFetchingGroupMembers
                            ? "Đang cập nhật dữ liệu mới..."
                            : "Danh sách thành viên đã đồng bộ."}
                    </p>

                    {activeGroupMembersError ? (
                      <button
                        type="button"
                        onClick={() => void refetchGroupMembers()}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Thử tải lại thành viên
                      </button>
                    ) : null}

                    {canViewGroupMemberList ? (
                      isLoadingGroupMembers ? (
                        <p className="text-xs text-slate-500">
                          Đang tải danh sách thành viên...
                        </p>
                      ) : (
                        <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900 hide-scrollbar">
                          {activeGroupMembers.length === 0 ? (
                            <p className="px-1 py-1 text-xs text-slate-500 dark:text-slate-400">
                              Chưa có thành viên hiển thị.
                            </p>
                          ) : (
                            activeGroupMembers.map((member, index) => (
                              <div
                                key={member.userId}
                                className="flex items-start justify-between rounded-lg border border-slate-200 bg-white/80 px-2.5 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                              >
                                <div className="min-w-0">
                                  {(() => {
                                    const profile =
                                      memberProfilesById[member.userId];
                                    const alias = conversationAliasByUserId.get(
                                      member.userId,
                                    );
                                    const avatarUrl =
                                      profile?.avatarAsset?.resolvedUrl ||
                                      profile?.avatarUrl;
                                    const displayName =
                                      alias ||
                                      profile?.fullName ||
                                      myFriends.find(
                                        (friend) =>
                                          friend.userId === member.userId,
                                      )?.fullName ||
                                      messageSenderNameByUserId.get(
                                        member.userId,
                                      ) ||
                                      `Thành viên ${index + 1}`;

                                    return (
                                      <div className="flex min-w-0 items-start gap-2">
                                        <div className="relative h-8 w-8 shrink-0">
                                          <Avatar className="h-8 w-8 border border-slate-200 dark:border-slate-700">
                                            {avatarUrl ? (
                                              <AvatarImage
                                                src={avatarUrl}
                                                alt={displayName}
                                              />
                                            ) : null}
                                            <AvatarFallback className="bg-blue-50 text-blue-600 text-[10px] font-semibold">
                                              {displayName
                                                .charAt(0)
                                                .toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          {renderGroupRoleKeyBadge(
                                            member.userId,
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="truncate font-bold text-sm">
                                            {displayName}
                                            {member.userId === user?.sub
                                              ? " (Bạn)"
                                              : ""}
                                          </p>
                                          {member.userId === user?.sub &&
                                          activeChat &&
                                          activeContact?.isGroup ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setNicknameModal({
                                                  conversationId: activeChat,
                                                  userId: member.userId,
                                                  fullName:
                                                    profile?.fullName || "Bạn",
                                                  currentAlias: alias,
                                                });
                                                setModalNicknameInput(
                                                  alias || "",
                                                );
                                              }}
                                              className="mt-1 text-[11px] font-semibold text-blue-600 hover:underline"
                                            >
                                              Tự đặt biệt danh cho mình
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                                {member.userId !== user?.sub ? (
                                  <div className="ml-2 flex flex-col items-end gap-1.5">
                                    <div className="relative">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setActiveMemberActionUserId((prev) =>
                                            prev === member.userId
                                              ? null
                                              : member.userId,
                                          );
                                        }}
                                        className="rounded-full p-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                                        title="Tùy chọn thành viên"
                                      >
                                        <MoreHorizontal size={14} />
                                      </button>

                                      {activeMemberActionUserId ===
                                      member.userId ? (
                                        <div
                                          className="absolute right-0 top-7 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                        >
                                          {member.roleInGroup !== "OWNER" ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveMemberActionUserId(
                                                  null,
                                                );
                                                void handleToggleMemberRole(
                                                  member.userId,
                                                  member.roleInGroup,
                                                );
                                              }}
                                              className="flex w-full items-center px-3 py-2 text-left text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800"
                                            >
                                              {member.roleInGroup === "DEPUTY"
                                                ? "Hạ quyền"
                                                : "Nâng quyền"}
                                            </button>
                                          ) : null}
                                          {isCurrentUserOwner &&
                                            member.roleInGroup !== "OWNER" && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setActiveMemberActionUserId(
                                                    null,
                                                  );
                                                  void handleTransferOwnership(
                                                    member.userId,
                                                  );
                                                }}
                                                className="flex w-full items-center px-3 py-2 text-left text-[11px] font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800"
                                              >
                                                Giao quyền nhóm trưởng
                                              </button>
                                            )}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveMemberActionUserId(null);
                                              void handleRemoveGroupMember(
                                                member.userId,
                                              );
                                            }}
                                            className="flex w-full items-center px-3 py-2 text-left text-[11px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-slate-800"
                                          >
                                            Xóa khỏi nhóm
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveMemberActionUserId(null);
                                              setConfirmInput("");
                                              setConfirmDialog({
                                                title: "Cấm thành viên",
                                                description:
                                                  "Bạn có chắc chắn muốn cấm thành viên này khỏi nhóm?",
                                                confirmLabel: "Cấm",
                                                cancelLabel: "Hủy",
                                                intent: "danger",
                                                onConfirm: async () => {
                                                  await banUserMutation.mutateAsync(
                                                    {
                                                      userId: member.userId,
                                                    },
                                                  );
                                                },
                                              });
                                            }}
                                            className="flex w-full items-center px-3 py-2 text-left text-[11px] font-medium text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800"
                                          >
                                            Cấm khỏi nhóm
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              const profile =
                                                memberProfilesById[
                                                  member.userId
                                                ];
                                              const currentAlias =
                                                conversationAliasByUserId.get(
                                                  member.userId,
                                                );
                                              setNicknameModal({
                                                conversationId: activeChat!,
                                                userId: member.userId,
                                                fullName:
                                                  profile?.fullName ||
                                                  "Thành viên",
                                                currentAlias,
                                              });
                                              setModalNicknameInput(
                                                currentAlias || "",
                                              );
                                              setActiveMemberActionUserId(null);
                                            }}
                                            className="flex w-full items-center px-3 py-2 text-left text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                                          >
                                            Đặt biệt danh
                                          </button>

                                          <div className="px-3 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 mt-1">
                                            Sẽ thêm chức năng mới
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>

                                    {friendUserIds.has(member.userId) ? (
                                      <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                                        Bạn bè
                                      </span>
                                    ) : outgoingFriendRequestUserIds.has(
                                        member.userId,
                                      ) ? (
                                      <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                                        Đã gửi lời mời
                                      </span>
                                    ) : incomingFriendRequestUserIds.has(
                                        member.userId,
                                      ) ? (
                                      <span className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                                        Đã nhận lời mời
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleSendFriendRequest(
                                            member.userId,
                                          )
                                        }
                                        disabled={
                                          sendFriendRequestMutation.isPending &&
                                          sendingFriendRequestUserId ===
                                            member.userId
                                        }
                                        className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {sendFriendRequestMutation.isPending &&
                                        sendingFriendRequestUserId ===
                                          member.userId
                                          ? "Đang gửi..."
                                          : "Kết bạn"}
                                      </button>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      )
                    ) : null}

                    {canShowAddMemberSection ? (
                      <form
                        onSubmit={handleAddGroupMember}
                        className="space-y-3 rounded-xl glass-item p-3"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Thêm thành viên
                        </p>
                        <input
                          value={memberLookupInput}
                          onChange={(event) =>
                            setMemberLookupInput(event.target.value)
                          }
                          placeholder="Nhập số điện thoại hoặc email"
                          className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Hệ thống sẽ tra cứu chính xác người dùng theo số điện
                          thoại/email rồi thêm vào nhóm.
                        </p>
                        <select
                          value={memberRoleInput}
                          onChange={(event) =>
                            setMemberRoleInput(
                              event.target.value as GroupMemberRole,
                            )
                          }
                          className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="MEMBER">MEMBER</option>
                          <option value="DEPUTY">DEPUTY</option>
                        </select>
                        <button
                          type="submit"
                          disabled={manageGroupMemberMutation.isPending}
                          className="w-full rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {manageGroupMemberMutation.isPending
                            ? "Đang xử lý..."
                            : "Thêm thành viên"}
                        </button>
                      </form>
                    ) : null}

                    <div className="space-y-3 rounded-xl glass-item p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Mời bạn bè
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsInviteDialogOpen(true)}
                        disabled={!canInviteGroupFriends}
                        className="w-full rounded border border-blue-300 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Mời bạn bè vào nhóm
                      </button>
                      {!canInviteGroupFriends ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Không thể mời thành viên ở cuộc trò chuyện hiện tại.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Chọn nhiều bạn bè và gửi lời mời cùng lúc.
                        </p>
                      )}
                    </div>

                    <div className="space-y-3 rounded-xl glass-item p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Link tham gia nhóm
                        </p>
                        {canManageInviteLinks ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!activeGroupId) return;
                              void createInviteLinkMutation.mutateAsync({
                                groupId: activeGroupId,
                              });
                            }}
                            disabled={createInviteLinkMutation.isPending}
                            className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                          >
                            {createInviteLinkMutation.isPending
                              ? "Đang tạo..."
                              : "Tạo link"}
                          </button>
                        ) : null}
                      </div>

                      {activeGroupInviteLinks.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Chưa có link tham gia nào.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {activeGroupInviteLinks
                            .filter((invite) => !invite.disabledAt)
                            .sort(
                              (a, b) =>
                                new Date(b.createdAt).getTime() -
                                new Date(a.createdAt).getTime(),
                            )
                            .slice(0, 5)
                            .map((invite) => (
                              <div
                                key={invite.inviteId}
                                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 shadow-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="rounded bg-blue-50 px-2 py-1 font-mono text-xs font-bold text-blue-600 dark:bg-blue-900/30">
                                    {invite.code}
                                  </span>
                                  <p className="text-[10px] text-slate-400">
                                    {invite.usedCount} lượt dùng
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopyInviteLink(invite)
                                    }
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-50 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200"
                                  >
                                    <Link2 size={12} />
                                    Sao chép link
                                  </button>
                                  {canManageInviteLinks ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!activeGroupId) return;
                                        void revokeInviteLinkMutation.mutateAsync(
                                          {
                                            groupId: activeGroupId,
                                            inviteId: invite.inviteId,
                                          },
                                        );
                                      }}
                                      disabled={
                                        revokeInviteLinkMutation.isPending
                                      }
                                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                                      title="Vô hiệu hóa"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {memberActionError ? (
                      <p className="text-xs text-red-500">
                        {memberActionError}
                      </p>
                    ) : null}

                    {inviteLinkError ? (
                      <p className="text-xs text-red-500">{inviteLinkError}</p>
                    ) : null}

                    <div className="pt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleClearHistory(activeChat)}
                          disabled={clearHistoryMutation.isPending}
                          className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <Eraser size={14} />
                          Xóa lịch sử
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConversation(activeChat)}
                          disabled={deleteConversationMutation.isPending}
                          className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-100 transition-colors dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
                        >
                          <Trash2 size={14} />
                          Xóa hội thoại
                        </button>
                      </div>

                      {activeContact?.isGroup && (
                        <button
                          type="button"
                          onClick={() => {
                            setLeaveGroupError("");
                            setLeaveSuccessorUserId("");
                            setIsLeaveGroupDialogOpen(true);
                          }}
                          disabled={leaveGroupMutation.isPending}
                          className="w-full rounded-lg bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60 shadow-sm transition-all"
                        >
                          {leaveGroupMutation.isPending
                            ? "Đang rời nhóm..."
                            : "Rời khỏi nhóm"}
                        </button>
                      )}
                    </div>

                    {leaveGroupError ? (
                      <p className="text-xs text-red-500">{leaveGroupError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>

            {/* Nội dung tin nhắn */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 min-h-0 bg-slate-50 dark:bg-slate-950 relative hide-scrollbar"
            >
              {loadingMessages && (
                <div className="text-center py-4 text-sm text-gray-500 dark:text-slate-400">
                  Đang tải tin nhắn...
                </div>
              )}

              <div className="flex flex-col gap-3 pb-4">
                {hasMore ? (
                  <div className="flex justify-center py-1">
                    <button
                      type="button"
                      onClick={() => void handleLoadMoreMessages()}
                      disabled={isLoadingMore}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {isLoadingMore
                        ? "Đang tải thêm..."
                        : "Tải thêm tin nhắn cũ"}
                    </button>
                  </div>
                ) : null}
                {/* Đảo ngược array nếu API trả về tin mới nhất trước (thường thấy nếu limit offset) */}
                {[...filteredMessages]
                  .reverse()
                  .map((msg, index, orderedMessages) => {
                    const isMe = msg.senderId === user?.sub;
                    const previousMessage = orderedMessages[index - 1];
                    const nextMessage = orderedMessages[index + 1];
                    const isGroupMessage = Boolean(activeContact?.isGroup);
                    const messageSentAtMs = new Date(msg.sentAt).getTime();
                    const previousSentAtMs = previousMessage
                      ? new Date(previousMessage.sentAt).getTime()
                      : Number.NaN;
                    const nextSentAtMs = nextMessage
                      ? new Date(nextMessage.sentAt).getTime()
                      : Number.NaN;
                    const startsSenderBlock =
                      !previousMessage ||
                      previousMessage.senderId !== msg.senderId ||
                      Number.isNaN(previousSentAtMs) ||
                      Number.isNaN(messageSentAtMs) ||
                      messageSentAtMs - previousSentAtMs > MESSAGE_BLOCK_GAP_MS;
                    const endsSenderBlock =
                      !nextMessage ||
                      nextMessage.senderId !== msg.senderId ||
                      Number.isNaN(nextSentAtMs) ||
                      Number.isNaN(messageSentAtMs) ||
                      nextSentAtMs - messageSentAtMs > MESSAGE_BLOCK_GAP_MS;
                    const shouldShowSenderMeta =
                      msg.type !== "SYSTEM" &&
                      isGroupMessage &&
                      startsSenderBlock;
                    const senderProfile = msg.senderId
                      ? memberProfilesById[msg.senderId]
                      : undefined;
                    const messageSenderAvatarUrl =
                      msg.senderAvatarAsset?.resolvedUrl || msg.senderAvatarUrl;
                    const senderAvatarUrl =
                      senderProfile?.avatarAsset?.resolvedUrl ||
                      senderProfile?.avatarUrl ||
                      messageSenderAvatarUrl ||
                      (isMe ? callerAvatarUrl : undefined) ||
                      (msg.senderId
                        ? friendAvatarByUserId[msg.senderId]
                        : undefined) ||
                      (!activeContact?.isGroup && !isMe
                        ? activeContactAvatarUrl
                        : undefined);
                    const senderDisplayName =
                      (msg.senderId
                        ? displayNameByUserId.get(msg.senderId)
                        : undefined) ||
                      msg.senderName ||
                      "Thành viên";
                    const shouldShowMessageAvatar = msg.type !== "SYSTEM";
                    const isEditing = editingMessageId === msg.id;
                    const canEditMessage =
                      msg.type === "TEXT" ||
                      msg.type === "EMOJI" ||
                      msg.type === "SYSTEM";
                    const canRecallEveryone = isMe;
                    const replyPreview = msg.replyMessage;
                    const replySenderDisplayName = replyPreview?.senderId
                      ? displayNameByUserId.get(replyPreview.senderId) ||
                        replyPreview.senderName
                      : replyPreview?.senderName;
                    const isForwardedMessage = Boolean(
                      msg.forwardedFromMessageId,
                    );
                    const forwardedLabel = isMe
                      ? "Bạn đã chuyển tiếp"
                      : `${senderDisplayName} đã chuyển tiếp`;
                    const messageText = extractMessageText(
                      msg.content,
                      msg.type,
                    ).trim();
                    const firstUrl = extractFirstUrl(messageText);
                    const linkPreview = firstUrl
                      ? buildLinkPreview(firstUrl)
                      : null;
                    const messageReactions =
                      activeMessageReactions[msg.id] || [];
                    const reactionSummary = Array.from(
                      messageReactions.reduce((acc, emoji) => {
                        acc.set(emoji, (acc.get(emoji) || 0) + 1);
                        return acc;
                      }, new Map<string, number>()),
                    );
                    const isCallMessage =
                      msg.type === "SYSTEM" &&
                      /cuộc gọi|call/i.test(messageText);
                    const isVideoCallByMessage = /video/i.test(messageText);
                    const callSummary = isCallMessage
                      ? resolveCallSummary(msg, isVideoCallByMessage)
                      : null;
                    const isSystemNotificationMessage =
                      msg.type === "SYSTEM" && !isCallMessage;

                    if (isCallMessage) {
                      if (activeContact?.isGroup) {
                        const isVideoCall =
                          callSummary?.isVideo ?? isVideoCallByMessage;

                        return (
                          <div
                            key={msg.id}
                            className="flex w-full justify-center py-3 flex-col items-center animate-in fade-in zoom-in duration-300"
                          >
                            <div className="flex flex-col items-center gap-2 rounded-xl bg-slate-100/80 border border-slate-200 px-5 py-3 shadow-sm dark:bg-slate-800/80 dark:border-slate-700">
                              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-slate-900 shadow-sm">
                                  {isVideoCall ? (
                                    <Video
                                      size={14}
                                      className="text-blue-500"
                                    />
                                  ) : (
                                    <Phone
                                      size={14}
                                      className="text-blue-500"
                                    />
                                  )}
                                </div>
                                <p className="text-sm font-medium">
                                  Cuộc gọi nhóm kết thúc (
                                  {formatCallDuration(
                                    callSummary?.durationSeconds ?? 0,
                                  )}
                                  )
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                              {format(new Date(msg.sentAt), "HH:mm")}
                            </span>
                          </div>
                        );
                      }

                      const summaryIsOutgoing = callSummary
                        ? callSummary.direction === "outgoing"
                        : isMe;
                      const summaryAlignClass = summaryIsOutgoing
                        ? "self-end"
                        : "self-start";
                      const summaryBubbleClass = summaryIsOutgoing
                        ? "border-blue-500/30 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
                      const summaryIconClass = summaryIsOutgoing
                        ? "bg-white/10 text-white"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200";
                      const summaryMetaClass = summaryIsOutgoing
                        ? "text-white/80"
                        : "text-slate-500 dark:text-slate-400";
                      const isVideoCall =
                        callSummary?.isVideo ?? isVideoCallByMessage;
                      const callDirectionLabel = summaryIsOutgoing
                        ? "đi"
                        : "đến";
                      const titleText = `Cuộc gọi ${isVideoCall ? "video" : "thoại"} ${callDirectionLabel}`;
                      const durationText = formatCallDuration(
                        callSummary?.durationSeconds ?? 0,
                      );

                      return (
                        <div
                          key={msg.id}
                          className={`group relative flex max-w-[70%] ${summaryAlignClass} flex-col py-1 animate-in fade-in zoom-in duration-300`}
                        >
                          <div
                            className={`w-full rounded-2xl border px-4 py-3 shadow-sm ${summaryBubbleClass}`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${summaryIconClass}`}
                              >
                                {isVideoCall ? (
                                  <Video size={18} />
                                ) : (
                                  <Phone size={18} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">
                                  {titleText}
                                </p>
                                <p
                                  className={`mt-0.5 text-xs ${summaryMetaClass}`}
                                >
                                  {durationText}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (isSystemNotificationMessage) {
                      return (
                        <div
                          key={msg.id}
                          className="flex w-full justify-center py-2 animate-in fade-in duration-300"
                        >
                          <div className="rounded-full bg-slate-100 px-4 py-2 dark:bg-slate-800">
                            <p className="text-center text-sm text-slate-600 dark:text-slate-300">
                              {renderMessageTextWithMentions(
                                msg.content,
                                false,
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        ref={(element) => {
                          messageItemRefs.current[msg.id] = element;
                        }}
                        className={`group relative flex max-w-[70%] ${isMe ? "self-end" : "self-start"} flex-col rounded-2xl transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 ${focusedMessageId === msg.id ? "ring-2 ring-amber-300/80 ring-offset-2 ring-offset-slate-100 dark:ring-amber-400/70 dark:ring-offset-slate-950" : ""}`}
                      >
                        {!isEditing ? (
                          <div
                            className={`absolute ${isMe ? "-left-24" : "-right-24"} bottom-6 z-20 flex items-center gap-1 rounded-full bg-slate-900/60 px-1 py-1 shadow-sm backdrop-blur-sm transition-opacity ${
                              activeMessageMenuId === msg.id
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            <button
                              type="button"
                              className="rounded-full p-1.5 text-white/85 transition hover:bg-white/20 hover:text-white"
                              title="Trả lời"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStartReplyMessage(msg);
                              }}
                            >
                              <Quote size={14} />
                            </button>
                            <button
                              type="button"
                              className="rounded-full p-1.5 text-white/85 transition hover:bg-white/20 hover:text-white"
                              title="Chuyển tiếp"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenForwardDialog(msg.id);
                              }}
                            >
                              <Share2 size={14} />
                            </button>

                            <div className="relative">
                              <button
                                type="button"
                                className="rounded-full p-1.5 text-white/85 transition hover:bg-white/20 hover:text-white"
                                title="Bày tỏ cảm xúc"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setReactionPickerMessageId((prev) =>
                                    prev === msg.id ? null : msg.id,
                                  );
                                }}
                              >
                                <SmilePlus size={14} />
                              </button>

                              {reactionPickerMessageId === msg.id ? (
                                <div
                                  className={`absolute ${isMe ? "right-0" : "left-0"} -top-12 z-30 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900`}
                                >
                                  {QUICK_REACTION_EMOJIS.map((emoji) => (
                                    <button
                                      key={`${msg.id}-${emoji}`}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleToggleMessageReaction(
                                          msg.id,
                                          emoji,
                                        );
                                        setReactionPickerMessageId(null);
                                      }}
                                      className="rounded-full px-1.5 py-0.5 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="relative">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setMessageMenuPlacement("up");
                                  setActiveMessageMenuId((prev) =>
                                    prev === msg.id ? null : msg.id,
                                  );
                                }}
                                className="rounded-full p-1.5 text-white/90 transition hover:bg-white/20 hover:text-white"
                                title="Tùy chọn tin nhắn"
                              >
                                <MoreHorizontal size={14} />
                              </button>

                              {activeMessageMenuId === msg.id ? (
                                <div
                                  className={`absolute ${isMe ? "right-0" : "left-0"} ${messageMenuPlacement === "down" ? "top-9" : "bottom-9"} z-30 w-52 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-lg`}
                                >
                                  {isMe && canEditMessage ? (
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100"
                                      onClick={() =>
                                        handleStartEditMessage(
                                          msg.id,
                                          msg.content,
                                        )
                                      }
                                    >
                                      <Pencil size={14} />
                                      Sửa tin nhắn
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100"
                                    onClick={() =>
                                      handleOpenForwardDialog(msg.id)
                                    }
                                  >
                                    <Share2 size={14} />
                                    Chuyển tiếp
                                  </button>
                                  {canRecallEveryone ? (
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                      onClick={() =>
                                        void handleDeleteMessage(
                                          msg.id,
                                          "EVERYONE",
                                        )
                                      }
                                    >
                                      <Trash2 size={14} />
                                      Thu hồi với mọi người
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 border-t border-slate-100 dark:border-slate-800"
                                    onClick={() => handleTogglePin(msg)}
                                  >
                                    {(() => {
                                      try {
                                        const p = JSON.parse(msg.content);
                                        return p.isPinned ? (
                                          <>
                                            <PinOff
                                              size={14}
                                              className="text-orange-500"
                                            />
                                            Bỏ ghim tin nhắn
                                          </>
                                        ) : (
                                          <>
                                            <Pin
                                              size={14}
                                              className="text-blue-500"
                                            />
                                            Ghim tin nhắn
                                          </>
                                        );
                                      } catch {
                                        return (
                                          <>
                                            <Pin
                                              size={14}
                                              className="text-blue-500"
                                            />
                                            Ghim tin nhắn
                                          </>
                                        );
                                      }
                                    })()}
                                  </button>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                    onClick={() =>
                                      void handleDeleteMessage(msg.id, "SELF")
                                    }
                                  >
                                    <Trash2 size={14} />
                                    Ẩn với tôi
                                  </button>
                                  <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                                    Sẽ thêm tính năng khác sau
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {shouldShowSenderMeta ? (
                          <p
                            className={`mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 ${isMe ? "text-right pr-10" : "ml-10"}`}
                          >
                            {senderDisplayName}
                          </p>
                        ) : null}

                        <div
                          className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}
                        >
                        {shouldShowMessageAvatar && !isMe ? (
                          <div className="relative h-8 w-8 shrink-0">
                            <Avatar className="h-8 w-8 border border-slate-200 dark:border-slate-700">
                              {senderAvatarUrl ? (
                                <AvatarImage
                                  src={senderAvatarUrl}
                                  alt={senderDisplayName}
                                />
                              ) : null}
                              <AvatarFallback className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 text-xs font-semibold">
                                {(senderDisplayName || "?")
                                  .charAt(0)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {renderGroupRoleKeyBadge(msg.senderId)}
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
                              {isForwardedMessage ? (
                                <div
                                  className={`mb-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${isMe ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
                                >
                                  {forwardedLabel}
                                </div>
                              ) : null}
                              {replyPreview ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleFocusMessageById(replyPreview.id)
                                  }
                                  className={`mb-2 w-full rounded-lg border-l-2 px-3 py-2 text-left text-xs transition ${isMe ? "border-white/50 bg-white/10 text-white/90 hover:bg-white/15" : "border-blue-500 bg-blue-50 text-slate-600 hover:bg-blue-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}
                                >
                                  <p className="font-medium">
                                    Trả lời {replySenderDisplayName}
                                  </p>
                                  <p className="mt-0.5 line-clamp-2 break-words opacity-90">
                                    {getReplyPreviewText(replyPreview)}
                                  </p>
                                </button>
                              ) : null}
                              {isEditing ? (
                                <div className="space-y-2">
                                  <Input
                                    value={editingText}
                                    onChange={(event) =>
                                      setEditingText(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        handleCancelEditMessage();
                                        return;
                                      }

                                      if (
                                        event.key === "Enter" &&
                                        !event.shiftKey
                                      ) {
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
                                      onClick={() =>
                                        void handleSaveEditMessage(msg.id)
                                      }
                                      disabled={isUpdatingMessage}
                                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      {isUpdatingMessage
                                        ? "Đang lưu..."
                                        : "Lưu"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelEditMessage}
                                      className="rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                                    >
                                      Hủy
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="break-words">
                                  {(() => {
                                    try {
                                      const parsed = parsePollMessage(
                                        msg.content,
                                      );
                                      if (parsed.pollData?.poll) {
                                        const poll = parsed.pollData.poll;
                                        const totalVotes = poll.options.reduce(
                                          (sum, opt) =>
                                            sum + (opt.votes?.length || 0),
                                          0,
                                        );
                                        return (
                                          <div
                                            className={`mt-1 p-3 rounded-xl border ${isMe ? "bg-white/10 border-white/20" : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700"} w-full min-w-[240px] max-w-[320px]`}
                                          >
                                            <div className="flex items-center gap-2 mb-3">
                                              <div
                                                className={`p-1.5 rounded-lg ${isMe ? "bg-white/20" : "bg-blue-100 dark:bg-blue-900/30"}`}
                                              >
                                                <BarChart3
                                                  size={14}
                                                  className={
                                                    isMe
                                                      ? "text-white"
                                                      : "text-blue-600"
                                                  }
                                                />
                                              </div>
                                              <h3
                                                className={`text-sm font-bold ${isMe ? "text-white" : "text-slate-800 dark:text-slate-100"}`}
                                              >
                                                {poll.question}
                                              </h3>
                                            </div>
                                            <div className="space-y-1.5">
                                              {poll.options.map((option) => {
                                                const votes =
                                                  option.votes || [];
                                                const voterId = user?.sub;
                                                const percentage =
                                                  totalVotes > 0
                                                    ? Math.round(
                                                        (votes.length /
                                                          totalVotes) *
                                                          100,
                                                      )
                                                    : 0;
                                                const hasVoted = voterId
                                                  ? votes.includes(voterId)
                                                  : false;

                                                return (
                                                  <button
                                                    key={`opt-${msg.id}-${option.id}`}
                                                    onClick={() =>
                                                      handleVote(msg, option.id)
                                                    }
                                                    className="w-full text-left group relative"
                                                  >
                                                    <div
                                                      className={`relative z-10 flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                                                        hasVoted
                                                          ? isMe
                                                            ? "bg-white/30 border-white"
                                                            : "bg-blue-50 border-blue-400 dark:bg-blue-900/40 dark:border-blue-500"
                                                          : isMe
                                                            ? "border-white/10 hover:bg-white/5"
                                                            : "border-slate-200 dark:border-slate-700 hover:border-blue-300"
                                                      }`}
                                                    >
                                                      <span
                                                        className={`text-xs font-medium truncate pr-4 ${
                                                          isMe
                                                            ? "text-white"
                                                            : hasVoted
                                                              ? "text-blue-700 dark:text-blue-300"
                                                              : "text-slate-600 dark:text-slate-300"
                                                        }`}
                                                      >
                                                        {option.text}
                                                      </span>
                                                      <span
                                                        className={`text-[10px] font-bold ${isMe ? "text-white/80" : "text-slate-400"}`}
                                                      >
                                                        {votes.length}
                                                      </span>

                                                      <div
                                                        className={`absolute left-0 top-0 bottom-0 opacity-15 transition-all duration-700 ease-out rounded-lg ${isMe ? "bg-white" : "bg-blue-500"}`}
                                                        style={{
                                                          width: `${percentage}%`,
                                                        }}
                                                      />
                                                    </div>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[10px] opacity-60 font-medium uppercase tracking-wider">
                                              <span>
                                                {totalVotes} lượt bình chọn
                                              </span>
                                              <span>
                                                {poll.isMultipleChoice
                                                  ? "Được chọn nhiều"
                                                  : "Chọn 1"}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return renderMessageTextWithMentions(
                                        parsed.text || msg.content,
                                        isMe,
                                      );
                                    } catch {
                                      return renderMessageTextWithMentions(
                                        msg.content,
                                        isMe,
                                      );
                                    }
                                  })()}
                                </div>
                              )}
                            </div>
                            {msg.attachmentUrl ? (
                              isImageUrl(msg.attachmentUrl, msg.type) ? (
                                <a
                                  href={msg.attachmentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 block"
                                >
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
                                <div
                                  className={`mt-2 flex w-full max-w-[320px] items-center gap-3 rounded-xl border p-3 transition-all ${
                                    isMe
                                      ? "border-white/20 bg-white/10 text-white"
                                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm"
                                  }`}
                                >
                                  <div
                                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                                      isMe
                                        ? "bg-white/20"
                                        : "bg-slate-100 dark:bg-slate-800"
                                    }`}
                                  >
                                    {getFileIcon(
                                      (() => {
                                        const original =
                                          msg.attachmentAsset?.originalFileName;
                                        if (
                                          original &&
                                          !/^[0-9A-Z]{20,}$/.test(
                                            original.split(".")[0],
                                          )
                                        ) {
                                          return original;
                                        }
                                        const urlPart =
                                          msg.attachmentUrl
                                            .split("/")
                                            .pop()
                                            ?.split("?")[0] || "";
                                        return urlPart;
                                      })(),
                                      28,
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold leading-tight break-all">
                                      {truncateFileName(
                                        cleanFileName(
                                          (() => {
                                            const original =
                                              msg.attachmentAsset
                                                ?.originalFileName;
                                            if (
                                              original &&
                                              !/^[0-9A-Z]{20,}$/.test(
                                                original.split(".")[0],
                                              )
                                            ) {
                                              return original;
                                            }
                                            const urlPart =
                                              msg.attachmentUrl
                                                .split("/")
                                                .pop()
                                                ?.split("?")[0] || "";
                                            if (
                                              urlPart &&
                                              !/^[0-9A-Z]{20,}$/.test(
                                                urlPart.split(".")[0],
                                              )
                                            ) {
                                              return urlPart;
                                            }
                                            const ext =
                                              urlPart.split(".").pop() || "bin";
                                            return `Tệp đính kèm.${ext}`;
                                          })(),
                                        ),
                                      )}
                                    </p>
                                    <div className="mt-1 flex items-center gap-2">
                                      <p className={`text-[11px] opacity-70`}>
                                        {formatFileSize(
                                          msg.attachmentAsset?.size,
                                        )}
                                      </p>
                                      <span className="h-1 w-1 rounded-full bg-current opacity-30" />
                                      <p className="text-[11px] opacity-70">
                                        Đã nhận
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex gap-1">
                                    <a
                                      href={msg.attachmentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`p-2 rounded-lg transition-colors ${
                                        isMe
                                          ? "hover:bg-white/20"
                                          : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                      }`}
                                      title="Tải về"
                                      download
                                    >
                                      <Download size={18} />
                                    </a>
                                  </div>
                                </div>
                              )
                            ) : null}
                            {linkPreview ? (
                              <a
                                href={linkPreview.href}
                                target="_blank"
                                rel="noreferrer"
                                className={`mt-2 block rounded-xl border px-3 py-2 text-left transition ${
                                  isMe
                                    ? "border-white/25 bg-white/10 hover:bg-white/15"
                                    : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <img
                                    src={linkPreview.faviconUrl}
                                    alt="favicon"
                                    className="mt-0.5 h-4 w-4 rounded-sm"
                                  />
                                  <div className="min-w-0">
                                    <p
                                      className={`truncate text-xs font-semibold ${isMe ? "text-white" : "text-slate-800 dark:text-slate-100"}`}
                                    >
                                      {linkPreview.host}
                                    </p>
                                    <p
                                      className={`truncate text-[11px] ${isMe ? "text-white/85" : "text-slate-500 dark:text-slate-400"}`}
                                    >
                                      {linkPreview.path}
                                    </p>
                                  </div>
                                </div>
                              </a>
                            ) : null}
                          </div>
                        {shouldShowMessageAvatar && isMe ? (
                          <div className="relative h-8 w-8 shrink-0">
                            <Avatar className="h-8 w-8 border border-blue-200 dark:border-blue-800">
                              {senderAvatarUrl ? (
                                <AvatarImage
                                  src={senderAvatarUrl}
                                  alt={senderDisplayName}
                                />
                              ) : null}
                              <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100 text-xs font-semibold">
                                {(senderDisplayName || "B")
                                  .charAt(0)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {renderGroupRoleKeyBadge(msg.senderId)}
                          </div>
                        ) : null}
                        </div>
                        {reactionSummary.length > 0 ? (
                          <div
                            className={`mt-1 flex flex-wrap gap-1 ${isMe ? "justify-end pr-10" : "justify-start"} ${!isMe && shouldShowMessageAvatar ? "pl-10" : ""}`}
                          >
                            {reactionSummary.map(([emoji, count]) => (
                              <button
                                key={`${msg.id}-reaction-${emoji}`}
                                type="button"
                                onClick={() =>
                                  handleToggleMessageReaction(msg.id, emoji)
                                }
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                title="Bỏ cảm xúc"
                              >
                                <span>{emoji}</span>
                                <span>{count}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {endsSenderBlock ? (
                          <span
                            className={`text-[10px] text-gray-400 dark:text-slate-500 mt-1 ${isMe ? "text-right pr-10" : "text-left"} ${!isMe && shouldShowMessageAvatar ? "pl-10" : ""}`}
                          >
                            {format(new Date(msg.sentAt), "HH:mm")}
                          </span>
                        ) : null}
                        {messageActionError &&
                        (editingMessageId === msg.id ||
                          activeMessageMenuId === msg.id) ? (
                          <span className="mt-1 text-[11px] text-red-500">
                            {messageActionError}
                          </span>
                        ) : null}
                        {isDeletingMessage && activeMessageMenuId === msg.id ? (
                          <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            Đang xóa...
                          </span>
                        ) : null}
                      </div>
                    );
                  })}

                {activeContact?.isGroup &&
                activeChat &&
                (rtc.activeGroupCalls.has(activeChat) ||
                  (rtc.callState !== "IDLE" &&
                    rtc.activeConfig?.conversationId === activeChat)) ? (
                  <div className="flex w-full justify-center py-3">
                    <div className="flex flex-col items-center gap-2 rounded-xl bg-blue-50/80 border border-blue-200 px-5 py-3 shadow-sm dark:bg-blue-900/20 dark:border-blue-800 animate-in fade-in zoom-in duration-300">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-blue-950 shadow-sm relative">
                          {rtc.activeConfig?.conversationId === activeChat &&
                          rtc.activeConfig.isVideo ? (
                            <Video size={14} className="text-blue-500" />
                          ) : (
                            <Phone size={14} className="text-blue-500" />
                          )}
                          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                          </span>
                        </div>
                        <p className="text-sm font-medium">
                          Cuộc gọi nhóm đang diễn ra
                        </p>
                      </div>
                      {rtc.callState !== "CONNECTED" && (
                        <div className="mt-1 flex w-full gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartCall(false, true)}
                            className="flex-1 rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow hover:bg-slate-300 transition dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                          >
                            Tham gia thoại
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartCall(true, true)}
                            className="flex-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700 transition"
                          >
                            Tham gia video
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {isForwardDialogOpen ? (
              <div
                className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4"
                onClick={handleCloseForwardDialog}
              >
                <div
                  className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Chuyển tiếp tin nhắn
                    </h3>
                    <button
                      type="button"
                      onClick={handleCloseForwardDialog}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      disabled={isForwardingMessage}
                    >
                      Đóng
                    </button>
                  </div>

                  <div className="space-y-3 p-4">
                    <Input
                      value={forwardSearch}
                      onChange={(event) => setForwardSearch(event.target.value)}
                      placeholder="Tìm cuộc trò chuyện đích..."
                      className="bg-slate-50 dark:bg-slate-800 dark:border-slate-700"
                    />

                    <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 hide-scrollbar">
                      {forwardDestinationConversations.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 dark:text-slate-400">
                          Không có cuộc trò chuyện phù hợp.
                        </div>
                      ) : (
                        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                          {forwardDestinationConversations.map(
                            (conversation) => {
                              const checked =
                                selectedForwardConversationIds.includes(
                                  conversation.conversationId,
                                );
                              return (
                                <li key={conversation.conversationId}>
                                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        handleToggleForwardTarget(
                                          conversation.conversationId,
                                        )
                                      }
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                        {conversation.groupName ||
                                          "Không rõ tên"}
                                      </p>
                                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                        {conversation.conversationId}
                                      </p>
                                    </div>
                                  </label>
                                </li>
                              );
                            },
                          )}
                        </ul>
                      )}
                    </div>

                    {forwardActionError ? (
                      <p className="text-xs text-red-500">
                        {forwardActionError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-700 px-4 py-3">
                    <button
                      type="button"
                      onClick={handleCloseForwardDialog}
                      className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300"
                      disabled={isForwardingMessage}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmForwardMessage()}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                      disabled={isForwardingMessage}
                    >
                      {isForwardingMessage
                        ? "Đang chuyển tiếp..."
                        : "Chuyển tiếp"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {isInviteDialogOpen ? (
              <div
                className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4"
                onClick={() => {
                  if (!manageGroupMemberMutation.isPending) {
                    setIsInviteDialogOpen(false);
                  }
                }}
              >
                <div
                  className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Mời bạn bè vào nhóm
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsInviteDialogOpen(false)}
                      disabled={manageGroupMemberMutation.isPending}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Đóng
                    </button>
                  </div>

                  <div className="space-y-3 p-4">
                    <Input
                      value={inviteSearchText}
                      onChange={(event) =>
                        setInviteSearchText(event.target.value)
                      }
                      placeholder="Tìm bạn bè theo tên hoặc userId"
                      className="bg-slate-50 dark:bg-slate-800 dark:border-slate-700"
                    />

                    <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 hide-scrollbar">
                      {inviteCandidateFriends.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 dark:text-slate-400">
                          Không còn bạn bè phù hợp để mời.
                        </div>
                      ) : (
                        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                          {inviteCandidateFriends.map((friend) => {
                            const checked = selectedInviteUserIds.includes(
                              friend.userId,
                            );
                            return (
                              <li key={friend.userId}>
                                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleInviteSelection(friend.userId)
                                    }
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                      {friend.fullName || "Không rõ tên"}
                                    </p>
                                    {canViewSensitiveUserIds ? (
                                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                        {friend.userId}
                                      </p>
                                    ) : null}
                                  </div>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Đã chọn {selectedInviteUserIds.length} bạn bè
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setIsInviteDialogOpen(false)}
                      disabled={manageGroupMemberMutation.isPending}
                      className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-60"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmInviteMembers()}
                      disabled={manageGroupMemberMutation.isPending}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {manageGroupMemberMutation.isPending
                        ? "Đang mời..."
                        : "Gửi lời mời"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {isLeaveGroupDialogOpen ? (
              <div
                className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4"
                onClick={() => {
                  if (!leaveGroupMutation.isPending) {
                    setIsLeaveGroupDialogOpen(false);
                  }
                }}
              >
                <div
                  className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Xác nhận rời nhóm
                    </h3>
                  </div>
                  <div className="space-y-2 px-4 py-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Bạn sẽ không còn nhận tin nhắn mới từ nhóm này. Bạn có
                      chắc muốn tiếp tục?
                    </p>
                    {isCurrentUserOwner ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          Bạn là chủ nhóm, cần chọn người kế nhiệm trước khi rời
                          nhóm.
                        </p>
                        <Input
                          value={successorSearchText}
                          onChange={(e) =>
                            setSuccessorSearchText(e.target.value)
                          }
                          placeholder="Tìm thành viên kế nhiệm..."
                          className="h-9 mb-2 text-xs bg-white dark:bg-slate-800"
                        />
                        <select
                          value={leaveSuccessorUserId}
                          onChange={(event) => {
                            setLeaveSuccessorUserId(event.target.value);
                            setLeaveGroupError("");
                          }}
                          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="">Chọn thành viên kế nhiệm</option>
                          {activeGroupMembers
                            .filter(
                              (member) =>
                                member.userId !== user?.sub &&
                                !member.deletedAt,
                            )
                            .map((member, index) => {
                              const profile = memberProfilesById[member.userId];
                              const displayName =
                                profile?.fullName ||
                                myFriends.find(
                                  (friend) => friend.userId === member.userId,
                                )?.fullName ||
                                messageSenderNameByUserId.get(member.userId) ||
                                `Thành viên ${index + 1}`;

                              return { member, displayName };
                            })
                            .filter(({ displayName }) =>
                              displayName
                                .toLowerCase()
                                .includes(successorSearchText.toLowerCase()),
                            )
                            .map(({ member, displayName }) => (
                              <option
                                key={`successor-${member.userId}`}
                                value={member.userId}
                              >
                                {displayName}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : null}
                    {leaveGroupError ? (
                      <p className="text-xs text-red-500">{leaveGroupError}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setIsLeaveGroupDialogOpen(false)}
                      disabled={leaveGroupMutation.isPending}
                      className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-60"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleLeaveGroupFromChat()}
                      disabled={leaveGroupMutation.isPending}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {leaveGroupMutation.isPending
                        ? "Đang rời nhóm..."
                        : "Xác nhận rời nhóm"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Vùng nhập liệu */}
            <form
              onSubmit={handleSend}
              className="p-2 sm:p-4 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 shrink-0 z-10 relative space-y-2"
            >
              {replyingMessage ? (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
                      Đang trả lời
                    </p>
                    <p className="mt-1 font-medium">
                      {replyingMessage.senderName}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {getReplyPreviewText(replyingMessage)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelReplyMessage}
                    className="rounded-md p-1 text-slate-500 hover:bg-blue-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    aria-label="Huỷ trả lời"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : null}
              {typingIndicatorText ? (
                <p className="px-1 text-xs text-slate-500 dark:text-slate-400 italic">
                  {typingIndicatorText}
                </p>
              ) : null}
              {queuedAttachments.length > 0 ? (
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1 hide-scrollbar">
                  {queuedAttachments.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                            {item.file.name}
                          </p>
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
                            item.status === "failed"
                              ? "bg-red-500"
                              : "bg-blue-500"
                          }`}
                          style={{
                            width: `${item.status === "failed" ? 100 : item.progress}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Thanh công cụ tiện ích */}
              <div className="flex items-center gap-1 pb-1 animate-in slide-in-from-bottom-1 duration-300">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                  title="Gửi file"
                >
                  <Paperclip size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPollModalOpen(true)}
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                  title="Tạo bình chọn"
                >
                  <BarChart3 size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsGifPickerOpen((prev) => !prev)}
                  className={`p-2 rounded-lg transition-all ${isGifPickerOpen ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400" : "text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/30"}`}
                  title="Gửi GIF"
                >
                  <Gift size={18} />
                </button>
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
                <button
                  type="button"
                  onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                  className={`p-2 rounded-lg transition-all ${isEmojiPickerOpen ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400" : "text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/30"}`}
                  title="Emoji"
                >
                  <Smile size={18} />
                </button>
              </div>

              <div className="flex gap-2 items-end">
                <div className="relative flex-1 min-w-0">
                  {isEmojiPickerOpen && (
                    <div
                      className="absolute bottom-full mb-2 left-0 z-50 animate-in fade-in zoom-in-95 duration-200"
                      ref={emojiPickerRef}
                    >
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <EmojiPicker
                          onEmojiClick={handleEmojiSelect}
                          theme={
                            document.documentElement.classList.contains("dark")
                              ? Theme.DARK
                              : Theme.LIGHT
                          }
                          width={320}
                          height={400}
                        />
                      </div>
                    </div>
                  )}

                  {isGifPickerOpen && (
                    <div className="absolute bottom-full mb-2 left-0 z-50 w-80 animate-in fade-in zoom-in-95 duration-200">
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 flex flex-col max-h-[450px]">
                        <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Chọn GIF
                          </h4>
                          <button
                            onClick={() => setIsGifPickerOpen(false)}
                            className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <div className="p-3">
                          <div className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-2 border border-transparent focus-within:border-blue-500 transition-all">
                            <Search size={14} className="text-slate-400" />
                            <input
                              value={gifSearch}
                              onChange={handleGifSearchChange}
                              placeholder="Tìm GIF..."
                              className="flex-1 h-9 bg-transparent border-none focus:ring-0 text-sm dark:text-slate-200"
                            />
                            {gifSearch ? (
                              <button
                                type="button"
                                onClick={clearGifSearch}
                                className="p-1 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                              >
                                <X size={14} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {hasGifError ? (
                          <p className="text-xs text-red-500 mb-2">
                            {gifError}
                          </p>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2 h-64 overflow-y-auto pr-1 hide-scrollbar">
                          {!hasGifResults && !gifLoading ? (
                            <div className="col-span-2 text-center text-xs text-slate-500">
                              Khong co GIF phu hop
                            </div>
                          ) : null}
                          {gifResults.map((gif) => (
                            <button
                              key={gif.id}
                              onClick={() => {
                                void handleSendGif(gif.url);
                              }}
                              className="rounded-lg overflow-hidden hover:ring-2 ring-blue-500 transition-all h-28 bg-slate-100 dark:bg-slate-800"
                            >
                              <img
                                src={gif.previewUrl}
                                alt="gif"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                          {gifLoading ? (
                            <div className="col-span-2 text-center text-xs text-slate-500">
                              Dang tai GIF...
                            </div>
                          ) : null}
                        </div>
                        {gifNext ? (
                          <div className="p-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={handleLoadMoreGifs}
                              disabled={gifLoading}
                              className="w-full rounded-xl bg-blue-50 py-2 text-xs font-bold text-blue-600 hover:bg-blue-100 disabled:opacity-60 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 transition-all"
                            >
                              {gifLoading ? "Đang tải..." : "Tải thêm GIF"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => enqueueAttachments(e.target.files)}
                  />
                  <Input
                    type="text"
                    placeholder={
                      activeGroupId ? "Nhập tin nhắn..." : "Nhập tin nhắn..."
                    }
                    className="w-full bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400 focus-visible:ring-blue-500 h-10 sm:h-11"
                    ref={composerInputRef}
                    value={inputText}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      handleComposerInputChange(
                        nextValue,
                        e.target.selectionStart,
                      );

                      if (!activeChat) {
                        return;
                      }

                      if (!nextValue.trim()) {
                        stopTyping();
                        return;
                      }

                      if (!isTypingRef.current) {
                        isTypingRef.current = true;
                        void sendTyping(true);
                      }

                      scheduleTypingStop();
                    }}
                    onClick={(event) =>
                      syncMentionContext(
                        inputText,
                        event.currentTarget.selectionStart,
                      )
                    }
                    onKeyUp={(event) =>
                      syncMentionContext(
                        inputText,
                        event.currentTarget.selectionStart,
                      )
                    }
                    onKeyDown={handleComposerKeyDown}
                    disabled={isUploading}
                    onPaste={handleComposerPaste}
                  />
                  {isMentionMenuOpen ? (
                    <div className="absolute bottom-12 left-0 right-0 z-40 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 hide-scrollbar">
                      {mentionCandidates.map((candidate) => (
                        <button
                          key={candidate.userId}
                          type="button"
                          onClick={() => handleInsertMention(candidate)}
                          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <span className="truncate font-medium">
                            {candidate.displayName}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={
                    isUploading ||
                    (!inputText.trim() && queuedAttachments.length === 0)
                  }
                  className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 transition-colors"
                  title="Gửi"
                >
                  {isUploading ? (
                    <span className="text-xs">...</span>
                  ) : (
                    <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
                  )}
                </button>
              </div>
            </form>

            {pendingRemoveMemberUserId ? (
              <div
                className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4"
                onClick={() => {
                  if (!manageGroupMemberMutation.isPending) {
                    setPendingRemoveMemberUserId(null);
                  }
                }}
              >
                <div
                  className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Xác nhận xóa thành viên
                    </h3>
                    <button
                      type="button"
                      onClick={() => setPendingRemoveMemberUserId(null)}
                      disabled={manageGroupMemberMutation.isPending}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Đóng
                    </button>
                  </div>

                  <div className="space-y-2 p-4 text-sm text-slate-700 dark:text-slate-300">
                    <p>Bạn có chắc muốn xóa thành viên này khỏi nhóm?</p>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {pendingRemoveMemberDisplayName}
                    </p>
                    {canViewSensitiveUserIds ? (
                      <p className="break-all text-xs text-slate-500 dark:text-slate-400">
                        {pendingRemoveMemberUserId}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setPendingRemoveMemberUserId(null)}
                      disabled={manageGroupMemberMutation.isPending}
                      className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-60"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmRemoveGroupMember()}
                      disabled={manageGroupMemberMutation.isPending}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {manageGroupMemberMutation.isPending
                        ? "Đang xóa..."
                        : "Xác nhận xóa"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {isManageGroupModalOpen && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="flex h-full max-h-[600px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Settings className="text-blue-600" size={20} />
                        Quản lý nhóm: {activeContact?.groupName}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Nâng cấp & Bảo mật nhóm
                      </p>
                    </div>
                    <button
                      onClick={() => setIsManageGroupModalOpen(false)}
                      className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Tabs Sidebar + Content */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Tabs Sidebar */}
                    <div className="w-40 border-r border-slate-100 bg-slate-50/50 p-2 dark:border-slate-800 dark:bg-slate-900/50">
                      {MANAGE_GROUP_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setManageGroupActiveTab(tab.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${
                            manageGroupActiveTab === tab.id
                              ? "bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none"
                              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          }`}
                        >
                          <tab.icon size={16} />
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-900 hide-scrollbar">
                      {manageGroupActiveTab === "members" && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                            Danh sách thành viên
                          </h4>
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {activeGroupMembers.map((member) => (
                              <div
                                key={member.userId}
                                className="flex items-center justify-between py-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="relative h-8 w-8 shrink-0">
                                    <Avatar className="h-8 w-8 border border-slate-100 dark:border-slate-700">
                                      {groupMemberAvatarByUserId.get(
                                        member.userId,
                                      ) ? (
                                        <AvatarImage
                                          src={groupMemberAvatarByUserId.get(
                                            member.userId,
                                          )}
                                          alt={
                                            displayNameByUserId.get(
                                              member.userId,
                                            ) || "Thành viên"
                                          }
                                        />
                                      ) : null}
                                      <AvatarFallback className="bg-blue-50 text-blue-600 text-[10px] font-semibold">
                                        {displayNameByUserId
                                          .get(member.userId)
                                          ?.charAt(0)
                                          .toUpperCase() || "U"}
                                      </AvatarFallback>
                                    </Avatar>
                                    {renderGroupRoleKeyBadge(member.userId)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                      {displayNameByUserId.get(member.userId)}
                                      {member.userId === user?.sub
                                        ? " (Bạn)"
                                        : ""}
                                    </p>
                                  </div>
                                </div>
                                {member.userId !== user?.sub &&
                                  isCurrentUserOwner && (
                                    <button
                                      onClick={() => {
                                        setConfirmInput("");
                                        setConfirmDialog({
                                          title: "Cấm thành viên",
                                          description:
                                            "Bạn có chắc chắn muốn cấm thành viên này khỏi nhóm?",
                                          confirmLabel: "Cấm",
                                          cancelLabel: "Hủy",
                                          intent: "danger",
                                          onConfirm: async () => {
                                            await banUserMutation.mutateAsync({
                                              userId: member.userId,
                                            });
                                          },
                                        });
                                      }}
                                      className="text-[10px] font-bold text-red-600 hover:underline"
                                    >
                                      CẤM
                                    </button>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {manageGroupActiveTab === "bans" && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                            Người dùng đã bị cấm
                          </h4>
                          {groupBans.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 opacity-40">
                              <Shield size={48} className="mb-2" />
                              <p className="text-sm">
                                Chưa có ai bị cấm khỏi nhóm
                              </p>
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                              {groupBans.map((ban) => {
                                const profile = bannedProfilesById[ban.userId];
                                const displayName =
                                  profile?.fullName ||
                                  displayNameByUserId.get(ban.userId) ||
                                  ban.userId;
                                const avatarUrl =
                                  profile?.avatarUrl ||
                                  profile?.avatarAsset?.resolvedUrl;

                                return (
                                  <div
                                    key={ban.userId}
                                    className="flex items-center justify-between py-3 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/30 rounded-lg transition-colors"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <Avatar className="h-10 w-10 border border-slate-100 dark:border-slate-700">
                                        <AvatarImage
                                          src={avatarUrl}
                                          alt={displayName}
                                        />
                                        <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold text-xs">
                                          {displayName.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                                          {displayName}
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-0.5 italic truncate">
                                          Lý do: {ban.reason || "Không có"}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() =>
                                        unbanUserMutation.mutate({
                                          userId: ban.userId,
                                        })
                                      }
                                      className="flex-shrink-0 ml-4 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100 dark:bg-blue-950/30 transition-colors"
                                    >
                                      BỎ CẤM
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {manageGroupActiveTab === "links" && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                              Mã mời tham gia
                            </h4>
                            <button
                              onClick={() =>
                                createInviteLinkMutation.mutate({
                                  groupId: activeGroupId!,
                                })
                              }
                              disabled={createInviteLinkMutation.isPending}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100"
                            >
                              <Plus size={14} />
                              TẠO MỚI
                            </button>
                          </div>
                          {activeGroupInviteLinks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 opacity-40">
                              <Link2 size={48} className="mb-2" />
                              <p className="text-sm text-center">
                                Chưa có mã mời nào được tạo cho nhóm này
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {activeGroupInviteLinks
                                .filter((link) => !link.disabledAt)
                                .map((link) => (
                                  <div
                                    key={link.inviteId}
                                    className="p-4 rounded-xl border border-slate-100 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-800 flex items-center justify-between shadow-sm"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="rounded-lg bg-blue-100 dark:bg-blue-900/40 p-2.5">
                                        <Link2
                                          className="text-blue-600 dark:text-blue-400"
                                          size={20}
                                        />
                                      </div>
                                      <div>
                                        <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                          {link.code}
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider font-semibold">
                                          Đã dùng {link.usedCount} lượt
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => {
                                          const url = `${window.location.origin}/groups/invite/${link.code}`;
                                          navigator.clipboard.writeText(url);
                                          toast.success("Đã sao chép link mời");
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-all"
                                      >
                                        <Copy size={14} />
                                        SAO CHÉP LINK
                                      </button>
                                      <button
                                        onClick={() =>
                                          revokeInviteLinkMutation.mutate({
                                            groupId: activeGroupId!,
                                            inviteId: link.inviteId,
                                          })
                                        }
                                        disabled={
                                          revokeInviteLinkMutation.isPending
                                        }
                                        className="p-2 rounded-lg hover:bg-red-50 text-red-500 disabled:opacity-50 transition-colors"
                                        title="Vô hiệu hóa"
                                      >
                                        {revokeInviteLinkMutation.isPending ? (
                                          <span className="animate-spin text-[10px]">
                                            ...
                                          </span>
                                        ) : (
                                          <Trash2 size={18} />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      {manageGroupActiveTab === "audit" && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                            Nhật ký hoạt động
                          </h4>
                          {auditLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 opacity-40 text-center">
                              <History size={48} className="mb-2" />
                              <p className="text-sm">
                                Chưa có nhật ký hoạt động nào được ghi lại
                              </p>
                            </div>
                          ) : (
                            <div className="relative space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-slate-100 dark:before:bg-slate-800">
                              {auditLogs.map((log) => (
                                <div key={log.id} className="relative pl-8">
                                  <div className="absolute left-0 top-1.5 h-5 w-5 rounded-full border-4 border-white bg-blue-600 shadow-sm dark:border-slate-900" />
                                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                    {log.summary}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      {format(
                                        new Date(log.occurredAt),
                                        "HH:mm dd/MM/yyyy",
                                      )}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold uppercase tracking-tighter">
                                      {log.action}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {manageGroupActiveTab === "settings" && (
                        <div className="space-y-6">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                            Cài đặt nguy hiểm
                          </h4>
                          <div className="p-4 rounded-xl border border-red-100 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50">
                            <div className="flex items-start gap-3">
                              <AlertTriangle
                                className="text-red-600 shrink-0 mt-0.5"
                                size={20}
                              />
                              <div>
                                <h5 className="text-sm font-bold text-red-900 dark:text-red-200">
                                  Giải tán nhóm
                                </h5>
                                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                                  Hành động này sẽ xóa toàn bộ tin nhắn, thành
                                  viên và dữ liệu của nhóm này vĩnh viễn. Không
                                  thể hoàn tác.
                                </p>
                                <button
                                  onClick={() => {
                                    setConfirmInput("");
                                    setConfirmDialog({
                                      title: "Giải tán nhóm",
                                      description:
                                        "Hành động này sẽ xóa toàn bộ tin nhắn, thành viên và dữ liệu của nhóm này vĩnh viễn. Không thể hoàn tác.",
                                      confirmLabel: "Giải tán",
                                      cancelLabel: "Hủy",
                                      intent: "danger",
                                      requireInput: {
                                        label: "Nhập 'GIẢI TÁN' để xác nhận",
                                        placeholder: "GIẢI TÁN",
                                        expectedValue: "GIẢI TÁN",
                                        helperText:
                                          "Chỉ chấp nhận đúng cụm từ trên.",
                                      },
                                      onConfirm: async () => {
                                        await dissolveGroupMutation.mutateAsync();
                                      },
                                    });
                                  }}
                                  className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm shadow-red-200 transition-all"
                                >
                                  GIẢI TÁN NHÓM NGAY
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Modal tạo bình chọn */}
            {isPollModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 animate-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <BarChart3 size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                        Tạo bình chọn mới
                      </h3>
                    </div>
                    <button
                      onClick={() => setIsPollModalOpen(false)}
                      className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                        Câu hỏi
                      </label>
                      <Input
                        placeholder="Bạn muốn hỏi gì?"
                        value={pollQuestion}
                        onChange={(e) => setPollQuestion(e.target.value)}
                        className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                        Các lựa chọn
                      </label>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1 hide-scrollbar">
                        {pollOptions.map((opt, i) => (
                          <div key={i} className="flex gap-2">
                            <Input
                              placeholder={`Lựa chọn ${i + 1}`}
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...pollOptions];
                                newOpts[i] = e.target.value;
                                setPollOptions(newOpts);
                              }}
                              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                            />
                            {pollOptions.length > 2 && (
                              <button
                                onClick={() =>
                                  setPollOptions((prev) =>
                                    prev.filter((_, idx) => idx !== i),
                                  )
                                }
                                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setPollOptions((prev) => [...prev, ""])}
                        className="mt-3 flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Plus size={14} /> Thêm lựa chọn
                      </button>
                    </div>
                  </div>

                  <div className="mt-8 flex gap-3">
                    <button
                      onClick={() => setIsPollModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleCreatePoll}
                      className="flex-1 py-2.5 rounded-xl bg-blue-600 font-bold text-sm text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all"
                    >
                      Tạo bình chọn
                    </button>
                  </div>
                </div>
              </div>
            )}
            {confirmDialog ? (
              <div
                className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4"
                onClick={closeConfirmDialog}
              >
                <div
                  className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {confirmDialog.title}
                    </h3>
                  </div>
                  <div className="space-y-2 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    {confirmDialog.description ? (
                      <p>{confirmDialog.description}</p>
                    ) : null}
                    {confirmDialog.requireInput ? (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {confirmDialog.requireInput.label}
                        </label>
                        <Input
                          value={confirmInput}
                          onChange={(event) =>
                            setConfirmInput(event.target.value)
                          }
                          placeholder={
                            confirmDialog.requireInput.placeholder || ""
                          }
                          className="h-9 bg-white dark:bg-slate-800"
                        />
                        {confirmDialog.requireInput.helperText ? (
                          <p className="text-[11px] text-slate-400">
                            {confirmDialog.requireInput.helperText}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={closeConfirmDialog}
                      disabled={isConfirming}
                      className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-60"
                    >
                      {confirmDialog.cancelLabel || "Hủy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmDialogAction()}
                      disabled={
                        isConfirming ||
                        (confirmDialog.requireInput &&
                          confirmInput.trim() !==
                            confirmDialog.requireInput.expectedValue)
                      }
                      className={`rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${confirmDialog.intent === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
                    >
                      {isConfirming
                        ? "Đang xử lý..."
                        : confirmDialog.confirmLabel || "Xác nhận"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {nicknameModal && (
              <div
                className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                onClick={() => setNicknameModal(null)}
              >
                <div
                  className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
                    Đặt biệt danh
                  </h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Biệt danh cho <strong>{nicknameModal.fullName}</strong>. Chỉ
                    mình bạn nhìn thấy biệt danh này.
                  </p>
                  <Input
                    autoFocus
                    placeholder="Nhập biệt danh..."
                    value={modalNicknameInput}
                    onChange={(e) => setModalNicknameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = modalNicknameInput.trim();
                        void manageAliasMutation.mutateAsync({
                          conversationId: nicknameModal.conversationId,
                          userId: nicknameModal.userId,
                          alias: val || null,
                        });
                      }
                    }}
                    className="mb-6"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => setNicknameModal(null)}
                      className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => {
                        const val = modalNicknameInput.trim();
                        void manageAliasMutation.mutateAsync({
                          conversationId: nicknameModal.conversationId,
                          userId: nicknameModal.userId,
                          alias: val || null,
                        });
                      }}
                      disabled={manageAliasMutation.isPending}
                      className="flex-1 py-2 rounded-xl bg-blue-600 font-bold text-sm text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25 disabled:opacity-50"
                    >
                      {manageAliasMutation.isPending ? "Đang lưu..." : "Lưu"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {successModal && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <div className="animate-in zoom-in fade-in duration-300 bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Smile className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {successModal.title}
                  </h3>
                  <p className="text-sm text-slate-500 text-center max-w-[200px]">
                    {successModal.message}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
