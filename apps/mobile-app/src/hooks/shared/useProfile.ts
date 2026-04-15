import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../lib/api-client';
import { uploadMedia } from '@/services/api/upload.api';
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
}

export const useProfile = () => {
  return useQuery<UserProfile>({
    queryKey: ['profile', 'me'],
    queryFn: () => ApiClient.get<UserProfile>('/users/me'),
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<UserProfile>) => ApiClient.patch<UserProfile>('/users/me', data),
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
