import { useMemo, useState, type ReactNode } from "react";
import {
  Ban,
  Loader2,
  Search,
  UserPlus2,
  UserCheck2,
  UserRoundX,
  Users,
  Clock3,
  MessageCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  useFriendActions,
  useBlockedUsers,
  useFriendDiscover,
  useIncomingFriendRequests,
  useMyFriends,
  useOutgoingFriendRequests,
} from "@/hooks/useFriendsData";
import { useAuth } from "@/providers/AuthProvider";

type FriendsTab = "discover" | "incoming" | "outgoing" | "friends" | "blocked";

function initials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

function UserRow({
  name,
  subtitle,
  avatarUrl,
  actions,
}: {
  name: string;
  subtitle?: string;
  avatarUrl?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-10 w-10 border border-gray-100 dark:border-slate-700">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100 text-xs font-semibold">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900 dark:text-slate-100">{name}</p>
          {subtitle ? <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="ml-4 flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function tabClass(active: boolean): string {
  return active
    ? "rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
    : "rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700";
}

function containsFriendKeyword(
  value: {
    fullName?: string;
    role?: string;
    locationCode?: string;
    userId?: string;
    email?: string;
    phone?: string;
  },
  keyword: string,
): boolean {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [
    value.fullName,
    value.role,
    value.locationCode,
    value.userId,
    value.email,
    value.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

export default function FriendsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<FriendsTab>("discover");
  const [searchText, setSearchText] = useState("");
  const pageSize = 20;

  const { data: discover = [], isLoading: loadingDiscover } = useFriendDiscover(searchText);
  const {
    data: incomingData,
    isLoading: loadingIncoming,
    hasNextPage: hasMoreIncoming,
    fetchNextPage: fetchNextIncoming,
    isFetchingNextPage: loadingMoreIncoming,
  } = useIncomingFriendRequests(pageSize);
  const {
    data: outgoingData,
    isLoading: loadingOutgoing,
    hasNextPage: hasMoreOutgoing,
    fetchNextPage: fetchNextOutgoing,
    isFetchingNextPage: loadingMoreOutgoing,
  } = useOutgoingFriendRequests(pageSize);
  const {
    data: friendsData,
    isLoading: loadingFriends,
    hasNextPage: hasMoreFriends,
    fetchNextPage: fetchNextFriends,
    isFetchingNextPage: loadingMoreFriends,
  } = useMyFriends(pageSize);
  const {
    data: blockedData,
    isLoading: loadingBlocked,
    hasNextPage: hasMoreBlocked,
    fetchNextPage: fetchNextBlocked,
    isFetchingNextPage: loadingMoreBlocked,
  } = useBlockedUsers(pageSize);

  const incoming = useMemo(
    () => incomingData?.pages.flatMap((page) => page.items) ?? [],
    [incomingData],
  );
  const outgoing = useMemo(
    () => outgoingData?.pages.flatMap((page) => page.items) ?? [],
    [outgoingData],
  );
  const friends = useMemo(
    () => friendsData?.pages.flatMap((page) => page.items) ?? [],
    [friendsData],
  );
  const blocked = useMemo(
    () => blockedData?.pages.flatMap((page) => page.items) ?? [],
    [blockedData],
  );

  const { sendRequest, acceptRequest, rejectRequest, cancelRequest, unfriend, block, unblock } = useFriendActions();

  const listLoading =
    (tab === "discover" && loadingDiscover) ||
    (tab === "incoming" && loadingIncoming) ||
    (tab === "outgoing" && loadingOutgoing) ||
    (tab === "friends" && loadingFriends) ||
    (tab === "blocked" && loadingBlocked);

  const discoverItems = useMemo(() => {
    const filtered = discover.filter((item) => containsFriendKeyword(item, searchText));
    const userLocation = user?.locationCode?.trim().toUpperCase();
    if (!userLocation) {
      return filtered;
    }

    const sameRegion = filtered.filter(
      (item) => (item.locationCode ?? "").trim().toUpperCase() === userLocation,
    );
    const otherRegions = filtered.filter(
      (item) => (item.locationCode ?? "").trim().toUpperCase() !== userLocation,
    );

    if (!searchText.trim()) {
      return sameRegion.length > 0 ? sameRegion : filtered;
    }

    return [...sameRegion, ...otherRegions];
  }, [discover, searchText, user?.locationCode]);

  const filteredIncoming = useMemo(
    () => incoming.filter((item) => containsFriendKeyword(item, searchText)),
    [incoming, searchText],
  );
  const filteredOutgoing = useMemo(
    () => outgoing.filter((item) => containsFriendKeyword(item, searchText)),
    [outgoing, searchText],
  );
  const filteredFriends = useMemo(
    () => friends.filter((item) => containsFriendKeyword(item, searchText)),
    [friends, searchText],
  );
  const filteredBlocked = useMemo(
    () => blocked.filter((item) => containsFriendKeyword(item, searchText)),
    [blocked, searchText],
  );

  const navigateToChat = (userId: string, fullName: string, avatarUrl?: string) => {
    navigate("/chat", {
      state: {
        conversationId: `dm:${userId}`,
        displayName: fullName,
        avatarUrl,
      },
    });
  };

  const isCitizenWardPair = (targetRole?: string): boolean => {
    const myRole = user?.role;
    if (!myRole || !targetRole) {
      return false;
    }
    return (
      (myRole === "CITIZEN" && targetRole === "WARD_OFFICER") ||
      (myRole === "WARD_OFFICER" && targetRole === "CITIZEN")
    );
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Bạn bè</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Quản lý lời mời kết bạn và danh sách bạn bè của bạn.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Tìm bạn..."
              className="pl-9 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={tabClass(tab === "discover")} onClick={() => setTab("discover")}>Đề xuất</button>
          <button type="button" className={tabClass(tab === "incoming")} onClick={() => setTab("incoming")}>Yêu cầu kết bạn ({incoming.length})</button>
          <button type="button" className={tabClass(tab === "outgoing")} onClick={() => setTab("outgoing")}>Đã gửi ({outgoing.length})</button>
          <button type="button" className={tabClass(tab === "friends")} onClick={() => setTab("friends")}>Bạn bè ({friends.length})</button>
          <button type="button" className={tabClass(tab === "blocked")} onClick={() => setTab("blocked")}>Đã chặn ({blocked.length})</button>
        </div>

        {listLoading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
          </div>
        ) : null}

        {!listLoading && tab === "discover" ? (
          <div className="space-y-3">
            {discoverItems.map((item) => {
              const avatarUrl = item.avatarAsset?.resolvedUrl || item.avatarUrl;
              const busy = sendRequest.isPending && sendRequest.variables === item.userId;
              const isBlocking = block.isPending && block.variables === item.userId;
              const isCitizenWard = isCitizenWardPair(item.role);
              const canSendFriendRequest = Boolean(item.canSendFriendRequest) && !isCitizenWard;
              const canMessage = Boolean(item.canMessage) || isCitizenWard;

              return (
                <UserRow
                  key={item.userId}
                  name={item.fullName}
                  subtitle={`${item.role} • ${item.locationCode}`}
                  avatarUrl={avatarUrl}
                  actions={
                    <>
                      {canMessage ? (
                        <button
                          type="button"
                          onClick={() => navigateToChat(item.userId, item.fullName, avatarUrl)}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Nhắn tin
                        </button>
                      ) : null}
                      {canSendFriendRequest ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            sendRequest.mutate(item.userId, {
                              onSuccess: () => setTab("outgoing"),
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus2 className="h-4 w-4" />}
                          Kết bạn
                        </button>
                      ) : null}
                      {!canMessage && !canSendFriendRequest && item.relationState === "OUTGOING_REQUEST" ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                          <Clock3 className="h-3 w-3" />
                          Đang chờ chấp nhận
                        </span>
                      ) : null}
                      {!canMessage && !canSendFriendRequest && item.relationState === "INCOMING_REQUEST" ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">
                          <UserCheck2 className="h-3 w-3" />
                          Có yêu cầu đến
                        </span>
                      ) : null}
                      <button
                        type="button"
                        disabled={isBlocking}
                        onClick={() =>
                          block.mutate(item.userId, {
                            onSuccess: () => setTab("blocked"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {isBlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                        Chặn
                      </button>
                    </>
                  }
                />
              );
            })}
            {discoverItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Không tìm thấy người phù hợp...
              </div>
            ) : null}
          </div>
        ) : null}

        {!listLoading && tab === "incoming" ? (
          <div className="space-y-3">
            {filteredIncoming.map((item) => {
              const avatarUrl = item.avatarAsset?.resolvedUrl || item.avatarUrl;
              const isAccepting = acceptRequest.isPending && acceptRequest.variables === item.userId;
              const isRejecting = rejectRequest.isPending && rejectRequest.variables === item.userId;
              const isBlocking = block.isPending && block.variables === item.userId;

              return (
                <UserRow
                  key={item.userId}
                  name={item.fullName}
                  subtitle={`${item.role} • ${item.locationCode}`}
                  avatarUrl={avatarUrl}
                  actions={
                    <>
                      <button
                        type="button"
                        disabled={isAccepting || isRejecting}
                        onClick={() =>
                          acceptRequest.mutate(item.userId, {
                            onSuccess: () => setTab("friends"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck2 className="h-4 w-4" />}
                        Chấp nhận
                      </button>
                      <button
                        type="button"
                        disabled={isAccepting || isRejecting || isBlocking}
                        onClick={() =>
                          rejectRequest.mutate(item.userId, {
                            onSuccess: () => setTab("discover"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                      >
                        {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundX className="h-4 w-4" />}
                        Từ chối
                      </button>
                      <button
                        type="button"
                        disabled={isAccepting || isRejecting || isBlocking}
                        onClick={() =>
                          block.mutate(item.userId, {
                            onSuccess: () => setTab("blocked"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {isBlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                        Chặn
                      </button>
                    </>
                  }
                />
              );
            })}
            {filteredIncoming.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Bạn không có lời mời kết bạn nào.
              </div>
            ) : null}
            {hasMoreIncoming ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => fetchNextIncoming()}
                  disabled={loadingMoreIncoming}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {loadingMoreIncoming ? "Đang tải..." : "Tải thêm"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!listLoading && tab === "outgoing" ? (
          <div className="space-y-3">
            {filteredOutgoing.map((item) => {
              const avatarUrl = item.avatarAsset?.resolvedUrl || item.avatarUrl;
              const isCancelling = cancelRequest.isPending && cancelRequest.variables === item.userId;
              const isBlocking = block.isPending && block.variables === item.userId;

              return (
                <UserRow
                  key={item.userId}
                  name={item.fullName}
                  subtitle={`${item.role} • ${item.locationCode}`}
                  avatarUrl={avatarUrl}
                  actions={
                    <>
                      <button
                        type="button"
                        disabled={isCancelling || isBlocking}
                        onClick={() =>
                          cancelRequest.mutate(item.userId, {
                            onSuccess: () => setTab("discover"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                      >
                        {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundX className="h-4 w-4" />}
                        Hủy yêu cầu
                      </button>
                      <button
                        type="button"
                        disabled={isCancelling || isBlocking}
                        onClick={() =>
                          block.mutate(item.userId, {
                            onSuccess: () => setTab("blocked"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {isBlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                        Chặn
                      </button>
                    </>
                  }
                />
              );
            })}
            {filteredOutgoing.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Bạn chưa gửi lời mời kết bạn nào.
              </div>
            ) : null}
            {hasMoreOutgoing ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => fetchNextOutgoing()}
                  disabled={loadingMoreOutgoing}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {loadingMoreOutgoing ? "Đang tải..." : "Tải thêm"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!listLoading && tab === "friends" ? (
          <div className="space-y-3">
            {filteredFriends.map((item) => {
              const avatarUrl = item.avatarAsset?.resolvedUrl || item.avatarUrl;
              const isRemoving = unfriend.isPending && unfriend.variables === item.userId;
              const isBlocking = block.isPending && block.variables === item.userId;

              return (
                <UserRow
                  key={item.userId}
                  name={item.fullName}
                  subtitle={`${item.role} • ${item.locationCode}`}
                  avatarUrl={avatarUrl}
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() => navigateToChat(item.userId, item.fullName, avatarUrl)}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Nhắn tin
                      </button>
                      <button
                        type="button"
                        disabled={isRemoving || isBlocking}
                        onClick={() =>
                          unfriend.mutate(item.userId, {
                            onSuccess: () => setTab("discover"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                        Hủy kết bạn
                      </button>
                      <button
                        type="button"
                        disabled={isRemoving || isBlocking}
                        onClick={() =>
                          block.mutate(item.userId, {
                            onSuccess: () => setTab("blocked"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {isBlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                        Chặn
                      </button>
                    </>
                  }
                />
              );
            })}
            {filteredFriends.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Bạn chưa có bạn bè nào.
              </div>
            ) : null}
            {hasMoreFriends ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => fetchNextFriends()}
                  disabled={loadingMoreFriends}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {loadingMoreFriends ? "Đang tải..." : "Tải thêm"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!listLoading && tab === "blocked" ? (
          <div className="space-y-3">
            {filteredBlocked.map((item) => {
              const avatarUrl = item.avatarAsset?.resolvedUrl || item.avatarUrl;
              const isUnblocking = unblock.isPending && unblock.variables === item.userId;

              return (
                <UserRow
                  key={item.userId}
                  name={item.fullName}
                  subtitle={`${item.role} • ${item.locationCode}`}
                  avatarUrl={avatarUrl}
                  actions={
                    <button
                      type="button"
                      disabled={isUnblocking}
                      onClick={() =>
                        unblock.mutate(item.userId, {
                          onSuccess: () => setTab("discover"),
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {isUnblocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck2 className="h-4 w-4" />}
                      Bỏ chặn
                    </button>
                  }
                />
              );
            })}
            {filteredBlocked.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Bạn chưa chặn người dùng nào.
              </div>
            ) : null}
            {hasMoreBlocked ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => fetchNextBlocked()}
                  disabled={loadingMoreBlocked}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {loadingMoreBlocked ? "Đang tải..." : "Tải thêm"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
