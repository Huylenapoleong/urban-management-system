import { useState, useRef, useEffect, useMemo } from "react";
import { Search, Phone, Video, Info, UserRound, Send, Paperclip, X, FileText, MoreHorizontal, Pencil, Trash2, Quote, Share2, ImagePlus, Smile, SmilePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useWebRTC } from "@/hooks/shared/useWebRTC";
import { CallModal } from "@/components/CallModal";
import { useAuth } from "@/providers/AuthProvider";
import { useConversations, useMessages } from "@/hooks/shared/useChatData";
import { format } from "date-fns";
import { useLocation } from "react-router-dom";
import { uploadMedia } from "@/services/upload.api";
import { getUserById, searchUserExactByContact, getUserPresence, type PresenceState } from "@/services/user.api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { leaveGroup, listGroupMembers, manageGroupMember } from "@/services/group.api";
import { listMyFriendRequests, listMyFriends, sendFriendRequest } from "@/services/friends.api";
import { toast } from "react-hot-toast";
import EmojiPicker, { Theme, type EmojiClickData } from "emoji-picker-react";
import type { MessageItem, MessageReplyReference, UserProfile } from "@urban/shared-types";
import type { GroupMemberRole } from "@urban/shared-constants";
import type { CallEndedSummary } from "@/hooks/shared/useWebRTC";

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

type RecallScope = "SELF" | "EVERYONE";

const CALL_SUMMARY_STORAGE_KEY = "urban:web-app:call-summaries:v2";

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

    return parsed.filter((item): item is CallEndedSummary => Boolean(item && item.conversationId && item.endedAt));
  } catch {
    return [];
  }
}

function saveCallSummaries(summaries: CallEndedSummary[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CALL_SUMMARY_STORAGE_KEY, JSON.stringify(summaries));
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

function resolveConversationAvatarUrl(conversation?: ConversationAvatarLike | null): string | undefined {
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
    conversation.peerUserId ||
    conversation.userId ||
    conversation.targetUserId;
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

function formatLastSeenShort(presence?: PresenceState | null, fallbackLastSeenAt?: string | null): string | null {
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

  const diffMinutes = Math.max(1, Math.floor((Date.now() - lastSeenMs) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function formatPresenceText(presence: PresenceState | null, fallbackLastSeenAt?: string | null): string {
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
const MESSAGE_REACTIONS_STORAGE_KEY = "web-app-message-reactions";
const PRESENCE_POLL_INTERVAL_MS = 60_000;
const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

function extractGroupIdFromConversationId(conversationId?: string | null): string | undefined {
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
  const [messageMenuPlacement, setMessageMenuPlacement] = useState<"up" | "down">("down");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [replyingMessage, setReplyingMessage] = useState<MessageReplyReference | null>(null);
  const [messageActionError, setMessageActionError] = useState("");
  const [isForwardDialogOpen, setIsForwardDialogOpen] = useState(false);
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(null);
  const [selectedForwardConversationIds, setSelectedForwardConversationIds] = useState<string[]>([]);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardActionError, setForwardActionError] = useState("");
  const [memberLookupInput, setMemberLookupInput] = useState("");
  const [memberRoleInput, setMemberRoleInput] = useState<GroupMemberRole>("MEMBER");
  const [memberActionError, setMemberActionError] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<MentionCandidate[]>([]);
  const [leaveGroupError, setLeaveGroupError] = useState("");
  const [isLeaveGroupDialogOpen, setIsLeaveGroupDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteSearchText, setInviteSearchText] = useState("");
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<string[]>([]);
  const [sendingFriendRequestUserId, setSendingFriendRequestUserId] = useState<string | null>(null);
  const [pendingRemoveMemberUserId, setPendingRemoveMemberUserId] = useState<string | null>(null);
  const [isUpdatingGroupAvatar, setIsUpdatingGroupAvatar] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [messageReactionsByConversation, setMessageReactionsByConversation] = useState<
    Record<string, Record<string, string[]>>
  >(() => {
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
  const [groupAvatarOverrides, setGroupAvatarOverrides] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    try {
      const raw = window.localStorage.getItem(GROUP_AVATAR_OVERRIDES_STORAGE_KEY);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);
  const requestedDmAvatarIdsRef = useRef<Set<string>>(new Set());
  const [friendAvatarByUserId, setFriendAvatarByUserId] = useState<Record<string, string>>({});
  const [dmAvatarMap, setDmAvatarMap] = useState<Record<string, string>>({});
  const [activeDmPresence, setActiveDmPresence] = useState<PresenceState | null>(null);
  const [dmPresenceByUserId, setDmPresenceByUserId] = useState<Record<string, PresenceState>>({});
  const [callSummaries, setCallSummaries] = useState<CallEndedSummary[]>(() => loadCallSummaries());
  const rtc = useWebRTC();
  const {
    startCall,
    lastEndedCall,
  } = rtc;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Data fetching
  const { data: conversations = [], isLoading: loadingConversations } = useConversations(conversationSearch);
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
  } = useMessages(activeChat || undefined);

  const syntheticConversation =
    chatState.conversationId && chatState.displayName
      ? {
          conversationId: chatState.conversationId,
          groupName: chatState.displayName,
          avatarUrl: chatState.avatarUrl,
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

    const uniqueNames = Array.from(new Set(
      activeTypingParticipants
        .map((participant) => participant.fullName?.trim())
        .filter((name): name is string => Boolean(name)),
    ));

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
  const forwardDestinationConversations = mergedConversations.filter((conversation) => {
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
  });
  const cachedProfile = queryClient.getQueryData<UserProfile>(["profile"]);
  const activeContactAvatarFromConversation = resolveConversationAvatarUrl(activeContact as ConversationAvatarLike | undefined);
  const activeContactAvatarFromFriendMap = resolveDmAvatarFromFriendMap(
    activeContact as ConversationAvatarLike | undefined,
    friendAvatarByUserId,
    user?.sub,
  );
  const activeContactAvatarFromDmMap = activeChat ? dmAvatarMap[activeChat] : undefined;
  const activeContactBaseAvatarUrl =
    (activeContact as { avatarAsset?: { resolvedUrl?: string }; avatarUrl?: string } | undefined)?.avatarAsset?.resolvedUrl ||
    (activeContact as { avatarAsset?: { resolvedUrl?: string }; avatarUrl?: string } | undefined)?.avatarUrl;
  const activeContactAvatarUrl =
    (activeGroupId ? groupAvatarOverrides[activeGroupId] : undefined) ||
    activeContactAvatarFromConversation ||
    activeContactAvatarFromFriendMap ||
    activeContactAvatarFromDmMap ||
    activeContactBaseAvatarUrl ||
    chatState.avatarUrl;
  const activeDmUserId = extractDirectPeerUserId(activeContact as ConversationAvatarLike | undefined, user?.sub);
  const activePresence = activeDmUserId ? dmPresenceByUserId[activeDmUserId] || activeDmPresence : null;
  const activeStatusText = (() => {
    if (!activeContact) {
      return "";
    }

    if (activeContact.isGroup) {
      return "Nhóm trò chuyện";
    }

    return formatPresenceText(activePresence, activeContact?.updatedAt);
  })();
  const activeStatusToneClass = activePresence?.isActive ? "text-green-600" : "text-gray-500 dark:text-slate-400";
  const activeLastSeenBadge = formatLastSeenShort(activePresence, activeContact?.updatedAt);
  const callerDisplayName = cachedProfile?.fullName || user?.sub || "Người gọi";
  const callerAvatarUrl = cachedProfile?.avatarAsset?.resolvedUrl || cachedProfile?.avatarUrl;
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const loadingOlderMessagesRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
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
  const currentUserMembership = activeGroupMembers.find((membership) => membership.userId === user?.sub);
  const { data: memberProfilesById = {} } = useQuery({
    queryKey: ["group-members", "profiles", activeGroupId, activeGroupMembers.map((item) => item.userId).join("|")],
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

      return Object.fromEntries(entries) as Record<string, UserProfile | undefined>;
    },
    enabled: Boolean(activeGroupId) && activeGroupMembers.length > 0,
    staleTime: 60 * 1000,
  });
  const { data: myFriends = [] } = useQuery({
    queryKey: ["friends", "list", "for-group-member-picker"],
    queryFn: () => listMyFriends({ limit: 200 }),
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
  const friendUserIds = useMemo(
    () => new Set(myFriends.map((friend) => friend.userId)),
    [myFriends],
  );
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
        profile?.fullName ||
        myFriends.find((friend) => friend.userId === member.userId)?.fullName ||
        messageSenderNameByUserId.get(member.userId);

      if (displayName) {
        map.set(member.userId, displayName);
      }
    });

    if (user?.sub) {
      map.set(user.sub, cachedProfile?.fullName || "Bạn");
    }

    return map;
  }, [
    activeGroupMembers,
    cachedProfile?.fullName,
    memberProfilesById,
    messageSenderNameByUserId,
    myFriends,
    user?.sub,
  ]);
  const outgoingFriendRequestUserIds = useMemo(
    () => new Set(outgoingFriendRequests.map((friendRequest) => friendRequest.userId)),
    [outgoingFriendRequests],
  );
  const incomingFriendRequestUserIds = useMemo(
    () => new Set(incomingFriendRequests.map((friendRequest) => friendRequest.userId)),
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
          `${candidate.displayName}`
            .toLowerCase()
            .includes(keyword),
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
  const isMentionMenuOpen = mentionStartIndex !== null && mentionCandidates.length > 0;
  const canManageGroupMembers =
    currentUserMembership?.roleInGroup === "OWNER" ||
    currentUserMembership?.roleInGroup === "OFFICER";
  const canShowAddMemberSection =
    user?.role !== "CITIZEN" &&
    (canManageGroupMembers || user?.role === "ADMIN");
  const canViewGroupMemberList = Boolean(user?.sub);
  const canViewConversationCode = user?.role === "ADMIN";
  const canInviteGroupFriends = Boolean(activeGroupId && user?.sub);
  const canUpdateGroupAvatar = Boolean(activeGroupId && (canManageGroupMembers || user?.role === "ADMIN"));

  const manageGroupMemberMutation = useMutation({
    mutationFn: ({ groupId, userId, action, roleInGroup }: { groupId: string; userId: string; action: "add" | "update" | "remove"; roleInGroup?: GroupMemberRole }) =>
      manageGroupMember(groupId, userId, {
        action,
        roleInGroup,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["group-members", variables.groupId] });
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
    },
    onError: (error: any) => {
      setMemberActionError(error?.message || "Không thể cập nhật thành viên nhóm.");
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
    onError: (error: any) => {
      const message = error?.message || "Không thể gửi lời mời kết bạn.";
      setMemberActionError(message);
      toast.error(message);
    },
    onSettled: () => {
      setSendingFriendRequestUserId(null);
    },
  });
  const leaveGroupMutation = useMutation({
    mutationFn: (groupId: string) => leaveGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["group-members"] });
      setLeaveGroupError("");
      setIsInfoOpen(false);
      setIsLeaveGroupDialogOpen(false);
      setActiveChat(null);
      toast.success("Đã rời nhóm");
    },
    onError: (error: any) => {
      setLeaveGroupError(error?.message || "Không thể rời nhóm lúc này.");
    },
  });

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

      const hasDuplicate = next.some((item) => [
        item.conversationId,
        item.endedAt,
        item.peerUserId || "",
        item.direction,
        String(item.durationSeconds),
      ].join("|") === nextKey);

      if (!hasDuplicate) {
        next.push(lastEndedCall);
      }

      saveCallSummaries(next);
      return next;
    });
  }, [lastEndedCall]);

  useEffect(() => {
    let cancelled = false;

    const hydrateFriendAvatars = async () => {
      try {
        const friends = await listMyFriends({ limit: 200 });
        if (cancelled || !Array.isArray(friends) || friends.length === 0) {
          return;
        }

        const nextMap: Record<string, string> = {};
        friends.forEach((friend) => {
          const avatarUrl = friend.avatarAsset?.resolvedUrl || friend.avatarUrl;
          if (avatarUrl) {
            nextMap[friend.userId] = avatarUrl;
          }
        });

        if (!cancelled) {
          setFriendAvatarByUserId(nextMap);
        }
      } catch {
        // Keep silent; other avatar sources still apply.
      }
    };

    void hydrateFriendAvatars();

    return () => {
      cancelled = true;
    };
  }, []);

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
      .filter((item): item is { conversationId: string; peerUserId: string } => Boolean(item));

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
          const avatarUrl = profile.avatarAsset?.resolvedUrl || profile.avatarUrl;
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

  useEffect(() => {
    let cancelled = false;

    const dmUserIds = Array.from(
      new Set(
        mergedConversations
          .filter((conversation) => !conversation.isGroup)
          .map((conversation) => extractDirectPeerUserId(conversation as ConversationAvatarLike, user?.sub))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (dmUserIds.length === 0) {
      return;
    }

    const loadDmPresence = async () => {
      const results = await Promise.all(
        dmUserIds.map(async (userId) => {
          try {
            const presence = await getUserPresence(userId);
            return [userId, presence] as const;
          } catch {
            return null;
          }
        }),
      );

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
  }, [mergedConversations, user?.sub]);

  useEffect(() => {
    let cancelled = false;

    if (!activeDmUserId) {
      setActiveDmPresence(null);
      return;
    }

    const loadPresence = async () => {
      try {
        const presence = await getUserPresence(activeDmUserId);
        if (!cancelled) {
          setActiveDmPresence(presence);
          setDmPresenceByUserId((prev) => ({
            ...prev,
            [activeDmUserId]: presence,
          }));
        }
      } catch {
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
  }, [activeDmUserId]);

  // Auto scroll to bottom for new messages, preserve position while loading older pages.
  useEffect(() => {
    const container = messagesContainerRef.current;

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
      messagesEndRef.current?.scrollIntoView({ behavior: isFirstLoad ? "auto" : "smooth" });
    }

    previousMessageCountRef.current = messages.length;
  }, [messages]);

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
    setIsLeaveGroupDialogOpen(false);
    setIsInviteDialogOpen(false);
    setInviteSearchText("");
    setSelectedInviteUserIds([]);
    setPendingRemoveMemberUserId(null);
    previousMessageCountRef.current = 0;
    loadingOlderMessagesRef.current = false;
    previousScrollHeightRef.current = 0;
  }, [activeChat]);

  const toggleInviteSelection = (userId: string) => {
    setSelectedInviteUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
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

    const successCount = results.filter((result) => result.status === "fulfilled").length;
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
      setMemberActionError("Định dạng không hợp lệ. Hãy nhập đúng số điện thoại hoặc email.");
      return;
    }

    let resolvedUser: UserProfile;
    try {
      resolvedUser = await searchUserExactByContact(lookupValue);
    } catch (error: any) {
      setMemberActionError(error?.message || "Không tìm thấy người dùng theo số điện thoại/email.");
      return;
    }

    if (resolvedUser.id === user?.sub) {
      setMemberActionError("Bạn đã là thành viên của nhóm này.");
      return;
    }

    if (memberIdsInCurrentGroup.has(resolvedUser.id)) {
      setMemberActionError("Người dùng này đã có trong nhóm.");
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

    const nextRole: GroupMemberRole = currentRole === "OFFICER" ? "MEMBER" : "OFFICER";

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

    await leaveGroupMutation.mutateAsync(activeGroupId);
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

  const syncMentionContext = (nextValue: string, cursorPosition: number | null) => {
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

  const handleComposerInputChange = (nextValue: string, cursorPosition: number | null) => {
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

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
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

  const handleStartCall = (isVideo: boolean) => {
    if (!activeContact) return;
    
    startCall({
      isVideo,
      // Target User ID temporarily set to conversationId for group-based room joining
      targetUserId: activeContact.conversationId,
      callerId: user?.sub,
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

  const replaceMentionIdsWithNames = (text: string, mentionPayload: unknown): string => {
    if (!text || !Array.isArray(mentionPayload) || mentionPayload.length === 0) {
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
  };

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

  const renderMessageTextWithMentions = (content: string, isMe: boolean) => {
    let parsedMentionPayload: unknown;
    let textValue = content;

    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        textValue = typeof (parsed as { text?: unknown }).text === "string"
          ? (parsed as { text: string }).text
          : content;
        parsedMentionPayload = (parsed as { mention?: unknown }).mention;
      }
    } catch {
      textValue = content;
    }

    const normalizedText = replaceMentionIdsWithNames(textValue, parsedMentionPayload);
    const mentionTokens = extractMentionDisplayNames(parsedMentionPayload)
      .map((name) => `@${name}`)
      .sort((left, right) => right.length - left.length);

    if (mentionTokens.length === 0) {
      return normalizedText;
    }

    const mentionPattern = new RegExp(
      `(${mentionTokens.map((token) => escapeRegExp(token)).join("|")})`,
      "g",
    );
    const parts = normalizedText.split(mentionPattern).filter(Boolean);
    const mentionTokenSet = new Set(mentionTokens);

    return parts.map((part, index) => {
      if (!mentionTokenSet.has(part)) {
        return <span key={`plain-${index}`}>{part}</span>;
      }

      return (
        <span
          key={`mention-${index}`}
          className={isMe ? "font-bold text-blue-100" : "font-bold text-blue-600 dark:text-blue-400"}
        >
          {part}
        </span>
      );
    });
  };

  const extractMessageText = (content: string): string => {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const text = typeof (parsed as { text?: unknown }).text === "string"
          ? (parsed as { text: string }).text
          : content;
        return replaceMentionIdsWithNames(text, (parsed as { mention?: unknown }).mention);
      }

      return content;
    } catch {
      return content;
    }
  };

  const formatCallDuration = (totalSeconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;

    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const resolveCallSummary = (
    msg: MessageItem,
    expectedDirection: CallEndedSummary["direction"],
    expectedIsVideo: boolean,
  ): CallEndedSummary | null => {
    const candidates = callSummaries.filter((item) => item.conversationId === msg.conversationId);
    if (candidates.length === 0) {
      return null;
    }

    const byDirectionAndType = candidates.filter(
      (item) => item.direction === expectedDirection && item.isVideo === expectedIsVideo,
    );
    const byDirection = candidates.filter((item) => item.direction === expectedDirection);
    const scopedCandidates = byDirectionAndType.length > 0
      ? byDirectionAndType
      : (byDirection.length > 0 ? byDirection : candidates);

    const messageTime = new Date(msg.sentAt).getTime();
    const nearest = scopedCandidates
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

    const text = extractMessageText(message.content).trim();
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

  const normalizeQuotedMessage = (message: MessageItem): MessageReplyReference => ({
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
    } catch (err: any) {
      setMessageActionError(err?.message || "Không thể sửa tin nhắn");
    }
  };

  const handleDeleteMessage = async (messageId: string, scope: RecallScope = "SELF") => {
    const shouldDelete = window.confirm(
      scope === "EVERYONE"
        ? "Thu hồi tin nhắn này với mọi người?"
        : "Xoá tin nhắn này chỉ với bạn?",
    );
    if (!shouldDelete) {
      return;
    }

    try {
      await deleteMessageAsync({ messageId, scope });
      setActiveMessageMenuId(null);
      setMessageActionError("");
    } catch (err: any) {
      setMessageActionError(err?.message || "Không thể xử lý xoá tin nhắn");
    }
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

  const clearTypingTimer = () => {
    if (typingStopTimerRef.current !== null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  };

  const stopTyping = () => {
    clearTypingTimer();

    if (!isTypingRef.current) {
      return;
    }

    isTypingRef.current = false;
    void sendTyping(false);
  };

  const scheduleTypingStop = () => {
    clearTypingTimer();

    typingStopTimerRef.current = window.setTimeout(() => {
      typingStopTimerRef.current = null;
      if (!isTypingRef.current) {
        return;
      }

      isTypingRef.current = false;
      void sendTyping(false);
    }, 1200);
  };

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
    } catch (err: any) {
      setForwardActionError(err?.message || "Không thể chuyển tiếp tin nhắn.");
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

  const handleGroupAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    } catch (error: any) {
      toast.error(error?.message || "Không thể cập nhật ảnh nhóm lúc này.");
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
    return () => {
      stopTyping();
    };
  }, [activeChat, sendTyping]);

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
      let pendingMentions = [...new Set(
        selectedMentions
          .filter((mention) => inputText.includes(`@${mention.displayName}`))
          .map((mention) => mention.userId),
      )];
      let sentAny = false;
      const replyTo = replyingMessage?.id;
      setIsUploading(true);
      closeMentionMenu();

      if (queuedAttachments.length === 0) {
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
        setSelectedMentions([]);
        setReplyingMessage(null);
        stopTyping();
        focusComposer();
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
      <div
        className={`${activeChat ? "hidden md:flex" : "flex"} w-full md:w-[340px] md:flex-shrink-0 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-col h-full overflow-hidden`}
      >
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
        
        <div className="flex-1 overflow-y-auto min-h-0 hide-scrollbar">
          {loadingConversations && <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">Đang tải cuộc trò chuyện...</div>}
           {!loadingConversations && renderedConversations.length === 0 && (
             <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">
              {conversationSearch.trim() ? "Không tìm thấy hội thoại phù hợp" : "Chưa có hội thoại nào"}
             </div>
          )}
          {renderedConversations.map((chat) => (
            (() => {
              const effectiveUnreadCount = chat.conversationId === activeChat ? 0 : (chat.unreadCount ?? 0);
              const chatDmUserId = chat.isGroup
                ? undefined
                : extractDirectPeerUserId(chat as ConversationAvatarLike, user?.sub);
              const chatPresence = chatDmUserId ? dmPresenceByUserId[chatDmUserId] : undefined;
              const chatLastSeenBadge = formatLastSeenShort(chatPresence, chat.updatedAt);
              const chatGroupId = extractGroupIdFromConversationId(chat.conversationId);
              const chatAvatarFromConversation = resolveConversationAvatarUrl(chat as ConversationAvatarLike);
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
                (chat as { avatarAsset?: { resolvedUrl?: string }; avatarUrl?: string }).avatarAsset?.resolvedUrl ||
                (chat as { avatarAsset?: { resolvedUrl?: string }; avatarUrl?: string }).avatarUrl;
              return (
            <div 
              key={chat.conversationId} 
              onClick={() => setActiveChat(chat.conversationId)}
              className={`flex items-center gap-3 p-3 mx-2 my-1 rounded-lg cursor-pointer transition-colors ${
                activeChat === chat.conversationId ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-gray-50 dark:hover:bg-slate-800"
              }`}
            >
              <div className="relative">
                <Avatar className="h-12 w-12 border border-gray-100 dark:border-slate-700">
                  {chatAvatarUrl ? <AvatarImage src={chatAvatarUrl} alt={chat.groupName || "Avatar"} /> : null}
                  <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                    {chat.groupName ? chat.groupName.charAt(0).toUpperCase() : "U"}
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
      <div className={`${activeChat ? "flex" : "hidden md:flex"} flex-1 flex-col bg-[#f3f6fb] dark:bg-slate-950 relative overflow-hidden h-full lg:transition-[padding] lg:duration-200 ${isInfoOpen ? "lg:pr-[356px]" : ""}`}>
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
                    {activeContactAvatarUrl ? <AvatarImage src={activeContactAvatarUrl} alt={activeContact?.groupName || "Avatar"} /> : null}
                  <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                      {activeContact?.groupName?.charAt(0).toUpperCase() || "U"}
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
                    {activeContact?.groupName || "Không rõ tên"}
                  </h2>
                  <span className={`text-xs font-medium ${activeStatusToneClass}`}>{activeStatusText}</span>
                </div>
              </div>
              <div className="flex items-center text-gray-600 dark:text-slate-300">
                <button 
                  className="rounded-full p-2 transition hover:bg-gray-100 dark:hover:bg-slate-800" 
                  onClick={() => handleStartCall(false)}
                  title="Gọi thoại"
                >
                  <Phone size={20} />
                </button>
                <button 
                  className="rounded-full p-2 transition hover:bg-gray-100 dark:hover:bg-slate-800" 
                  onClick={() => handleStartCall(true)}
                  title="Gọi video"
                >
                  <Video size={20} />
                </button>
                <div className="mx-2 h-6 w-px bg-gray-200 dark:bg-slate-700"></div>
                <button
                  className={`rounded-full p-2 transition ${isInfoOpen ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-gray-100 dark:hover:bg-slate-800"}`}
                  title="Thông tin chi tiết"
                  onClick={() => setIsInfoOpen((prev) => !prev)}
                >
                  <Info size={20} />
                </button>
              </div>
            </div>

            {isInfoOpen ? (
              <button
                type="button"
                aria-label="Đóng thông tin cuộc trò chuyện"
                onClick={() => setIsInfoOpen(false)}
                className="absolute inset-0 z-20 bg-black/35 backdrop-blur-[1px] lg:hidden"
              />
            ) : null}

            <aside
              className={`absolute right-0 top-16 z-30 flex h-[calc(100%-4rem)] w-full max-w-full flex-col border-l border-slate-200 bg-[#eef3fb] shadow-xl transition-transform duration-200 dark:border-slate-700 dark:bg-slate-900 sm:w-[360px] sm:max-w-[90%] md:w-[340px] lg:right-0 lg:top-0 lg:h-full lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:border-slate-200 dark:lg:border-slate-700 lg:shadow-none ${isInfoOpen ? "translate-x-0" : "translate-x-full"}`}
            >
              <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Thông tin cuộc trò chuyện</h3>
                <button
                  onClick={() => setIsInfoOpen(false)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Đóng
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm text-slate-700 dark:text-slate-300 hide-scrollbar">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Tên hiển thị</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{activeContact?.groupName || "Không rõ tên"}</p>
                </div>
                {activeGroupId ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Ảnh nhóm</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Avatar className="h-14 w-14">
                        {activeContactAvatarUrl ? <AvatarImage src={activeContactAvatarUrl} alt={activeContact?.groupName || "Ảnh nhóm"} /> : null}
                        <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold text-lg">
                          {activeContact?.groupName?.charAt(0).toUpperCase() || "G"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Tải ảnh nhóm để hiển thị ngay trên giao diện chat.
                        </p>
                        {canUpdateGroupAvatar ? (
                          <>
                            <input
                              ref={groupAvatarInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => void handleGroupAvatarFileChange(event)}
                            />
                            <button
                              type="button"
                              onClick={() => groupAvatarInputRef.current?.click()}
                              disabled={isUpdatingGroupAvatar}
                              className="mt-2 inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <ImagePlus size={12} />
                              {isUpdatingGroupAvatar ? "Đang tải..." : "Đổi ảnh nhóm"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Loại cuộc trò chuyện</p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{activeContact?.isGroup ? "Nhóm" : "Trực tiếp"}</p>
                </div>
                {canViewConversationCode ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Mã hội thoại</p>
                    <p className="mt-1 break-all text-xs text-slate-600 dark:text-slate-300">{activeContact?.conversationId || "-"}</p>
                  </div>
                ) : null}
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Tin nhắn mới</p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{activeContact?.unreadCount ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Cập nhật gần nhất</p>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{activeContact?.updatedAt ? format(new Date(activeContact.updatedAt), "HH:mm dd/MM/yyyy") : "-"}</p>
                </div>

                {activeGroupId ? (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Thành viên nhóm</p>
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{activeGroupMembers.length}</span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
                        <p className="text-xs text-slate-500">Đang tải danh sách thành viên...</p>
                      ) : (
                        <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900 hide-scrollbar">
                          {activeGroupMembers.length === 0 ? (
                            <p className="px-1 py-1 text-xs text-slate-500 dark:text-slate-400">Chưa có thành viên hiển thị.</p>
                          ) : (
                            activeGroupMembers.map((member, index) => (
                              <div
                                key={member.userId}
                                className="flex items-center justify-between rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
                              >
                                <div className="min-w-0">
                                  {(() => {
                                    const profile = memberProfilesById[member.userId];
                                    const displayName =
                                      profile?.fullName ||
                                      myFriends.find((friend) => friend.userId === member.userId)?.fullName ||
                                      messageSenderNameByUserId.get(member.userId) ||
                                      `Thành viên ${index + 1}`;

                                    return (
                                      <>
                                        <p className="truncate font-medium">
                                          {displayName}
                                          {member.userId === user?.sub ? " (Bạn)" : ""}
                                        </p>
                                      </>
                                    );
                                  })()}
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Vai trò: {member.roleInGroup}</p>
                                </div>
                                {member.userId !== user?.sub ? (
                                  <div className="ml-2 flex flex-col items-end gap-1">
                                    {canManageGroupMembers ? (
                                      <div className="flex items-center gap-1">
                                        {member.roleInGroup !== "OWNER" ? (
                                          <button
                                            type="button"
                                            onClick={() => void handleToggleMemberRole(member.userId, member.roleInGroup)}
                                            className="rounded px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
                                          >
                                            {member.roleInGroup === "OFFICER" ? "Hạ quyền" : "Nâng quyền"}
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          onClick={() => void handleRemoveGroupMember(member.userId)}
                                          className="rounded px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                                        >
                                          Xóa
                                        </button>
                                      </div>
                                    ) : null}

                                    {friendUserIds.has(member.userId) ? (
                                      <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                                        Bạn bè
                                      </span>
                                    ) : outgoingFriendRequestUserIds.has(member.userId) ? (
                                      <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                                        Đã gửi lời mời
                                      </span>
                                    ) : incomingFriendRequestUserIds.has(member.userId) ? (
                                      <span className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                                        Đã nhận lời mời
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => void handleSendFriendRequest(member.userId)}
                                        disabled={sendFriendRequestMutation.isPending && sendingFriendRequestUserId === member.userId}
                                        className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {sendFriendRequestMutation.isPending && sendingFriendRequestUserId === member.userId
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
                      <form onSubmit={handleAddGroupMember} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Thêm thành viên</p>
                        <input
                          value={memberLookupInput}
                          onChange={(event) => setMemberLookupInput(event.target.value)}
                          placeholder="Nhập số điện thoại hoặc email"
                          className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Hệ thống sẽ tra cứu chính xác người dùng theo số điện thoại/email rồi thêm vào nhóm.
                        </p>
                        <select
                          value={memberRoleInput}
                          onChange={(event) => setMemberRoleInput(event.target.value as GroupMemberRole)}
                          className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="MEMBER">MEMBER</option>
                          <option value="OFFICER">OFFICER</option>
                        </select>
                        <button
                          type="submit"
                          disabled={manageGroupMemberMutation.isPending}
                          className="w-full rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {manageGroupMemberMutation.isPending ? "Đang xử lý..." : "Thêm thành viên"}
                        </button>
                      </form>
                    ) : null}

                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mời bạn bè</p>
                      <button
                        type="button"
                        onClick={() => setIsInviteDialogOpen(true)}
                        disabled={!canInviteGroupFriends}
                        className="w-full rounded border border-blue-300 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Mời bạn bè vào nhóm
                      </button>
                      {!canInviteGroupFriends ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Không thể mời thành viên ở cuộc trò chuyện hiện tại.
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Chọn nhiều bạn bè và gửi lời mời cùng lúc.
                        </p>
                      )}
                    </div>

                    {memberActionError ? (
                      <p className="text-xs text-red-500">{memberActionError}</p>
                    ) : null}

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setIsLeaveGroupDialogOpen(true)}
                        disabled={leaveGroupMutation.isPending}
                        className="w-full rounded bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {leaveGroupMutation.isPending ? "Đang rời nhóm..." : "Rời nhóm"}
                      </button>
                    </div>

                    {leaveGroupError ? (
                      <p className="text-xs text-red-500">{leaveGroupError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>

            {/* Nội dung tin nhắn */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 min-h-0 bg-slate-50 dark:bg-slate-950 relative hide-scrollbar">
              {loadingMessages && <div className="text-center py-4 text-sm text-gray-500 dark:text-slate-400">Đang tải tin nhắn...</div>}
              
              <div className="flex flex-col gap-3 pb-4">
                {hasMore ? (
                  <div className="flex justify-center py-1">
                    <button
                      type="button"
                      onClick={() => void handleLoadMoreMessages()}
                      disabled={isLoadingMore}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {isLoadingMore ? "Đang tải thêm..." : "Tải thêm tin nhắn cũ"}
                    </button>
                  </div>
                ) : null}
                {/* Đảo ngược array nếu API trả về tin mới nhất trước (thường thấy nếu limit offset) */}
                {[...messages].reverse().map((msg, index, orderedMessages) => {
                  const isMe = msg.senderId === user?.sub;
                  const previousMessage = orderedMessages[index - 1];
                  const nextMessage = orderedMessages[index + 1];
                  const isGroupIncoming = Boolean(activeContact?.isGroup && !isMe);
                  const startsSenderBlock = !previousMessage || previousMessage.senderId !== msg.senderId;
                  const endsSenderBlock = !nextMessage || nextMessage.senderId !== msg.senderId;
                  const shouldShowSenderMeta = isGroupIncoming && startsSenderBlock;
                  const senderProfile = msg.senderId ? memberProfilesById[msg.senderId] : undefined;
                  const senderAvatarUrl =
                    senderProfile?.avatarAsset?.resolvedUrl ||
                    senderProfile?.avatarUrl ||
                    (msg.senderId ? friendAvatarByUserId[msg.senderId] : undefined);
                  const senderDisplayName =
                    (msg.senderId ? mentionNameByUserId.get(msg.senderId) : undefined) ||
                    msg.senderName ||
                    "Thành viên";
                  const isEditing = editingMessageId === msg.id;
                  const canEditMessage = msg.type === "TEXT" || msg.type === "EMOJI" || msg.type === "SYSTEM";
                  const canRecallEveryone = isMe;
                  const replyPreview = msg.replyMessage;
                  const isForwardedMessage = Boolean(msg.forwardedFromMessageId);
                  const forwardedLabel = msg.forwardedFromSenderName
                    ? `${msg.forwardedFromSenderName} đã chuyển tiếp`
                    : "Đã chuyển tiếp";
                  const messageText = extractMessageText(msg.content).trim();
                  const messageReactions = activeMessageReactions[msg.id] || [];
                  const reactionSummary = Array.from(
                    messageReactions.reduce((acc, emoji) => {
                      acc.set(emoji, (acc.get(emoji) || 0) + 1);
                      return acc;
                    }, new Map<string, number>()),
                  );
                  const isCallMessage = msg.type === "SYSTEM" && /cuộc gọi|call/i.test(messageText);
                  const isVideoCallByMessage = /video/i.test(messageText);
                  const callDirectionByMessage: CallEndedSummary["direction"] = isMe ? "outgoing" : "incoming";
                  const callSummary = isCallMessage
                    ? resolveCallSummary(msg, callDirectionByMessage, isVideoCallByMessage)
                    : null;

                  if (isCallMessage) {
                    const summaryIsOutgoing = isMe;
                    const summaryAlignClass = summaryIsOutgoing ? "self-end" : "self-start";
                    const summaryBubbleClass = summaryIsOutgoing
                      ? "border-blue-500/30 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
                    const summaryIconClass = summaryIsOutgoing
                      ? "bg-white/10 text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200";
                    const summaryMetaClass = summaryIsOutgoing ? "text-white/80" : "text-slate-500 dark:text-slate-400";
                    const isVideoCall = callSummary?.isVideo ?? isVideoCallByMessage;
                    const callDirectionLabel = summaryIsOutgoing ? "đi" : "đến";
                    const titleText = `Cuộc gọi ${isVideoCall ? "video" : "thoại"} ${callDirectionLabel}`;
                    const durationText = formatCallDuration(callSummary?.durationSeconds ?? 0);

                    return (
                      <div key={msg.id} className={`group relative flex max-w-[70%] ${summaryAlignClass} flex-col py-1`}>
                        <div className={`w-full rounded-2xl border px-4 py-3 shadow-sm ${summaryBubbleClass}`}>
                          <div className="flex items-start gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${summaryIconClass}`}>
                              <Phone size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">{titleText}</p>
                              <p className={`mt-0.5 text-xs ${summaryMetaClass}`}>{durationText}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`group relative flex max-w-[70%] ${isMe ? "self-end" : "self-start"} flex-col`}>
                      {!isEditing ? (
                        <div
                          className={`absolute ${isMe ? "-left-24" : "-right-24"} bottom-6 z-20 flex items-center gap-1 rounded-full bg-slate-900/60 px-1 py-1 shadow-sm backdrop-blur-sm transition-opacity ${
                            activeMessageMenuId === msg.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
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
                                setReactionPickerMessageId((prev) => (prev === msg.id ? null : msg.id));
                              }}
                            >
                              <SmilePlus size={14} />
                            </button>

                            {reactionPickerMessageId === msg.id ? (
                              <div className={`absolute ${isMe ? "right-0" : "left-0"} -top-12 z-30 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900`}>
                                {QUICK_REACTION_EMOJIS.map((emoji) => (
                                  <button
                                    key={`${msg.id}-${emoji}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleToggleMessageReaction(msg.id, emoji);
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
                                const triggerRect = event.currentTarget.getBoundingClientRect();
                                const estimatedMenuHeight = 220;
                                const spaceBelow = window.innerHeight - triggerRect.bottom;
                                const spaceAbove = triggerRect.top;
                                const shouldOpenUp =
                                  spaceBelow < estimatedMenuHeight &&
                                  spaceAbove > spaceBelow;

                                setMessageMenuPlacement(shouldOpenUp ? "up" : "down");
                                setActiveMessageMenuId((prev) => (prev === msg.id ? null : msg.id));
                              }}
                              className="rounded-full p-1.5 text-white/90 transition hover:bg-white/20 hover:text-white"
                              title="Tùy chọn tin nhắn"
                            >
                              <MoreHorizontal size={14} />
                            </button>

                            {activeMessageMenuId === msg.id ? (
                              <div className={`absolute ${isMe ? "right-0" : "left-0"} ${messageMenuPlacement === "down" ? "top-9" : "bottom-9"} z-30 w-52 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-lg`}>
                                {isMe && canEditMessage ? (
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
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100"
                                  onClick={() => handleOpenForwardDialog(msg.id)}
                                >
                                  <Share2 size={14} />
                                  Chuyển tiếp
                                </button>
                                {canRecallEveryone ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                    onClick={() => void handleDeleteMessage(msg.id, "EVERYONE")}
                                  >
                                    <Trash2 size={14} />
                                    Thu hồi với mọi người
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                  onClick={() => void handleDeleteMessage(msg.id, "SELF")}
                                >
                                  <Trash2 size={14} />
                                  Ẩn với tôi
                                </button>
                                <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Sẽ thêm tính năng khác sau</div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {shouldShowSenderMeta ? (
                        <p className="mb-1 ml-10 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {senderDisplayName}
                        </p>
                      ) : null}

                      <div className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                        {isGroupIncoming ? (
                          shouldShowSenderMeta ? (
                            <Avatar className="h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-700">
                              {senderAvatarUrl ? <AvatarImage src={senderAvatarUrl} alt={senderDisplayName} /> : null}
                              <AvatarFallback className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 text-xs font-semibold">
                                {senderDisplayName.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ) : (
                            <div className="h-8 w-8 shrink-0" />
                          )
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
                            <div className={`mb-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${isMe ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                              {forwardedLabel}
                            </div>
                          ) : null}
                          {replyPreview ? (
                            <div className={`mb-2 rounded-lg border-l-2 px-3 py-2 text-xs ${isMe ? "border-white/50 bg-white/10 text-white/90" : "border-blue-500 bg-blue-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                              <p className="font-medium">Trả lời {replyPreview.senderName}</p>
                              <p className="mt-0.5 line-clamp-2 break-words opacity-90">
                                {getReplyPreviewText(replyPreview)}
                              </p>
                            </div>
                          ) : null}
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
                            <p className="text-[15px]">{renderMessageTextWithMentions(msg.content, isMe)}</p>
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
                      </div>
                      {reactionSummary.length > 0 ? (
                        <div className={`mt-1 flex flex-wrap gap-1 ${isMe ? "justify-end" : "justify-start"} ${isGroupIncoming ? "pl-10" : ""}`}>
                          {reactionSummary.map(([emoji, count]) => (
                            <button
                              key={`${msg.id}-reaction-${emoji}`}
                              type="button"
                              onClick={() => handleToggleMessageReaction(msg.id, emoji)}
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
                        <span className={`text-[10px] text-gray-400 dark:text-slate-500 mt-1 ${isMe ? "text-right" : "text-left"} ${isGroupIncoming ? "pl-10" : ""}`}>
                          {format(new Date(msg.sentAt), "HH:mm")}
                        </span>
                      ) : null}
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
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Chuyển tiếp tin nhắn</h3>
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
                        <div className="p-3 text-sm text-slate-500 dark:text-slate-400">Không có cuộc trò chuyện phù hợp.</div>
                      ) : (
                        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                          {forwardDestinationConversations.map((conversation) => {
                            const checked = selectedForwardConversationIds.includes(conversation.conversationId);
                            return (
                              <li key={conversation.conversationId}>
                                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleToggleForwardTarget(conversation.conversationId)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                      {conversation.groupName || "Không rõ tên"}
                                    </p>
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                      {conversation.conversationId}
                                    </p>
                                  </div>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {forwardActionError ? (
                      <p className="text-xs text-red-500">{forwardActionError}</p>
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
                      {isForwardingMessage ? "Đang chuyển tiếp..." : "Chuyển tiếp"}
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
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mời bạn bè vào nhóm</h3>
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
                      onChange={(event) => setInviteSearchText(event.target.value)}
                      placeholder="Tìm bạn bè theo tên hoặc userId"
                      className="bg-slate-50 dark:bg-slate-800 dark:border-slate-700"
                    />

                    <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 hide-scrollbar">
                      {inviteCandidateFriends.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 dark:text-slate-400">Không còn bạn bè phù hợp để mời.</div>
                      ) : (
                        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                          {inviteCandidateFriends.map((friend) => {
                            const checked = selectedInviteUserIds.includes(friend.userId);
                            return (
                              <li key={friend.userId}>
                                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleInviteSelection(friend.userId)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                      {friend.fullName || "Không rõ tên"}
                                    </p>
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{friend.userId}</p>
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
                      {manageGroupMemberMutation.isPending ? "Đang mời..." : "Gửi lời mời"}
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
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Xác nhận rời nhóm</h3>
                  </div>
                  <div className="space-y-2 px-4 py-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Bạn sẽ không còn nhận tin nhắn mới từ nhóm này. Bạn có chắc muốn tiếp tục?
                    </p>
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
                      {leaveGroupMutation.isPending ? "Đang rời nhóm..." : "Xác nhận rời nhóm"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Vùng nhập liệu */}
            <form onSubmit={handleSend} className="p-4 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 shrink-0 z-10 relative space-y-2">
              {replyingMessage ? (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">Đang trả lời</p>
                    <p className="mt-1 font-medium">{replyingMessage.senderName}</p>
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
              <div className="relative" ref={emojiPickerRef}>
                <button
                  type="button"
                  onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                  className="h-11 w-11 flex items-center justify-center border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 rounded-md transition-colors"
                  title="Chọn emoji"
                >
                  <Smile size={18} />
                </button>
                {isEmojiPickerOpen ? (
                  <div className="absolute bottom-12 left-0 z-50 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <EmojiPicker
                      onEmojiClick={handleEmojiSelect}
                      theme={document.documentElement.classList.contains("dark") ? Theme.DARK : Theme.LIGHT}
                      autoFocusSearch={false}
                      lazyLoadEmojis
                    />
                  </div>
                ) : null}
              </div>
              <div className="relative flex-1">
                <Input 
                  type="text" 
                  placeholder={activeGroupId ? "Nhập tin nhắn... gõ @ để tag thành viên" : "Nhập tin nhắn..."}
                  className="flex-1 bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400 focus-visible:ring-blue-500 h-11"
                  ref={composerInputRef}
                  value={inputText}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    handleComposerInputChange(nextValue, e.target.selectionStart);

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
                    syncMentionContext(inputText, event.currentTarget.selectionStart)
                  }
                  onKeyUp={(event) =>
                    syncMentionContext(inputText, event.currentTarget.selectionStart)
                  }
                  onKeyDown={handleComposerKeyDown}
                  disabled={isSending || isUploading}
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
                        <span className="truncate font-medium">{candidate.displayName}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
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
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Xác nhận xóa thành viên</h3>
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
                    <p className="break-all text-xs text-slate-500 dark:text-slate-400">{pendingRemoveMemberUserId}</p>
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
                      {manageGroupMemberMutation.isPending ? "Đang xóa..." : "Xác nhận xóa"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
