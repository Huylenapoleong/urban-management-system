import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { StoredReport } from '../../common/storage-records';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const repository = {
    batchGet: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    queryByIndex: jest.fn(),
    scanAll: jest.fn(),
    transactPut: jest.fn(),
  };
  const authorizationService = {
    canCreateReport: jest.fn(),
    canDeleteReport: jest.fn(),
    canManageReport: jest.fn(),
    canReadReport: jest.fn(),
    canTransitionReport: jest.fn(),
    canUpdateOwnReport: jest.fn(),
  };
  const usersService = {
    getActiveByIdOrThrow: jest.fn(),
    getByIdOrThrow: jest.fn(),
  };
  const groupsService = {
    getGroup: jest.fn(),
  };
  const auditTrailService = {
    buildReportEvent: jest.fn(),
    listReportEvents: jest.fn(),
  };
  const pushNotificationService = {
    buildPushOutboxEvent: jest.fn(),
  };
  const config = {
    dynamodbReportsTableName: 'Reports',
    dynamodbReportsCategoryLocationIndexName: 'GSI1-CatLoc',
    dynamodbReportsStatusLocationIndexName: 'GSI2-StatusLoc',
  };

  let service: ReportsService;

  const actor = {
    id: 'user-1',
    role: 'CITIZEN' as const,
    locationCode: 'VN-79-760-26734',
    fullName: 'Citizen A',
    status: 'ACTIVE' as const,
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  };

  const report: StoredReport = {
    PK: 'REPORT#report-1',
    SK: 'METADATA',
    entityType: 'REPORT',
    GSI1PK: 'CAT#INFRA#LOC#VN-79-760-26734',
    GSI2PK: 'STATUS#NEW#LOC#VN-79-760-26734',
    reportId: 'report-1',
    userId: 'user-1',
    groupId: undefined,
    title: 'Broken streetlight',
    description: 'Lamp is out',
    category: 'INFRASTRUCTURE',
    locationCode: 'VN-79-760-26734',
    status: 'NEW',
    priority: 'MEDIUM',
    mediaUrls: [],
    assignedOfficerId: undefined,
    deletedAt: null,
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportsService(
      repository as never,
      authorizationService as never,
      usersService as never,
      groupsService as never,
      auditTrailService as never,
      pushNotificationService as never,
      config as never,
    );
    repository.get.mockResolvedValue(report);
    repository.transactPut.mockResolvedValue(undefined);
    usersService.getActiveByIdOrThrow.mockResolvedValue({
      userId: 'officer-1',
      fullName: 'Officer One',
      role: 'WARD_OFFICER',
      locationCode: report.locationCode,
      status: 'ACTIVE',
      deletedAt: null,
    });
    auditTrailService.buildReportEvent.mockReturnValue({
      PK: report.PK,
      SK: 'AUDIT#2026-03-18T10:00:00.000Z#01AUDIT',
      entityType: 'REPORT_AUDIT_EVENT',
      eventId: '01AUDIT',
      reportId: report.reportId,
      action: 'REPORT_UPDATED',
      actorUserId: actor.id,
      occurredAt: '2026-03-18T10:00:00.000Z',
      summary: 'audit',
    });
    auditTrailService.listReportEvents.mockResolvedValue({
      success: true,
      data: [],
      meta: { count: 0 },
    });
    pushNotificationService.buildPushOutboxEvent.mockReturnValue(undefined);
  });

  it('soft deletes a report when the actor is allowed', async () => {
    authorizationService.canDeleteReport.mockReturnValue(true);

    const result = await service.deleteReport(actor, report.reportId);

    expect(repository.transactPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Reports',
          item: expect.objectContaining({
            reportId: report.reportId,
            deletedAt: expect.any(String),
          }),
        }),
      ]),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: report.reportId,
        deletedAt: expect.any(String),
      }),
    );
  });

  it('rejects report deletion when the actor is not allowed', async () => {
    authorizationService.canDeleteReport.mockReturnValue(false);

    await expect(service.deleteReport(actor, report.reportId)).rejects.toThrow(
      new ForbiddenException('You cannot delete this report.'),
    );
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('filters and paginates reports by keyword, priority, assignee, and createdAt', async () => {
    const matchingReport: StoredReport = {
      ...report,
      assignedOfficerId: 'officer-1',
    };
    const olderMatchingReport: StoredReport = {
      ...report,
      PK: 'REPORT#report-2',
      reportId: 'report-2',
      title: 'Streetlight issue on Nguyen Hue',
      description: 'Streetlight still off',
      assignedOfficerId: 'officer-1',
      createdAt: '2026-03-18T09:00:00.000Z',
      updatedAt: '2026-03-18T09:00:00.000Z',
    };
    const ignoredReport: StoredReport = {
      ...report,
      PK: 'REPORT#report-3',
      reportId: 'report-3',
      title: 'Garbage collection needed',
      description: 'Environmental issue',
      priority: 'HIGH',
      assignedOfficerId: 'officer-2',
      category: 'ENVIRONMENT',
      createdAt: '2026-03-18T08:30:00.000Z',
      updatedAt: '2026-03-18T08:30:00.000Z',
    };

    authorizationService.canReadReport.mockReturnValue(true);
    repository.scanAll.mockResolvedValue([
      matchingReport,
      olderMatchingReport,
      ignoredReport,
    ]);

    const result = await service.listReports(actor, {
      priority: 'MEDIUM',
      assignedOfficerId: 'officer-1',
      q: 'streetlight',
      createdFrom: '2026-03-18T08:00:00.000Z',
      createdTo: '2026-03-18T11:00:00.000Z',
      limit: '1',
    });

    expect(result).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          id: 'report-1',
          assignedOfficerId: 'officer-1',
        }),
      ],
      meta: {
        count: 1,
        nextCursor: expect.any(String),
      },
    });
  });
  it('rejects assigning a report to an inactive officer', async () => {
    usersService.getActiveByIdOrThrow.mockRejectedValue(
      new BadRequestException('User account is not active.'),
    );

    await expect(
      service.assignReport(
        {
          ...actor,
          role: 'WARD_OFFICER',
        },
        report.reportId,
        {
          officerId: 'officer-locked',
        },
      ),
    ).rejects.toThrow(new BadRequestException('User account is not active.'));
  });

  it('rejects invalid report status transitions before writing', async () => {
    authorizationService.canTransitionReport.mockReturnValue(false);

    await expect(
      service.updateStatus(
        {
          ...actor,
          role: 'WARD_OFFICER',
        },
        report.reportId,
        {
          status: 'CLOSED',
        },
      ),
    ).rejects.toThrow(
      new ForbiddenException('You cannot update report status.'),
    );
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('maps report write conflicts to a retryable conflict error', async () => {
    authorizationService.canManageReport.mockReturnValue(true);
    authorizationService.canCreateReport.mockReturnValue(true);
    const transactionError = new Error('Transaction canceled');
    transactionError.cause = {
      name: 'TransactionCanceledException',
    };
    repository.transactPut.mockRejectedValue(transactionError);

    await expect(
      service.updateReport(
        {
          ...actor,
          role: 'WARD_OFFICER',
        },
        report.reportId,
        {
          title: 'Updated title',
        },
      ),
    ).rejects.toThrow(new ConflictException('Report changed. Please retry.'));
  });
});
