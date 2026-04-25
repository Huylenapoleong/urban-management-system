import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REPORT_STATUSES } from "@urban/shared-constants";
import type { ReportItem } from "@urban/shared-types";
import { ApiClient } from "../../lib/api-client";

type UseReportsParams = {
  status?: string;
  category?: string;
  assignedToMe?: boolean;
  locationCode?: string;
};

type LinkedConversation = {
  conversationId: string;
  conversationKey: string;
};

export type ReportAuditLog = {
  id?: string;
  summary: string;
  occurredAt: string;
  actorUserId: string;
};

export const useReports = ({
  status,
  category,
  assignedToMe,
  locationCode,
}: UseReportsParams = {}) => {
  return useQuery<ReportItem[]>({
    queryKey: ["reports", { status, category, assignedToMe, locationCode }],
    queryFn: async ({ signal }) => {
      const baseParams: Record<string, string | boolean> = {};
      if (assignedToMe) baseParams.assignedToMe = assignedToMe;
      if (locationCode) baseParams.locationCode = locationCode;

      if (status) {
        return ApiClient.get<ReportItem[]>(
          "/reports",
          {
            ...baseParams,
            status,
          },
          { signal },
        );
      }

      if (category) {
        return ApiClient.get<ReportItem[]>(
          "/reports",
          {
            ...baseParams,
            category,
          },
          { signal },
        );
      }

      if (!locationCode) {
        return ApiClient.get<ReportItem[]>("/reports", baseParams, { signal });
      }

      const resultSets = await Promise.all(
        REPORT_STATUSES.map((reportStatus) =>
          ApiClient.get<ReportItem[]>(
            "/reports",
            {
              ...baseParams,
              status: reportStatus,
            },
            { signal },
          ),
        ),
      );

      return resultSets
        .flat()
        .sort(
          (left: ReportItem, right: ReportItem) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        );
    },
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useReport = (id?: string) => {
  return useQuery<ReportItem>({
    queryKey: ["reports", id],
    queryFn: ({ signal }) =>
      ApiClient.get<ReportItem>(`/reports/${id}`, undefined, { signal }),
    enabled: !!id,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useUpdateReportStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportId,
      status,
      rejectReason,
    }: {
      reportId: string;
      status: string;
      rejectReason?: string;
    }) => {
      return ApiClient.post(`/reports/${reportId}/status`, {
        status,
        rejectReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
};

export const useAssignOfficer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportId,
      officerId,
    }: {
      reportId: string;
      officerId: string;
    }) => {
      return ApiClient.post(`/reports/${reportId}/assign`, { officerId });
    },
    onSuccess: (_, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: ["reports", reportId] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
};

export const useReportAudit = (reportId: string) => {
  return useQuery<ReportAuditLog[]>({
    queryKey: ["reports", reportId, "audit"],
    queryFn: ({ signal }) =>
      ApiClient.get<ReportAuditLog[]>(`/reports/${reportId}/audit`, undefined, {
        signal,
      }),
    enabled: !!reportId,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
};

export const useLinkedConversations = (reportId: string) => {
  return useQuery<LinkedConversation[]>({
    queryKey: ["reports", reportId, "conversations"],
    queryFn: ({ signal }) =>
      ApiClient.get<LinkedConversation[]>(
        `/reports/${reportId}/conversations`,
        undefined,
        { signal },
      ),
    enabled: !!reportId,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};
