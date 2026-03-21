import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../lib/api-client';

export interface UserProfile {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  role: string;
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

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const useUploadAvatar = () => {
  return useMutation({
    mutationFn: async (uri: string) => {
      let token = '';
      if (Platform.OS === 'web') {
        token = localStorage.getItem('auth_token') || '';
      } else {
        token = await SecureStore.getItemAsync('auth_token') || '';
      }

      const formData = new FormData();
      formData.append('target', 'USER');
      
      const filename = uri.split('/').pop() || 'avatar.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image`;

      formData.append('file', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        name: filename,
        type,
      } as any);

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'}/uploads/media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }
      const result = await response.json();
      return result.data?.url || result.url;
    },
  });
};
