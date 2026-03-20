import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type {
  StoredGroup,
  StoredGroupDeleteCleanupTask,
  StoredMembership,
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
    transactPut: jest.fn(),
    transactWrite: jest.fn(),
  };
  const authorizationService = {
    canCreateGroup: jest.fn(),
    canDeleteGroup: jest.fn(),
    canJoinGroup: jest.fn(),
    canManageGroup: jest.fn(),
    canReadGroup: jest.fn(),
  };
  const usersService = {
    getActiveByIdOrThrow: jest.fn(),
    getByIdOrThrow: jest.fn(),
  };
  const groupCleanupService = {
    buildGroupDeleteCleanupTask: jest.fn(),
    processTask: jest.fn(),
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

  const cleanupTask: StoredGroupDeleteCleanupTask = {
    PK: 'GROUP_DELETE_CLEANUP',
    SK: 'TASK#2026-03-18T11:00:00.000Z#group-1',
    entityType: 'GROUP_DELETE_CLEANUP_TASK',
    groupId: 'group-1',
    deletedAt: '2026-03-18T11:00:00.000Z',
    attempts: 0,
    createdAt: '2026-03-18T11:00:00.000Z',
    updatedAt: '2026-03-18T11:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GroupsService(
      repository as never,
      authorizationService as never,
      usersService as never,
      groupCleanupService as never,
      config as never,
    );
    repository.batchGet.mockResolvedValue([]);
    repository.queryByGsi1.mockResolvedValue([]);
    repository.transactPut.mockResolvedValue(undefined);
    repository.transactWrite.mockResolvedValue(undefined);
    usersService.getActiveByIdOrThrow.mockResolvedValue(undefined);
    usersService.getByIdOrThrow.mockResolvedValue(undefined);
    groupCleanupService.buildGroupDeleteCleanupTask.mockReturnValue(
      cleanupTask,
    );
    groupCleanupService.processTask.mockResolvedValue(undefined);
    repository.get.mockImplementation(
      (tableName: string, _pk: string, sk: string) => {
        if (tableName === 'Groups') {
          return group;
        }

        if (tableName === 'Memberships') {
          if (sk === actorMembership.SK) {
            return actorMembership;
          }

          if (sk === memberTwo.SK) {
            return memberTwo;
          }
        }

        return undefined;
      },
    );
    repository.queryByPk.mockResolvedValue([actorMembership, memberTwo]);
    repository.scanAll.mockResolvedValue([]);
  });

  it('marks a group deleted and schedules cleanup replay', async () => {
    authorizationService.canDeleteGroup.mockReturnValue(true);

    const result = await service.deleteGroup(actor, group.groupId);

    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'put',
        tableName: 'Groups',
        item: expect.objectContaining({
          groupId: group.groupId,
          deletedAt: expect.any(String),
          memberCount: 0,
        }),
      }),
      expect.objectContaining({
        kind: 'put',
        tableName: 'Groups',
        item: cleanupTask,
      }),
    ]);
    expect(groupCleanupService.processTask).toHaveBeenCalledWith(cleanupTask);
    expect(result).toEqual(
      expect.objectContaining({
        id: group.groupId,
        deletedAt: expect.any(String),
        memberCount: 0,
      }),
    );
  });

  it('returns deleted group metadata even when cleanup replay is deferred', async () => {
    authorizationService.canDeleteGroup.mockReturnValue(true);
    groupCleanupService.processTask.mockRejectedValueOnce(
      new Error('cleanup failed'),
    );

    await expect(service.deleteGroup(actor, group.groupId)).resolves.toEqual(
      expect.objectContaining({
        id: group.groupId,
        deletedAt: expect.any(String),
        memberCount: 0,
      }),
    );
    expect(repository.transactWrite).toHaveBeenCalledTimes(1);
  });

  it('rejects group deletion when the actor is not allowed', async () => {
    authorizationService.canDeleteGroup.mockReturnValue(false);

    await expect(service.deleteGroup(actor, group.groupId)).rejects.toThrow(
      new ForbiddenException('You cannot delete this group.'),
    );
    expect(repository.transactWrite).not.toHaveBeenCalled();
  });

  it('rejects assigning owner role via member management', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);

    await expect(
      service.manageMember(actor, group.groupId, 'user-2', {
        action: 'update',
        roleInGroup: 'OWNER',
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        'Owner role cannot be assigned via member management.',
      ),
    );
    expect(repository.put).not.toHaveBeenCalled();
  });

  it('rejects adding an already active membership', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);

    await expect(
      service.manageMember(actor, group.groupId, 'user-2', {
        action: 'add',
      }),
    ).rejects.toThrow(new BadRequestException('Membership already exists.'));
    expect(repository.transactWrite).not.toHaveBeenCalled();
  });

  it('ignores cleanup task records when listing groups via scan path', async () => {
    authorizationService.canReadGroup.mockReturnValue(true);
    repository.scanAll.mockResolvedValue([group, cleanupTask]);

    const result = await service.listGroups(actor, {});

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: group.groupId,
      }),
    );
  });
});
