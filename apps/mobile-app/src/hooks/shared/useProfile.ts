import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../lib/api-client';
import { deleteMedia, uploadMedia } from '@/services/api/upload.api';
import type { UploadedAsset } from '@urban/shared-types';

export interface UserProfile {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  role: string;
  status?: string;
  locationCode?: string;
  avatarUrl?: string;
  avatarKey?: string;
  avatarAsset?: {
    key?: string;
    resolvedUrl?: string;
  };
  unit?: string;
}

export type UpdateProfileInput = Partial<
  Pick<UserProfile, 'fullName' | 'phone' | 'email' | 'locationCode' | 'unit' | 'avatarUrl'>
> & {
  avatarKey?: string;
};

export type AvatarLibraryItem = UploadedAsset & {
  isActive?: boolean;
};

export const useProfile = () => {
  return useQuery<UserProfile>({
    queryKey: ['profile', 'me'],
    queryFn: ({ signal }) => ApiClient.get<UserProfile>('/users/me', undefined, { signal }),
    staleTime: 3 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProfileInput) => ApiClient.patch<UserProfile>('/users/me', data),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', 'me'], data);
    },
  });
};

export const useUploadAvatar = () => {
  return useMutation({
    mutationFn: async (uri: string): Promise<UploadedAsset> => {
      return await uploadMedia({
        uri,
        target: 'AVATAR',
      });
    },
  });
};

export const useAvatarLibrary = () => {
  return useQuery<AvatarLibraryItem[]>({
    queryKey: ['uploads', 'avatar-library'],
    queryFn: ({ signal }) =>
      ApiClient.get<AvatarLibraryItem[]>('/uploads/media', { target: 'AVATAR' }, { signal }),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useSetCurrentAvatar = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (avatarKey: string) => ApiClient.patch<UserProfile>('/users/me', { avatarKey }),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', 'me'], data);
      queryClient.invalidateQueries({ queryKey: ['uploads', 'avatar-library'] });
    },
  });
};

export const useRemoveCurrentAvatar = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ApiClient.delete<UserProfile>('/users/me/avatar'),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', 'me'], data);
      queryClient.invalidateQueries({ queryKey: ['uploads', 'avatar-library'] });
    },
  });
};

export const useDeleteAvatarFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: string) => deleteMedia(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploads', 'avatar-library'] });
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
};
