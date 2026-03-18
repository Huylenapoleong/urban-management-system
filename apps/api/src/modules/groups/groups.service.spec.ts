import { ForbiddenException } from '@nestjs/common';
import type {
  StoredConversation,
  StoredGroup,
  StoredMembership,
  StoredReport,
} from '../../common/storage-records';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  const repository = {
    batchGet: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    queryByGsi1: jest.fn(),
    queryByIndex: jest.fn(),
    queryByPk: jest.fn(),
    scanAll: jest.fn(),
  };
  const authorizationService = {
    canCreateGroup: jest.fn(),
    canDeleteGroup: jest.fn(),
    canJoinGroup: jest.fn(),
    canManageGroup: jest.fn(),
    canReadGroup: jest.fn(),
  };
  const usersService = {
    getByIdOrThrow: jest.fn(),
  };
  const config = {
    dynamodbGroupsTableName: 'Groups',
    dynamodbMembershipsTableName: 'Memberships',
    dynamodbConversationsTableName: 'Conversations',
    dynamodbReportsTableName: 'Reports',
    dynamodbGroupsTypeLocationIndexName: 'GSI1-Type-Loc',
    dynamodbMembershipsUserGroupsIndexName: 'GSI1-UserGroups',
  };

  let service: GroupsService;

  const actor = {
    id: 'user-1',
    role: 'WARD_OFFICER' as const,
    locationCode: 'VN-79-760-26734',
    fullName: 'Ward Officer',
    status: 'ACTIVE' as const,
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  };

  const group: StoredGroup = {
    PK: 'GROUP#group-1',
    SK: 'METADATA',
    entityType: 'GROUP_METADATA',
    GSI1PK: 'TYPE#AREA#LOC#VN-79-760-26734',
    groupId: 'group-1',
    groupName: 'Area 1',
    groupType: 'AREA',
    locationCode: 'VN-79-760-26734',
    createdBy: 'user-1',
    description: 'Group description',
    memberCount: 2,
    isOfficial: true,
    deletedAt: null,
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  };

  const actorMembership: StoredMembership = {
    PK: 'GROUP#group-1',
    SK: 'MEMBER#user-1',
    entityType: 'GROUP_MEMBERSHIP',
    GSI1PK: 'USER#user-1',
    GSI1SK: 'GRP#group-1#2026-03-18T10:00:00.000Z',
    groupId: 'group-1',
    userId: 'user-1',
    roleInGroup: 'OWNER',
    joinedAt: '2026-03-18T10:00:00.000Z',
    deletedAt: null,
    updatedAt: '2026-03-18T10:00:00.000Z',
  };

  const memberTwo: StoredMembership = {
    ...actorMembership,
    SK: 'MEMBER#user-2',
    GSI1PK: 'USER#user-2',
    GSI1SK: 'GRP#group-1#2026-03-18T10:01:00.000Z',
    userId: 'user-2',
    roleInGroup: 'MEMBER',
  };

  const summary: StoredConversation = {
    PK: 'USER#user-1',
    SK: 'CONV#GRP#group-1#LAST#2026-03-18T10:05:00.000Z',
    entityType: 'CONVERSATION',
    GSI1PK: 'USER#user-1#TYPE#GRP',
    userId: 'user-1',
    conversationId: 'GRP#group-1',
    groupName: 'Area 1',
    lastMessagePreview: 'Hello',
    lastSenderName: 'Ward Officer',
    unreadCount: 0,
    isGroup: true,
    deletedAt: null,
    updatedAt: '2026-03-18T10:05:00.000Z',
    lastReadAt: '2026-03-18T10:05:00.000Z',
  };

  const linkedReport: StoredReport = {
    PK: 'REPORT#report-1',
    SK: 'METADATA',
    entityType: 'REPORT',
    GSI1PK: 'CAT#INFRA#LOC#VN-79-760-26734',
    GSI2PK: 'STATUS#NEW#LOC#VN-79-760-26734',
    reportId: 'report-1',
    userId: 'user-3',
    groupId: 'group-1',
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
    service = new GroupsService(
      repository as never,
      authorizationService as never,
      usersService as never,
      config as never,
    );
    repository.get.mockImplementation((tableName: string) => {
      if (tableName === 'Groups') {
        return group;
      }

      if (tableName === 'Memberships') {
        return actorMembership;
      }

      return undefined;
    });
    repository.queryByPk.mockResolvedValue([actorMembership, memberTwo]);
    repository.scanAll.mockImplementation((tableName: string) => {
      if (tableName === 'Conversations') {
        return [summary];
      }

      if (tableName === 'Reports') {
        return [linkedReport];
      }

      return [];
    });
  });

  it('soft deletes a group and cascades related records', async () => {
    authorizationService.canDeleteGroup.mockReturnValue(true);

    const result = await service.deleteGroup(actor, group.groupId);

    expect(repository.put).toHaveBeenCalledWith(
      'Groups',
      expect.objectContaining({
        groupId: group.groupId,
        deletedAt: expect.any(String),
        memberCount: 0,
      }),
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Memberships',
      expect.objectContaining({
        userId: actorMembership.userId,
        deletedAt: expect.any(String),
      }),
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Memberships',
      expect.objectContaining({
        userId: memberTwo.userId,
        deletedAt: expect.any(String),
      }),
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Conversations',
      expect.objectContaining({
        conversationId: 'GRP#group-1',
        deletedAt: expect.any(String),
      }),
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Reports',
      expect.objectContaining({
        reportId: linkedReport.reportId,
        groupId: undefined,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: group.groupId,
        deletedAt: expect.any(String),
        memberCount: 0,
      }),
    );
  });

  it('rejects group deletion when the actor is not allowed', async () => {
    authorizationService.canDeleteGroup.mockReturnValue(false);

    await expect(service.deleteGroup(actor, group.groupId)).rejects.toThrow(
      new ForbiddenException('You cannot delete this group.'),
    );
    expect(repository.put).not.toHaveBeenCalled();
  });
});
