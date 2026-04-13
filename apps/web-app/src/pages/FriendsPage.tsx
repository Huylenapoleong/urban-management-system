import { useMemo, useState, type ReactNode } from "react";
import {
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
  useFriendDiscover,
  useIncomingFriendRequests,
  useMyFriends,
  useOutgoingFriendRequests,
} from "@/hooks/useFriendsData";

type FriendsTab = "discover" | "incoming" | "outgoing" | "friends";

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
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-10 w-10 border border-gray-100">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{name}</p>
          {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="ml-4 flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function tabClass(active: boolean): string {
  return active
    ? "rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
    : "rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200";
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

  const { sendRequest, acceptRequest, rejectRequest, cancelRequest, unfriend } = useFriendActions();

  const listLoading =
    (tab === "discover" && loadingDiscover) ||
    (tab === "incoming" && loadingIncoming) ||
    (tab === "outgoing" && loadingOutgoing) ||
    (tab === "friends" && loadingFriends);

  const discoverItems = useMemo(() => {
    return discover.filter((item) => containsFriendKeyword(item, searchText));
  }, [discover, searchText]);

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

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Bạn bè</h1>
            <p className="mt-1 text-sm text-slate-500">Quản lý lời mời kết bạn và danh sách bạn bè của bạn.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Tìm bạn..."
              className="pl-9"
            />
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={tabClass(tab === "discover")} onClick={() => setTab("discover")}>Đề xuất</button>
          <button type="button" className={tabClass(tab === "incoming")} onClick={() => setTab("incoming")}>Yêu cầu kết bạn ({incoming.length})</button>
          <button type="button" className={tabClass(tab === "outgoing")} onClick={() => setTab("outgoing")}>Đã gửi ({outgoing.length})</button>
          <button type="button" className={tabClass(tab === "friends")} onClick={() => setTab("friends")}>Bạn bè ({friends.length})</button>
        </div>

        {listLoading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
          </div>
        ) : null}

        {!listLoading && tab === "discover" ? (
          <div className="space-y-3">
            {discoverItems.map((item) => {
              const avatarUrl = item.avatarAsset?.resolvedUrl || item.avatarUrl;
              const busy = sendRequest.isPending && sendRequest.variables === item.userId;

              return (
                <UserRow
                  key={item.userId}
                  name={item.fullName}
                  subtitle={`${item.role} • ${item.locationCode}`}
                  avatarUrl={avatarUrl}
                  actions={
                    item.canSendFriendRequest ? (
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
                    ) : item.relationState === "OUTGOING_REQUEST" ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                        <Clock3 className="h-3 w-3" />
                        Dang cho chap nhan
                      </span>
                    ) : item.relationState === "INCOMING_REQUEST" ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">
                        <UserCheck2 className="h-3 w-3" />
                        Co yeu cau den
                      </span>
                    ) : null
                  }
                />
              );
            })}
            {discoverItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
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
                        Chap nhan
                      </button>
                      <button
                        type="button"
                        disabled={isAccepting || isRejecting}
                        onClick={() =>
                          rejectRequest.mutate(item.userId, {
                            onSuccess: () => setTab("discover"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundX className="h-4 w-4" />}
                        Tu choi
                      </button>
                    </>
                  }
                />
              );
            })}
            {filteredIncoming.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                Bạn không có lời mời kết bạn nào.
              </div>
            ) : null}
            {hasMoreIncoming ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => fetchNextIncoming()}
                  disabled={loadingMoreIncoming}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  {loadingMoreIncoming ? "Dang tai..." : "Tai them"}
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

              return (
                <UserRow
                  key={item.userId}
                  name={item.fullName}
                  subtitle={`${item.role} • ${item.locationCode}`}
                  avatarUrl={avatarUrl}
                  actions={
                    <button
                      type="button"
                      disabled={isCancelling}
                      onClick={() =>
                        cancelRequest.mutate(item.userId, {
                          onSuccess: () => setTab("discover"),
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                    >
                      {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundX className="h-4 w-4" />}
                      Huy yeu cau
                    </button>
                  }
                />
              );
            })}
            {filteredOutgoing.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                Bạn chưa gửi lời mời kết bạn nào.
              </div>
            ) : null}
            {hasMoreOutgoing ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => fetchNextOutgoing()}
                  disabled={loadingMoreOutgoing}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  {loadingMoreOutgoing ? "Dang tai..." : "Tai them"}
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
                        onClick={() =>
                          navigate("/chat", {
                            state: {
                              conversationId: `dm:${item.userId}`,
                              displayName: item.fullName,
                              avatarUrl,
                            },
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Nhan tin
                      </button>
                      <button
                        type="button"
                        disabled={isRemoving}
                        onClick={() =>
                          unfriend.mutate(item.userId, {
                            onSuccess: () => setTab("discover"),
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                        Huỷ kết bạn
                      </button>
                    </>
                  }
                />
              );
            })}
            {filteredFriends.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                Ban chưa có bạn bè nào.
              </div>
            ) : null}
            {hasMoreFriends ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => fetchNextFriends()}
                  disabled={loadingMoreFriends}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  {loadingMoreFriends ? "Dang tai..." : "Tai them"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
