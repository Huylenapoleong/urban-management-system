import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  discoverFriendCandidates,
  listMyFriendRequestsPage,
  listMyFriendsPage,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
} from "@/services/friends.api";

export const friendsQueryKeys = {
  all: ["friends"] as const,
  list: ["friends", "list"] as const,
  requests: ["friends", "requests"] as const,
  incoming: ["friends", "requests", "incoming"] as const,
  outgoing: ["friends", "requests", "outgoing"] as const,
  discover: (q: string) => ["friends", "discover", q] as const,
  friendsPage: (limit: number) => ["friends", "list", "page", limit] as const,
  incomingPage: (limit: number) => ["friends", "requests", "incoming", "page", limit] as const,
  outgoingPage: (limit: number) => ["friends", "requests", "outgoing", "page", limit] as const,
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message && message.trim()) {
      return message;
    }
  }
  return fallback;
}

export function useMyFriends(limit = 20) {
  return useInfiniteQuery({
    queryKey: friendsQueryKeys.friendsPage(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listMyFriendsPage({ limit, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });
}

export function useIncomingFriendRequests(limit = 20) {
  return useInfiniteQuery({
    queryKey: friendsQueryKeys.incomingPage(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listMyFriendRequestsPage({ direction: "INCOMING", limit, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });
}

export function useOutgoingFriendRequests(limit = 20) {
  return useInfiniteQuery({
    queryKey: friendsQueryKeys.outgoingPage(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listMyFriendRequestsPage({ direction: "OUTGOING", limit, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });
}

export function useFriendDiscover(searchTerm: string) {
  return useQuery({
    queryKey: friendsQueryKeys.discover(searchTerm),
    queryFn: () => discoverFriendCandidates({ q: searchTerm.trim(), limit: 30 }),
    staleTime: 30 * 1000,
  });
}

export function useFriendActions() {
  const queryClient = useQueryClient();

  const refreshFriendData = () => {
    queryClient.invalidateQueries({ queryKey: friendsQueryKeys.list });
    queryClient.invalidateQueries({ queryKey: friendsQueryKeys.incoming });
    queryClient.invalidateQueries({ queryKey: friendsQueryKeys.outgoing });
    queryClient.invalidateQueries({ queryKey: friendsQueryKeys.all });
  };

  const sendRequest = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => {
      toast.success("Da gui loi moi ket ban");
      refreshFriendData();
      queryClient.invalidateQueries({ queryKey: ["friends", "discover"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Khong the gui loi moi ket ban"));
    },
  });

  const acceptRequest = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => {
      toast.success("Da chap nhan loi moi");
      refreshFriendData();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Khong the chap nhan loi moi"));
    },
  });

  const rejectRequest = useMutation({
    mutationFn: rejectFriendRequest,
    onSuccess: () => {
      toast.success("Da tu choi loi moi");
      refreshFriendData();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Khong the tu choi loi moi"));
    },
  });

  const cancelRequest = useMutation({
    mutationFn: cancelFriendRequest,
    onSuccess: () => {
      toast.success("Da huy loi moi");
      refreshFriendData();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Khong the huy loi moi"));
    },
  });

  const unfriend = useMutation({
    mutationFn: removeFriend,
    onSuccess: () => {
      toast.success("Da xoa khoi danh sach ban be");
      refreshFriendData();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Khong the xoa ban be"));
    },
  });

  return {
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    unfriend,
  };
}
