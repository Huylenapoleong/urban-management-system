import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  globalSearchMessages,
  getSocialGraph,
} from "@/services/conversation.api";
import { listMyFriends } from "@/services/friends.api";
import { getGroups } from "@/services/group.api";
import { useQuery } from "@tanstack/react-query";
import type {
  MessageItem,
  SocialGraphDto,
  UserDirectoryItem,
  UserFriendItem,
} from "@urban/shared-types";
import {
  ChevronRight,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  MessageSquare,
  Search,
  Users,
} from "lucide-react";
import React, { useMemo, useState } from "react";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

type SearchTab = "all" | "personal" | "group" | "messages" | "files";

interface SearchPersonResult {
  userId: string;
  displayName: string;
  fullName: string;
  avatarUrl?: string;
  relationLabel: string; // "Bạn bè" | "Thành viên nhóm chung"
  isFriend: boolean;
  sharedGroupIds: string[];
}

interface SearchGroupResult {
  groupId: string;
  groupName: string;
  avatarUrl?: string;
  memberCount?: number;
  reason: "name_match" | "member_match"; // why it appeared
  matchedMemberName?: string;
}

interface GlobalSearchPanelProps {
  keyword: string;
  currentUserId?: string;
  /** Navigate to a DM or group conversation */
  onOpenConversation: (conversationId: string) => void;
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function getAvatarFallback(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function normalizeText(text?: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function textMatches(text: string, keyword: string): boolean {
  const nkw = normalizeText(keyword);
  const nt = normalizeText(text);
  // Check word prefix match too
  return nt.includes(nkw) || nt.split(/\s+/).some((w) => w.startsWith(nkw));
}

function getFileIcon(msg: MessageItem): React.ReactElement {
  const ct = msg.attachmentAsset?.contentType ?? "";
  const fn =
    msg.attachmentAsset?.originalFileName ??
    msg.attachmentAsset?.fileName ??
    "";
  const ext = fn.split(".").pop()?.toLowerCase() ?? "";
  if (
    ct.startsWith("image") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)
  )
    return <FileImage size={18} className="text-blue-400" />;
  if (
    ct.startsWith("video") ||
    ["mp4", "mov", "avi", "mkv", "webm"].includes(ext)
  )
    return <FileVideo size={18} className="text-purple-400" />;
  if (ct.startsWith("audio") || ["mp3", "wav", "ogg", "aac"].includes(ext))
    return <FileAudio size={18} className="text-green-400" />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return <FileArchive size={18} className="text-amber-400" />;
  return <FileText size={18} className="text-slate-400" />;
}

function formatMsgDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0)
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (diffDays < 7) return d.toLocaleDateString("vi-VN", { weekday: "short" });
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function parseMessageText(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: unknown };
    if (parsed && typeof parsed.text === "string") return parsed.text;
  } catch {
    // ignore JSON parse errors
  }
  return content;
}

function highlightText(text: string, keyword: string): React.ReactElement {
  if (!keyword) return <span>{text}</span>;
  const nkw = normalizeText(keyword);
  const nt = normalizeText(text);
  const idx = nt.indexOf(nkw);
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/60 rounded-sm px-0.5">
        {text.slice(idx, idx + keyword.length)}
      </mark>
      {text.slice(idx + keyword.length)}
    </span>
  );
}

// ────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────

const PersonRow: React.FC<{
  result: SearchPersonResult;
  keyword: string;
  onClick: () => void;
}> = ({ result, keyword, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
  >
    <div className="relative shrink-0">
      <Avatar className="h-10 w-10">
        <AvatarImage src={result.avatarUrl} />
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-semibold">
          {getAvatarFallback(result.displayName)}
        </AvatarFallback>
      </Avatar>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
        {highlightText(result.displayName, keyword)}
      </p>
      {result.displayName !== result.fullName && (
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {result.fullName}
        </p>
      )}
      <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
        {result.relationLabel}
      </p>
    </div>
  </button>
);

const GroupRow: React.FC<{
  result: SearchGroupResult;
  keyword: string;
  onClick: () => void;
}> = ({ result, keyword, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
  >
    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
      <Users size={18} className="text-white" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
        {highlightText(result.groupName, keyword)}
      </p>
      {result.reason === "member_match" && result.matchedMemberName && (
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
          Thành viên: {result.matchedMemberName}
        </p>
      )}
    </div>
  </button>
);

const MessageRow: React.FC<{
  msg: MessageItem;
  keyword: string;
  onClick: () => void;
}> = ({ msg, keyword, onClick }) => {
  const text = parseMessageText(msg.content);
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
    >
      <Avatar className="h-9 w-9 shrink-0 mt-0.5">
        <AvatarImage
          src={msg.senderAvatarAsset?.resolvedUrl ?? msg.senderAvatarUrl}
        />
        <AvatarFallback className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white text-xs font-semibold">
          {getAvatarFallback(msg.senderName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
            {msg.senderName}
          </p>
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
            {formatMsgDate(msg.sentAt)}
          </span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 truncate line-clamp-2">
          {highlightText(text, keyword)}
        </p>
      </div>
    </button>
  );
};

const FileRow: React.FC<{
  msg: MessageItem;
  onClick: () => void;
}> = ({ msg, onClick }) => {
  const asset = msg.attachmentAsset;
  const name = asset?.originalFileName ?? asset?.fileName ?? "Tệp đính kèm";
  const sizeLabel = asset?.size
    ? asset.size > 1048576
      ? `${(asset.size / 1048576).toFixed(1)} MB`
      : `${Math.round(asset.size / 1024)} KB`
    : "";
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
    >
      <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        {getFileIcon(msg)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
          {name}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
          {msg.senderName}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
          {msg.sentAt ? ` · ${formatMsgDate(msg.sentAt)}` : ""}
        </p>
      </div>
    </button>
  );
};

const SectionHeader: React.FC<{
  label: string;
  icon: React.ReactNode;
  onViewAll?: () => void;
}> = ({ label, icon, onViewAll }) => (
  <div className="flex items-center justify-between px-4 py-1.5 mt-1">
    <div className="flex items-center gap-1.5">
      <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
    {onViewAll && (
      <button
        onClick={onViewAll}
        className="flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium transition-colors"
      >
        Xem tất cả <ChevronRight size={14} />
      </button>
    )}
  </div>
);

const EmptyState: React.FC<{ keyword: string }> = ({ keyword }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <Search size={36} className="text-slate-300 dark:text-slate-600 mb-3" />
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
      Không tìm thấy kết quả cho <strong>"{keyword}"</strong>
    </p>
    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
      Thử tìm theo tên khác hoặc từ khóa ngắn hơn
    </p>
  </div>
);

const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 size={24} className="animate-spin text-blue-500" />
  </div>
);

// ────────────────────────────────────────────
// Tab bar
// ────────────────────────────────────────────

const TABS: { key: SearchTab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "personal", label: "Cá nhân" },
  { key: "group", label: "Nhóm" },
  { key: "messages", label: "Tin nhắn" },
  { key: "files", label: "File" },
];

const ALL_PREVIEW_LIMIT = 3;

// ────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────

export const GlobalSearchPanel: React.FC<GlobalSearchPanelProps> = ({
  keyword,
  currentUserId,
  onOpenConversation,
}) => {
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const trimmedKw = keyword.trim();

  // ── Pre-fetch social graph (always, regardless of search term) ─────────
  const { data: socialGraph, isLoading: isLoadingGraph } =
    useQuery<SocialGraphDto>({
      queryKey: ["social-graph"],
      queryFn: getSocialGraph,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });

  // ── My friends list (always pre-fetched) ─────────────────────────────
  const { data: myFriends = [] } = useQuery<UserFriendItem[]>({
    queryKey: ["friends", "list", "global-search"],
    queryFn: () => listMyFriends({ limit: 500 }),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // ── My groups list ─────────────────────────────────────────────────
  const { data: myGroupsRaw = [] } = useQuery({
    queryKey: ["groups", "mine", "global-search"],
    queryFn: () => getGroups({ mine: true, limit: 200 }),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // ── Message search (triggered by keyword) ────────────────────────────
  const { data: msgSearchResult, isLoading: isLoadingMsgs } = useQuery({
    queryKey: ["global-search-messages", trimmedKw],
    queryFn: () => globalSearchMessages(trimmedKw),
    enabled: trimmedKw.length >= 1,
    staleTime: 30 * 1000,
  });

  const myFriendIds = useMemo(
    () => new Set(myFriends.map((f) => f.userId)),
    [myFriends],
  );

  // ── Compute PERSON results ──────────────────────────────────────────
  const personResults = useMemo<SearchPersonResult[]>(() => {
    if (!trimmedKw) return [];
    const results: SearchPersonResult[] = [];
    const seen = new Set<string>();

    const graph = socialGraph ?? { groupMembersMap: {}, profiles: {} };

    // 1) Friends matching keyword (by fullName or contactAlias/displayName)
    for (const friend of myFriends) {
      if (friend.userId === currentUserId) continue;
      const nameMatch =
        textMatches(friend.fullName, trimmedKw) ||
        textMatches(friend.displayName ?? "", trimmedKw) ||
        textMatches(friend.contactAlias ?? "", trimmedKw);
      if (!nameMatch) continue;
      if (seen.has(friend.userId)) continue;
      seen.add(friend.userId);
      const profile = graph.profiles[friend.userId];
      const sharedGroupIds = Object.entries(graph.groupMembersMap)
        .filter(([, members]) => members.includes(friend.userId))
        .map(([gId]) => gId);
      results.push({
        userId: friend.userId,
        displayName: friend.displayName ?? friend.fullName,
        fullName: friend.fullName,
        avatarUrl:
          friend.avatarAsset?.resolvedUrl ??
          friend.avatarUrl ??
          profile?.avatarAsset?.resolvedUrl ??
          profile?.avatarUrl,
        relationLabel: "Bạn bè",
        isFriend: true,
        sharedGroupIds,
      });
    }

    // 2) Non-friend group members matching keyword (shared group membership)
    for (const [, members] of Object.entries(graph.groupMembersMap)) {
      for (const userId of members) {
        if (userId === currentUserId) continue;
        if (seen.has(userId)) continue;
        const profile: UserDirectoryItem | undefined = graph.profiles[userId];
        if (!profile) continue;
        const nameMatch =
          textMatches(profile.fullName, trimmedKw) ||
          textMatches(profile.displayName ?? "", trimmedKw) ||
          textMatches(profile.contactAlias ?? "", trimmedKw);
        if (!nameMatch) continue;
        seen.add(userId);
        const sharedGroupIds = Object.entries(graph.groupMembersMap)
          .filter(([, ms]) => ms.includes(userId))
          .map(([gId]) => gId);
        results.push({
          userId,
          displayName: profile.displayName ?? profile.fullName,
          fullName: profile.fullName,
          avatarUrl: profile.avatarAsset?.resolvedUrl ?? profile.avatarUrl,
          relationLabel: "Thành viên nhóm chung",
          isFriend: false,
          sharedGroupIds,
        });
      }
    }

    return results;
  }, [trimmedKw, myFriends, socialGraph, currentUserId]);

  // ── Compute GROUP results ───────────────────────────────────────────
  const groupResults = useMemo<SearchGroupResult[]>(() => {
    if (!trimmedKw) return [];
    const results: SearchGroupResult[] = [];
    const seen = new Set<string>();

    const graph = socialGraph ?? { groupMembersMap: {}, profiles: {} };

    // 1) Groups matching by name
    for (const g of myGroupsRaw) {
      const gId = typeof g === "string" ? g : g.id;
      const gName = typeof g === "string" ? g : (g.groupName ?? "");
      if (!textMatches(gName, trimmedKw)) continue;
      if (seen.has(gId)) continue;
      seen.add(gId);
      results.push({
        groupId: gId,
        groupName: gName,
        avatarUrl: typeof g !== "string" ? g.avatarUrl : undefined,
        memberCount: typeof g !== "string" ? g.memberCount : undefined,
        reason: "name_match",
      });
    }

    // 2) Groups that contain a FRIEND matching keyword
    for (const [groupId, members] of Object.entries(graph.groupMembersMap)) {
      if (seen.has(groupId)) continue;
      const group = myGroupsRaw.find(
        (g) => (typeof g === "string" ? g : g.id) === groupId,
      );
      if (!group) continue;

      const friendMembersInGroup = members.filter((uid) =>
        myFriendIds.has(uid),
      );
      const matchedFriend = friendMembersInGroup.find((uid) => {
        const profile = graph.profiles[uid];
        const friend = myFriends.find((f) => f.userId === uid);
        return (
          textMatches(friend?.fullName ?? "", trimmedKw) ||
          textMatches(friend?.displayName ?? "", trimmedKw) ||
          textMatches(profile?.fullName ?? "", trimmedKw)
        );
      });
      if (!matchedFriend) continue;

      seen.add(groupId);
      const matchedProfile =
        myFriends.find((f) => f.userId === matchedFriend) ??
        graph.profiles[matchedFriend];
      results.push({
        groupId,
        groupName:
          typeof group === "string" ? group : (group.groupName ?? groupId),
        avatarUrl: typeof group !== "string" ? group.avatarUrl : undefined,
        memberCount: typeof group !== "string" ? group.memberCount : undefined,
        reason: "member_match",
        matchedMemberName:
          (matchedProfile as UserFriendItem | UserDirectoryItem)?.displayName ??
          (matchedProfile as UserFriendItem | UserDirectoryItem)?.fullName,
      });
    }

    return results;
  }, [trimmedKw, myGroupsRaw, socialGraph, myFriendIds, myFriends]);

  const messageResults = useMemo<MessageItem[]>(
    () => msgSearchResult?.messages ?? [],
    [msgSearchResult],
  );
  const fileResults = useMemo<MessageItem[]>(
    () => msgSearchResult?.files ?? [],
    [msgSearchResult],
  );

  const isLoading = isLoadingGraph || isLoadingMsgs;
  const hasAnyResult =
    personResults.length > 0 ||
    groupResults.length > 0 ||
    messageResults.length > 0 ||
    fileResults.length > 0;

  // ── Navigate helpers ────────────────────────────────────────────────
  const openDM = (userId: string) => {
    // Use the friend's known DM conversation id pattern
    if (!currentUserId) return;
    const dmId =
      currentUserId < userId
        ? `DM#${currentUserId}#${userId}`
        : `DM#${userId}#${currentUserId}`;
    onOpenConversation(dmId);
  };

  const openGroupConv = (groupId: string) => {
    onOpenConversation(`group:${groupId}`);
  };

  const openMessageConv = (msg: MessageItem) => {
    onOpenConversation(msg.conversationId);
  };

  // ── Render helpers ────────────────────────────────────────────────
  const renderPersonSection = (
    items: SearchPersonResult[],
    limit?: number,
    onViewAll?: () => void,
  ) => {
    const displayed = limit ? items.slice(0, limit) : items;
    if (displayed.length === 0) return null;
    return (
      <div>
        <SectionHeader
          label="Cá nhân"
          icon={<MessageSquare size={13} />}
          onViewAll={items.length > (limit ?? Infinity) ? onViewAll : undefined}
        />
        {displayed.map((p) => (
          <PersonRow
            key={p.userId}
            result={p}
            keyword={trimmedKw}
            onClick={() => openDM(p.userId)}
          />
        ))}
      </div>
    );
  };

  const renderGroupSection = (
    items: SearchGroupResult[],
    limit?: number,
    onViewAll?: () => void,
  ) => {
    const displayed = limit ? items.slice(0, limit) : items;
    if (displayed.length === 0) return null;
    return (
      <div>
        <SectionHeader
          label="Nhóm"
          icon={<Users size={13} />}
          onViewAll={items.length > (limit ?? Infinity) ? onViewAll : undefined}
        />
        {displayed.map((g) => (
          <GroupRow
            key={g.groupId}
            result={g}
            keyword={trimmedKw}
            onClick={() => openGroupConv(g.groupId)}
          />
        ))}
      </div>
    );
  };

  const renderMessageSection = (
    items: MessageItem[],
    limit?: number,
    onViewAll?: () => void,
  ) => {
    const displayed = limit ? items.slice(0, limit) : items;
    if (displayed.length === 0) return null;
    return (
      <div>
        <SectionHeader
          label="Tin nhắn"
          icon={<MessageSquare size={13} />}
          onViewAll={items.length > (limit ?? Infinity) ? onViewAll : undefined}
        />
        {displayed.map((msg) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            keyword={trimmedKw}
            onClick={() => openMessageConv(msg)}
          />
        ))}
      </div>
    );
  };

  const renderFileSection = (
    items: MessageItem[],
    limit?: number,
    onViewAll?: () => void,
  ) => {
    const displayed = limit ? items.slice(0, limit) : items;
    if (displayed.length === 0) return null;
    return (
      <div>
        <SectionHeader
          label="File"
          icon={<FileText size={13} />}
          onViewAll={items.length > (limit ?? Infinity) ? onViewAll : undefined}
        />
        {displayed.map((msg) => (
          <FileRow
            key={msg.id}
            msg={msg}
            onClick={() => openMessageConv(msg)}
          />
        ))}
      </div>
    );
  };

  // ────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Tab bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto hide-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-[60px] py-2.5 text-xs font-semibold transition-all whitespace-nowrap
              ${
                activeTab === tab.key
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 hide-scrollbar">
        {isLoading && <LoadingState />}

        {!isLoading && !hasAnyResult && trimmedKw && (
          <EmptyState keyword={trimmedKw} />
        )}

        {!isLoading && hasAnyResult && (
          <>
            {/* ── Tab: Tất cả ── */}
            {activeTab === "all" && (
              <div className="py-1">
                {renderPersonSection(personResults, ALL_PREVIEW_LIMIT, () =>
                  setActiveTab("personal"),
                )}
                {renderGroupSection(groupResults, ALL_PREVIEW_LIMIT, () =>
                  setActiveTab("group"),
                )}
                {renderMessageSection(messageResults, ALL_PREVIEW_LIMIT, () =>
                  setActiveTab("messages"),
                )}
                {renderFileSection(fileResults, ALL_PREVIEW_LIMIT, () =>
                  setActiveTab("files"),
                )}
              </div>
            )}

            {/* ── Tab: Cá nhân ── */}
            {activeTab === "personal" && (
              <div className="py-1">
                {personResults.length === 0 ? (
                  <EmptyState keyword={trimmedKw} />
                ) : (
                  renderPersonSection(personResults)
                )}
              </div>
            )}

            {/* ── Tab: Nhóm ── */}
            {activeTab === "group" && (
              <div className="py-1">
                {groupResults.length === 0 ? (
                  <EmptyState keyword={trimmedKw} />
                ) : (
                  renderGroupSection(groupResults)
                )}
              </div>
            )}

            {/* ── Tab: Tin nhắn ── */}
            {activeTab === "messages" && (
              <div className="py-1">
                {messageResults.length === 0 ? (
                  <EmptyState keyword={trimmedKw} />
                ) : (
                  renderMessageSection(messageResults)
                )}
              </div>
            )}

            {/* ── Tab: File ── */}
            {activeTab === "files" && (
              <div className="py-1">
                {fileResults.length === 0 ? (
                  <EmptyState keyword={trimmedKw} />
                ) : (
                  renderFileSection(fileResults)
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GlobalSearchPanel;
