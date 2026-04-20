import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../lib/api-client';
import { REPORT_STATUSES, REPORT_CATEGORIES } from '@urban/shared-constants';
import type { ReportItem } from '@urban/shared-types'; // Giả sử user đã export/link package này.

export const useReports = ({
  status,
  category,
  assignedToMe,
  locationCode,
}: {
  status?: string; // REPORT_STATUSES
  category?: string; // REPORT_CATEGORIES
  assignedToMe?: boolean;
  locationCode?: string;
} = {}) => {
  return useQuery<ReportItem[]>({
    queryKey: ['reports', { status, category, assignedToMe, locationCode }],
    queryFn: async ({ signal }) => {
      const baseParams: any = {};
      if (assignedToMe) baseParams.assignedToMe = assignedToMe;
      if (locationCode) baseParams.locationCode = locationCode;

      if (status) {
        return ApiClient.get<ReportItem[]>('/reports', {
          ...baseParams,
          status,
        }, { signal });
      }

      if (category) {
        return ApiClient.get<ReportItem[]>('/reports', {
          ...baseParams,
          category,
        }, { signal });
      }

      if (!locationCode) {
        return ApiClient.get<ReportItem[]>('/reports', baseParams, { signal });
      }

      const resultSets = await Promise.all(
        REPORT_STATUSES.map((reportStatus) =>
          ApiClient.get<ReportItem[]>('/reports', {
            ...baseParams,
            status: reportStatus,
          }, { signal }),
        ),
      );

      return resultSets
        .flat()
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        );
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useReport = (id?: string) => {
  return useQuery<ReportItem>({
    queryKey: ['reports', id],
    queryFn: ({ signal }) => ApiClient.get<ReportItem>(`/reports/${id}`, undefined, { signal }),
    enabled: !!id,
    staleTime: 60 * 1000,
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

export const useAssignOfficer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, officerId }: { reportId: string, officerId: string }) => {
      return ApiClient.post(`/reports/${reportId}/assign`, { officerId });
    },
    onSuccess: (_, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: ['reports', reportId] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};

export const useReportAudit = (reportId: string) => {
  return useQuery<any[]>({
    queryKey: ['reports', reportId, 'audit'],
    queryFn: ({ signal }) => ApiClient.get(`/reports/${reportId}/audit`, undefined, { signal }),
    enabled: !!reportId,
  });
};

export const useLinkedConversations = (reportId: string) => {
  return useQuery<{ conversationId: string; conversationKey: string }[]>({
    queryKey: ['reports', reportId, 'conversations'],
    queryFn: ({ signal }) =>
      ApiClient.get<{ conversationId: string; conversationKey: string }[]>(
        `/reports/${reportId}/conversations`,
        undefined,
        { signal },
      ),
    enabled: !!reportId,
  });
};
