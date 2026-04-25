import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  UserDirectoryItem,
  UserFriendItem,
  UserFriendRequestItem,
} from "@urban/shared-types";
import { ApiClient } from "../../lib/api-client";

export const useUserSearch = (query: string) => {
  return useQuery<UserDirectoryItem[]>({
    queryKey: ["users", "search", query],
    queryFn: () => ApiClient.get("/users/discover", { q: query }),
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useUserDiscovery = () => {
  return useQuery<UserDirectoryItem[]>({
    queryKey: ["users", "discover"],
    queryFn: () => ApiClient.get("/users/discover"),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useFriends = () => {
  return useQuery<UserFriendItem[]>({
    queryKey: ["users", "me", "friends"],
    queryFn: () => ApiClient.get("/users/me/friends"),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useFriendRequests = () => {
  return useQuery<UserFriendRequestItem[]>({
    queryKey: ["users", "me", "friend-requests"],
    queryFn: () => ApiClient.get("/users/me/friend-requests"),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useSendFriendRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      ApiClient.post(`/users/me/friends/${userId}/request`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["users", "me", "friend-requests"],
      });
      queryClient.invalidateQueries({ queryKey: ["users", "discover"] });
      queryClient.invalidateQueries({ queryKey: ["users", "search"] });
    },
  });
};

export const useAcceptFriendRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      ApiClient.post(`/users/me/friend-requests/${userId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", "me", "friends"] });
      queryClient.invalidateQueries({
        queryKey: ["users", "me", "friend-requests"],
      });
    },
  });
};

export const useRejectFriendRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      ApiClient.post(`/users/me/friend-requests/${userId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["users", "me", "friend-requests"],
      });
    },
  });
};

export const useRemoveFriend = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      ApiClient.delete(`/users/me/friends/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", "me", "friends"] });
    },
  });
};

export const useCancelFriendRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      ApiClient.delete(`/users/me/friend-requests/${userId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["users", "me", "friend-requests"],
      });
    },
  });
};

export const useUserPresence = (userId: string) => {
  return useQuery<{ isActive: boolean; lastSeenAt?: string }>({
    queryKey: ["users", userId, "presence"],
    queryFn: () => ApiClient.get(`/users/${userId}/presence`),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: false,
  });
};
