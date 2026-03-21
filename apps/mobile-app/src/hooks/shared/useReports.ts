import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../lib/api-client';
import { REPORT_STATUSES, REPORT_CATEGORIES } from '@urban/shared-constants';
import type { ReportItem } from '@urban/shared-types'; // Giả sử user đã export/link package này.

export const useReports = ({
  status,
  category,
  assignedToMe,
}: {
  status?: string; // REPORT_STATUSES
  category?: string; // REPORT_CATEGORIES
  assignedToMe?: boolean;
} = {}) => {
  return useQuery<ReportItem[]>({
    queryKey: ['reports', { status, category, assignedToMe }],
    queryFn: () => {
      const params: any = {};
      if (status) params.status = status;
      if (category) params.category = category;
      if (assignedToMe) params.assignedToMe = assignedToMe;
      return ApiClient.get<ReportItem[]>('/reports', params);
    },
  });
};

export const useReport = (id?: string) => {
  return useQuery<ReportItem>({
    queryKey: ['reports', id],
    queryFn: () => ApiClient.get<ReportItem>(`/reports/${id}`),
    enabled: !!id,
  });
};

export const useUpdateReportStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, status, rejectReason }: { reportId: string, status: string, rejectReason?: string }) => {
      return ApiClient.post(`/reports/${reportId}/status`, { status, rejectReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};

export const useLinkedConversations = (reportId: string) => {
  return useQuery<{ conversationId: string; conversationKey: string }[]>({
    queryKey: ['reports', reportId, 'conversations'],
    queryFn: () => ApiClient.get<{ conversationId: string; conversationKey: string }[]>(`/reports/${reportId}/conversations`),
    enabled: !!reportId,
  });
};
