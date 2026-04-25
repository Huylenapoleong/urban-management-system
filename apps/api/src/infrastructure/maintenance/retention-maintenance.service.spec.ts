import { ForbiddenException } from '@nestjs/common';
import { RetentionMaintenanceService } from './retention-maintenance.service';

describe('RetentionMaintenanceService', () => {
  const repository = {
    delete: jest.fn(),
    scanAll: jest.fn(),
  };
  const authorizationService = {
    isAdmin: jest.fn(),
  };
  const config = {
    dynamodbConversationsTableName: 'Conversations',
    dynamodbUsersTableName: 'Users',
    retentionChatOutboxDays: 7,
    retentionDeletedConversationSummaryDays: 30,
    retentionDismissedSessionDays: 14,
    retentionAuthEmailOtpDays: 2,
    retentionAuthRegisterDraftDays: 2,
    retentionExpiredSessionGraceDays: 30,
    retentionPushOutboxDays: 7,
    retentionRevokedRefreshTokenGraceDays: 30,
  };

  let service: RetentionMaintenanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    authorizationService.isAdmin.mockReturnValue(true);
    service = new RetentionMaintenanceService(
      repository as never,
      authorizationService as never,
      config as never,
    );
  });

  it('previews eligible retention candidates by category', async () => {
    repository.scanAll
      .mockResolvedValueOnce([
        {
          PK: 'USER#1',
          SK: 'SESSION#old',
          entityType: 'USER_REFRESH_SESSION',
          sessionScope: 'MOBILE_APP',
          dismissedAt: '2025-01-05T00:00:00.000Z',
          revokedAt: '2025-01-01T00:00:00.000Z',
          expiresAt: '2025-02-01T00:00:00.000Z',
        },
        {
          PK: 'USER#1',
          SK: 'REVOKED_REFRESH#old',
          entityType: 'USER_REFRESH_TOKEN_REVOCATION',
          expiresAt: '2025-01-01T00:00:00.000Z',
        },
        {
          PK: 'OUTBOX#PUSH#0',
          SK: 'EVENT#2025-01-01T00:00:00.000Z#1',
          entityType: 'PUSH_OUTBOX_EVENT',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          PK: 'USER#2',
          SK: 'PROFILE',
          entityType: 'USER_PROFILE',
          createdAt: '2026-03-18T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          PK: 'OUTBOX#CHAT#0',
          SK: 'EVENT#2025-01-01T00:00:00.000Z#1',
          entityType: 'CHAT_OUTBOX_EVENT',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          PK: 'USER#1',
          SK: 'CONV#abc',
          entityType: 'CONVERSATION',
          deletedAt: '2025-01-01T00:00:00.000Z',
        },
      ]);

    const result = await service.preview(buildAdminActor());

    expect(result.totalCandidates).toBe(5);
    expect(result.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'DISMISSED_REFRESH_SESSION',
          count: 1,
          tableName: 'Users',
        }),
        expect.objectContaining({
          category: 'EXPIRED_REFRESH_TOKEN_REVOCATION',
          count: 1,
          tableName: 'Users',
        }),
        expect.objectContaining({
          category: 'PUSH_OUTBOX_EVENT',
          count: 1,
          tableName: 'Users',
        }),
        expect.objectContaining({
          category: 'CHAT_OUTBOX_EVENT',
          count: 1,
          tableName: 'Conversations',
        }),
        expect.objectContaining({
          category: 'DELETED_CONVERSATION_SUMMARY',
          count: 1,
          tableName: 'Conversations',
        }),
      ]),
    );
  });

  it('purges eligible retention candidates', async () => {
    repository.scanAll
      .mockResolvedValueOnce([
        {
          PK: 'USER#1',
          SK: 'SESSION#old',
          entityType: 'USER_REFRESH_SESSION',
          sessionScope: 'MOBILE_APP',
          dismissedAt: '2025-01-05T00:00:00.000Z',
          revokedAt: '2025-01-01T00:00:00.000Z',
          expiresAt: '2025-02-01T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          PK: 'OUTBOX#CHAT#0',
          SK: 'EVENT#2025-01-01T00:00:00.000Z#1',
          entityType: 'CHAT_OUTBOX_EVENT',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ]);

    const result = await service.purge(buildAdminActor());

    expect(repository.delete).toHaveBeenCalledTimes(2);
    expect(repository.delete).toHaveBeenCalledWith(
      'Users',
      'USER#1',
      'SESSION#old',
    );
    expect(repository.delete).toHaveBeenCalledWith(
      'Conversations',
      'OUTBOX#CHAT#0',
      'EVENT#2025-01-01T00:00:00.000Z#1',
    );
    expect(result.totalDeleted).toBe(2);
  });

  it('rejects non-admin access', async () => {
    authorizationService.isAdmin.mockReturnValue(false);

    await expect(service.preview(buildCitizenActor())).rejects.toThrow(
      new ForbiddenException(
        'Only administrators can access retention maintenance.',
      ),
    );
    expect(repository.scanAll).not.toHaveBeenCalled();
  });
});

function buildAdminActor() {
  return {
    id: 'admin-1',
    fullName: 'Admin',
    locationCode: 'VN-HCM-BQ1-P01',
    role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z',
  };
}

function buildCitizenActor() {
  return {
    id: 'citizen-1',
    fullName: 'Citizen',
    locationCode: 'VN-HCM-BQ1-P01',
    role: 'CITIZEN' as const,
    status: 'ACTIVE' as const,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z',
  };
}
