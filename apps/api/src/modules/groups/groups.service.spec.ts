import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type {
  StoredGroup,
  StoredGroupBan,
  StoredGroupDeleteCleanupTask,
  StoredGroupInviteCodeLookup,
  StoredGroupInviteLink,
  StoredMembership,
} from '../../common/storage-records';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  const repository = {
    batchGet: jest.fn(),
    delete: jest.fn(),
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
    canChangeGroupMessagePolicy: jest.fn(),
    canCreateGroup: jest.fn(),
    canDeleteGroup: jest.fn(),
    canJoinGroup: jest.fn(),
    canManageGroup: jest.fn(),
    canRenameGroup: jest.fn(),
    canReadGroup: jest.fn(),
    canTransferGroupOwnership: jest.fn(),
  };
  const locationsService = {
    ensureKnownLocationCode: jest.fn((value: string) => value),
  };
  const usersService = {
    areFriends: jest.fn(),
    getActiveByIdOrThrow: jest.fn(),
    getByIdOrThrow: jest.fn(),
  };
  const groupCleanupService = {
    buildGroupDeleteCleanupTask: jest.fn(),
    processTask: jest.fn(),
  };
  const auditTrailService = {
    buildGroupEvent: jest.fn(),
    listGroupEvents: jest.fn(),
  };
  const chatRealtimeService = {
    emitToUser: jest.fn(),
    leaveConversationForUser: jest.fn(),
  };
  const conversationsService = {
    sendGroupSystemMessage: jest.fn(),
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
    messagePolicy: 'ALL_MEMBERS',
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
  const memberActorMembership: StoredMembership = {
    ...actorMembership,
    roleInGroup: 'MEMBER',
  };

  const memberTwo: StoredMembership = {
    ...actorMembership,
    SK: 'MEMBER#user-2',
    GSI1PK: 'USER#user-2',
    GSI1SK: 'GRP#group-1#2026-03-18T10:01:00.000Z',
    userId: 'user-2',
    roleInGroup: 'MEMBER',
  };
  const knownUsers = {
    'user-1': {
      id: 'user-1',
      fullName: 'Ward Officer',
    },
    'user-2': {
      id: 'user-2',
      fullName: 'Member Two',
    },
    'user-3': {
      id: 'user-3',
      fullName: 'Member Three',
    },
  } as const;

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
  let currentGroup: StoredGroup;
  let currentActorMembership: StoredMembership;
  let currentMemberTwo: StoredMembership;
  let currentBan: StoredGroupBan | undefined;
  let currentInviteLink: StoredGroupInviteLink | undefined;
  let currentInviteLookup: StoredGroupInviteCodeLookup | undefined;
  type GroupAuditInputMock = {
    action: string;
    actorUserId: string;
    groupId: string;
    targetUserId?: string;
    inviteId?: string;
    occurredAt?: string;
    summary: string;
    metadata?: Record<string, unknown>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    currentGroup = { ...group };
    currentActorMembership = { ...actorMembership };
    currentMemberTwo = { ...memberTwo };
    currentBan = undefined;
    currentInviteLink = undefined;
    currentInviteLookup = undefined;
    auditTrailService.buildGroupEvent.mockImplementation(
      (input: GroupAuditInputMock) => ({
        PK: `GROUP#${input.groupId}`,
        SK: 'AUDIT#2026-03-18T10:00:00.000Z#01AUDIT',
        entityType: 'GROUP_AUDIT_EVENT',
        eventId: '01AUDIT',
        groupId: input.groupId,
        targetUserId: input.targetUserId,
        inviteId: input.inviteId,
        action: input.action,
        actorUserId: input.actorUserId,
        occurredAt: input.occurredAt ?? '2026-03-18T10:00:00.000Z',
        summary: input.summary,
        metadata: input.metadata,
      }),
    );
    auditTrailService.listGroupEvents.mockResolvedValue({
      data: [],
      meta: { nextCursor: null },
    });
    service = new GroupsService(
      repository as never,
      authorizationService as never,
      locationsService as never,
      usersService as never,
      groupCleanupService as never,
      auditTrailService as never,
      chatRealtimeService as never,
      conversationsService as never,
      config as never,
    );
    repository.batchGet.mockResolvedValue([]);
    repository.delete.mockResolvedValue(undefined);
    repository.queryByGsi1.mockResolvedValue([]);
    repository.transactPut.mockResolvedValue(undefined);
    repository.transactWrite.mockResolvedValue(undefined);
    usersService.getActiveByIdOrThrow.mockImplementation(
      (userId: string) =>
        knownUsers[userId as keyof typeof knownUsers] ?? {
          id: userId,
          fullName: userId,
        },
    );
    usersService.getByIdOrThrow.mockImplementation((userId: string) => {
      return (
        knownUsers[userId as keyof typeof knownUsers] ?? {
          id: userId,
          fullName: userId,
        }
      );
    });
    usersService.areFriends.mockResolvedValue(true);
    groupCleanupService.buildGroupDeleteCleanupTask.mockReturnValue(
      cleanupTask,
    );
    groupCleanupService.processTask.mockResolvedValue(undefined);
    authorizationService.canChangeGroupMessagePolicy.mockReturnValue(true);
    authorizationService.canRenameGroup.mockReturnValue(true);
    authorizationService.canTransferGroupOwnership.mockReturnValue(true);
    conversationsService.sendGroupSystemMessage.mockResolvedValue({
      id: 'msg-system',
    });
    repository.get.mockImplementation(
      (tableName: string, _pk: string, sk: string) => {
        if (tableName === 'Groups') {
          if (_pk === 'GROUP_INVITE_CODE#invite-code' && sk === 'LOOKUP') {
            return currentInviteLookup;
          }

          if (_pk === 'GROUP#group-1' && sk === 'INVITE#invite-1') {
            return currentInviteLink;
          }

          return currentGroup;
        }

        if (tableName === 'Memberships') {
          if (sk === 'BAN#user-1') {
            return currentBan?.userId === 'user-1' ? currentBan : undefined;
          }

          if (sk === 'BAN#user-2') {
            return currentBan?.userId === 'user-2' ? currentBan : undefined;
          }

          if (sk === 'BAN#user-3') {
            return currentBan?.userId === 'user-3' ? currentBan : undefined;
          }

          if (sk === actorMembership.SK) {
            return currentActorMembership;
          }

          if (sk === memberTwo.SK) {
            return currentMemberTwo;
          }
        }

        return undefined;
      },
    );
    repository.queryByPk.mockImplementation((tableName: string) => {
      if (tableName === 'Memberships') {
        return [currentActorMembership, currentMemberTwo].concat(
          currentBan ? [currentBan as never] : [],
        );
      }

      return [];
    });
    repository.scanAll.mockResolvedValue([]);
  });

  it('marks a group deleted and schedules cleanup replay', async () => {
    authorizationService.canDeleteGroup.mockReturnValue(true);

    const result = await service.deleteGroup(actor, group.groupId);

    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
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
        expect.objectContaining({
          kind: 'put',
          tableName: 'Groups',
          item: expect.objectContaining({
            entityType: 'GROUP_AUDIT_EVENT',
            action: 'GROUP_DELETED',
          }),
        }),
      ]),
    );
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

  it('normalizes the legacy officer role input to deputy when updating a member', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);

    const result = await service.manageMember(actor, group.groupId, 'user-2', {
      action: 'update',
      roleInGroup: 'OFFICER',
    });

    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'put',
          tableName: 'Memberships',
          item: expect.objectContaining({
            userId: 'user-2',
            roleInGroup: 'DEPUTY',
          }),
        }),
      ]),
    );
    expect(result.roleInGroup).toBe('DEPUTY');
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

  it('ignores cleanup task records when listing groups via fallback scan path', async () => {
    authorizationService.canReadGroup.mockReturnValue(true);
    repository.scanAll.mockResolvedValue([group, cleanupTask]);
    const provinceActor = {
      ...actor,
      role: 'PROVINCE_OFFICER' as const,
    };

    const result = await service.listGroups(provinceActor, {});

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: group.groupId,
      }),
    );
  });

  it('uses the location/type index instead of scanAll for ward-scope group browse', async () => {
    authorizationService.canReadGroup.mockReturnValue(true);
    repository.queryByIndex.mockResolvedValue([
      {
        PK: group.PK,
        SK: group.SK,
      },
    ]);
    repository.batchGet.mockResolvedValue([group]);

    const result = await service.listGroups(actor, {});

    expect(repository.scanAll).not.toHaveBeenCalled();
    expect(repository.queryByIndex).toHaveBeenCalledTimes(3);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: group.groupId,
      }),
    );
  });

  it('uses the location/type index when a concrete location filter is provided', async () => {
    authorizationService.canReadGroup.mockReturnValue(true);
    repository.queryByIndex.mockResolvedValue([
      {
        PK: group.PK,
        SK: group.SK,
      },
    ]);
    repository.batchGet.mockResolvedValue([group]);

    const result = await service.listGroups(actor, {
      locationCode: group.locationCode,
      groupType: 'AREA',
    });

    expect(repository.scanAll).not.toHaveBeenCalled();
    expect(repository.queryByIndex).toHaveBeenCalledWith(
      'Groups',
      'GSI1-Type-Loc',
      'GSI1PK',
      'createdAt',
      `TYPE#AREA#LOC#${group.locationCode}`,
    );
    expect(result.data).toHaveLength(1);
  });

  it('transfers ownership to another active member and allows the previous owner to leave afterwards', async () => {
    repository.transactWrite.mockImplementationOnce((items: unknown) => {
      type TransactionPut = {
        kind: 'put';
        tableName: string;
        item: Record<string, unknown>;
      };

      const transactionItems = items as TransactionPut[];
      const ownerPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Memberships' &&
          'userId' in item.item &&
          item.item.userId === 'user-1',
      );
      const targetPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Memberships' &&
          'userId' in item.item &&
          item.item.userId === 'user-2',
      );
      const groupPut = transactionItems.find(
        (item) => item.kind === 'put' && item.tableName === 'Groups',
      );

      if (ownerPut && 'userId' in ownerPut.item) {
        currentActorMembership = ownerPut.item as unknown as StoredMembership;
      }

      if (targetPut && 'userId' in targetPut.item) {
        currentMemberTwo = targetPut.item as unknown as StoredMembership;
      }

      if (groupPut && 'groupId' in groupPut.item) {
        currentGroup = groupPut.item as unknown as StoredGroup;
      }
    });
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (tableName === 'Memberships') {
          return [currentActorMembership, currentMemberTwo];
        }

        if (
          tableName === 'Conversations' &&
          pk === 'USER#user-1' &&
          options?.beginsWith === 'CONV#GRP#group-1#LAST#'
        ) {
          return [
            {
              PK: 'USER#user-1',
              SK: 'CONV#GRP#group-1#LAST#2026-03-18T10:30:00.000Z',
              entityType: 'CONVERSATION',
              userId: 'user-1',
              conversationId: 'GRP#group-1',
              groupName: 'Area 1',
              lastMessagePreview: 'Hello',
              lastSenderName: 'Ward Officer',
              unreadCount: 0,
              isGroup: true,
              deletedAt: null,
              updatedAt: '2026-03-18T10:30:00.000Z',
            },
          ];
        }

        return [];
      },
    );

    const leaveResult = await service.leaveGroup(actor, group.groupId, {
      successorUserId: 'user-2',
    });

    expect(leaveResult).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        roleInGroup: 'OWNER',
        deletedAt: expect.any(String),
      }),
    );
    expect(currentActorMembership.deletedAt).toEqual(expect.any(String));
    expect(currentMemberTwo.roleInGroup).toBe('OWNER');
    expect(conversationsService.sendGroupSystemMessage).toHaveBeenCalledWith(
      actor,
      group.groupId,
      expect.arrayContaining(['user-2']),
      expect.stringContaining(
        'Ownership was transferred from Ward Officer to Member Two.',
      ),
    );
  });

  it('transfers ownership independently while keeping the previous owner in the group as deputy', async () => {
    repository.transactWrite.mockImplementationOnce((items: unknown) => {
      type TransactionPut = {
        kind: 'put';
        tableName: string;
        item: Record<string, unknown>;
      };

      const transactionItems = items as TransactionPut[];
      const previousOwnerPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Memberships' &&
          'userId' in item.item &&
          item.item.userId === 'user-1',
      );
      const nextOwnerPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Memberships' &&
          'userId' in item.item &&
          item.item.userId === 'user-2',
      );
      const groupPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Groups' &&
          item.item.entityType === 'GROUP_METADATA',
      );

      if (previousOwnerPut) {
        currentActorMembership =
          previousOwnerPut.item as unknown as StoredMembership;
      }

      if (nextOwnerPut) {
        currentMemberTwo = nextOwnerPut.item as unknown as StoredMembership;
      }

      if (groupPut) {
        currentGroup = groupPut.item as unknown as StoredGroup;
      }
    });

    const result = await service.transferOwnership(actor, group.groupId, {
      targetUserId: 'user-2',
    });

    expect(result).toEqual(
      expect.objectContaining({
        groupId: group.groupId,
        previousOwnerUserId: 'user-1',
        previousOwnerRoleInGroup: 'DEPUTY',
        ownerUserId: 'user-2',
        transferredAt: expect.any(String),
      }),
    );
    expect(currentActorMembership.roleInGroup).toBe('DEPUTY');
    expect(currentActorMembership.deletedAt).toBeNull();
    expect(currentMemberTwo.roleInGroup).toBe('OWNER');
    expect(conversationsService.sendGroupSystemMessage).toHaveBeenCalledWith(
      actor,
      group.groupId,
      expect.arrayContaining(['user-1', 'user-2']),
      expect.stringContaining(
        'Ownership was transferred from Ward Officer to Member Two.',
      ),
    );
  });

  it('requires the owner to choose another active member before leaving', async () => {
    await expect(service.leaveGroup(actor, group.groupId, {})).rejects.toThrow(
      new BadRequestException(
        'Owner must choose another active member as the new owner before leaving.',
      ),
    );
  });

  it('rejects owner leave when successor points to the owner themselves', async () => {
    await expect(
      service.leaveGroup(actor, group.groupId, {
        successorUserId: 'user-1',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Owner must choose another active member as the new owner before leaving.',
      ),
    );
  });

  it('normalizes legacy officer memberships to deputy in responses', async () => {
    authorizationService.canReadGroup.mockReturnValue(true);
    repository.queryByPk.mockResolvedValue([
      actorMembership,
      {
        ...memberTwo,
        roleInGroup: 'OFFICER' as never,
      },
    ]);

    const result = await service.listMembers(actor, group.groupId);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'user-2',
          roleInGroup: 'DEPUTY',
        }),
      ]),
    );
  });

  it('blocks citizens from adding non-friend users to groups', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    usersService.areFriends.mockResolvedValue(false);

    await expect(
      service.manageMember(
        {
          ...actor,
          role: 'CITIZEN',
        },
        group.groupId,
        'user-3',
        {
          action: 'add',
        },
      ),
    ).rejects.toThrow(
      new ForbiddenException('Citizens can only add their friends to groups.'),
    );
    expect(repository.transactWrite).not.toHaveBeenCalled();
  });

  it('adds a deputy through the explicit add-member flow', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);

    const result = await service.addMember(actor, group.groupId, {
      userId: 'user-3',
      roleInGroup: 'DEPUTY',
    });

    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'put',
          tableName: 'Memberships',
          item: expect.objectContaining({
            userId: 'user-3',
            roleInGroup: 'DEPUTY',
          }),
        }),
      ]),
    );
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-3',
        roleInGroup: 'DEPUTY',
      }),
    );
    expect(conversationsService.sendGroupSystemMessage).toHaveBeenCalledWith(
      actor,
      group.groupId,
      expect.arrayContaining(['user-1', 'user-2']),
      expect.stringContaining('added Member Three to the group'),
    );
  });

  it('updates a member role through the explicit role endpoint flow', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);

    const result = await service.updateMemberRole(
      actor,
      group.groupId,
      'user-2',
      {
        roleInGroup: 'DEPUTY',
      },
    );

    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'put',
          tableName: 'Memberships',
          item: expect.objectContaining({
            userId: 'user-2',
            roleInGroup: 'DEPUTY',
          }),
        }),
      ]),
    );
    expect(result.roleInGroup).toBe('DEPUTY');
  });

  it('defaults new groups to the ALL_MEMBERS message policy', async () => {
    authorizationService.canCreateGroup.mockReturnValue(true);

    const result = await service.createGroup(actor, {
      groupName: 'New group',
      groupType: 'PRIVATE',
      locationCode: actor.locationCode,
    });

    expect(repository.transactPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Groups',
          item: expect.objectContaining({
            messagePolicy: 'ALL_MEMBERS',
          }),
        }),
      ]),
    );
    expect(result.messagePolicy).toBe('ALL_MEMBERS');
  });

  it('allows the owner to update the group message policy', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    authorizationService.canCreateGroup.mockReturnValue(true);
    authorizationService.canChangeGroupMessagePolicy.mockReturnValue(true);

    const result = await service.updateGroup(actor, group.groupId, {
      messagePolicy: 'OWNER_AND_DEPUTIES',
    });

    expect(repository.transactPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Groups',
          item: expect.objectContaining({
            messagePolicy: 'OWNER_AND_DEPUTIES',
          }),
        }),
        expect.objectContaining({
          tableName: 'Groups',
          item: expect.objectContaining({
            entityType: 'GROUP_AUDIT_EVENT',
            action: 'GROUP_UPDATED',
          }),
        }),
      ]),
    );
    expect(result.messagePolicy).toBe('OWNER_AND_DEPUTIES');
    expect(conversationsService.sendGroupSystemMessage).toHaveBeenCalledWith(
      actor,
      group.groupId,
      expect.arrayContaining(['user-1', 'user-2']),
      expect.stringContaining('changed message permissions'),
    );
  });

  it('blocks deputies from changing the group message policy', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    authorizationService.canChangeGroupMessagePolicy.mockReturnValue(false);
    currentActorMembership = {
      ...currentActorMembership,
      roleInGroup: 'DEPUTY',
    };

    await expect(
      service.updateGroup(actor, group.groupId, {
        messagePolicy: 'OWNER_ONLY',
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        'Only the owner can change the group message policy.',
      ),
    );
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('blocks non-owners from renaming the group', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    authorizationService.canCreateGroup.mockReturnValue(true);
    authorizationService.canRenameGroup.mockReturnValue(false);
    currentActorMembership = {
      ...currentActorMembership,
      roleInGroup: 'DEPUTY',
    };

    await expect(
      service.updateGroup(actor, group.groupId, {
        groupName: 'Renamed group',
      }),
    ).rejects.toThrow(
      new ForbiddenException('Only the owner can rename the group.'),
    );
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('propagates a renamed group name to existing conversation summaries', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    authorizationService.canCreateGroup.mockReturnValue(true);
    authorizationService.canRenameGroup.mockReturnValue(true);

    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (tableName === 'Memberships') {
          return [currentActorMembership, currentMemberTwo];
        }

        if (
          tableName === 'Conversations' &&
          options?.beginsWith === 'CONV#GRP#group-1#LAST#'
        ) {
          return [
            {
              PK: pk,
              SK: 'CONV#GRP#group-1#LAST#2026-03-18T10:31:00.000Z',
              entityType: 'CONVERSATION',
              GSI1PK: `${pk}#TYPE#GRP`,
              userId: pk.replace('USER#', ''),
              conversationId: 'GRP#group-1',
              groupName: 'Area 1',
              lastMessagePreview: 'Hello',
              lastSenderName: 'Ward Officer',
              unreadCount: 0,
              isGroup: true,
              deletedAt: null,
              updatedAt: '2026-03-18T10:31:00.000Z',
            },
          ];
        }

        return [];
      },
    );

    const result = await service.updateGroup(actor, group.groupId, {
      groupName: 'Area 1 Renamed',
    });

    expect(result.groupName).toBe('Area 1 Renamed');
    expect(repository.put).toHaveBeenCalledWith(
      'Conversations',
      expect.objectContaining({
        conversationId: 'GRP#group-1',
        groupName: 'Area 1 Renamed',
      }),
    );
    expect(chatRealtimeService.emitToUser).toHaveBeenCalledWith(
      'user-2',
      'conversation.updated',
      expect.objectContaining({
        conversationId: 'group:group-1',
        conversationKey: 'GRP#group-1',
        reason: 'conversation.metadata.updated',
        summary: expect.objectContaining({
          conversationId: 'group:group-1',
          groupName: 'Area 1 Renamed',
        }),
      }),
    );
    expect(conversationsService.sendGroupSystemMessage).toHaveBeenCalledWith(
      actor,
      group.groupId,
      expect.arrayContaining(['user-1', 'user-2']),
      expect.stringContaining('renamed the group to Area 1 Renamed'),
    );
  });

  it('bans an active member and removes their group chat access immediately', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    repository.transactWrite.mockImplementationOnce((items: unknown) => {
      type TransactionPut = {
        kind: 'put';
        tableName: string;
        item: Record<string, unknown>;
      };

      const transactionItems = items as TransactionPut[];
      const banPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Memberships' &&
          item.item.entityType === 'GROUP_BAN',
      );
      const memberPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Memberships' &&
          item.item.entityType === 'GROUP_MEMBERSHIP' &&
          item.item.userId === 'user-2',
      );
      const groupPut = transactionItems.find(
        (item) => item.kind === 'put' && item.tableName === 'Groups',
      );

      if (banPut) {
        currentBan = banPut.item as unknown as StoredGroupBan;
      }

      if (memberPut) {
        currentMemberTwo = memberPut.item as unknown as StoredMembership;
      }

      if (groupPut) {
        currentGroup = groupPut.item as unknown as StoredGroup;
      }
    });
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === 'USER#user-2' &&
          options?.beginsWith === 'CONV#GRP#group-1#LAST#'
        ) {
          return [
            {
              PK: 'USER#user-2',
              SK: 'CONV#GRP#group-1#LAST#2026-03-18T10:31:00.000Z',
              entityType: 'CONVERSATION',
              GSI1PK: 'USER#user-2#TYPE#GRP',
              userId: 'user-2',
              conversationId: 'GRP#group-1',
              groupName: 'Area 1',
              lastMessagePreview: 'Hello',
              lastSenderName: 'Ward Officer',
              unreadCount: 0,
              isGroup: true,
              deletedAt: null,
              updatedAt: '2026-03-18T10:31:00.000Z',
            },
          ];
        }

        if (tableName === 'Memberships') {
          return [currentActorMembership, currentMemberTwo].concat(
            currentBan ? [currentBan as never] : [],
          );
        }

        if (tableName === 'Groups') {
          return currentInviteLink ? [currentInviteLink] : [];
        }

        return [];
      },
    );

    const result = await service.banMember(actor, group.groupId, 'user-2', {
      reason: 'Spam',
    });

    expect(result).toEqual(
      expect.objectContaining({
        groupId: 'group-1',
        userId: 'user-2',
        reason: 'Spam',
      }),
    );
    expect(currentMemberTwo.deletedAt).toEqual(expect.any(String));
    expect(chatRealtimeService.leaveConversationForUser).toHaveBeenCalledWith(
      'user-2',
      'GRP#group-1',
    );
    expect(chatRealtimeService.emitToUser).toHaveBeenCalledWith(
      'user-2',
      'conversation.removed',
      expect.objectContaining({
        conversationId: 'group:group-1',
      }),
    );
  });

  it('prevents banned users from joining a group again', async () => {
    currentActorMembership = {
      ...currentActorMembership,
      deletedAt: '2026-03-18T10:21:00.000Z',
      updatedAt: '2026-03-18T10:21:00.000Z',
    };
    currentBan = {
      PK: 'GROUP#group-1',
      SK: 'BAN#user-1',
      entityType: 'GROUP_BAN',
      groupId: 'group-1',
      userId: 'user-1',
      bannedByUserId: 'user-2',
      reason: 'Spam',
      expiresAt: null,
      createdAt: '2026-03-18T10:20:00.000Z',
      updatedAt: '2026-03-18T10:20:00.000Z',
    };

    await expect(service.joinGroup(actor, group.groupId)).rejects.toThrow(
      new ForbiddenException('You are banned from this group.'),
    );
  });

  it('prevents managers from adding a banned user back into the group', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    currentBan = {
      PK: 'GROUP#group-1',
      SK: 'BAN#user-3',
      entityType: 'GROUP_BAN',
      groupId: 'group-1',
      userId: 'user-3',
      bannedByUserId: 'user-1',
      reason: 'Spam',
      expiresAt: null,
      createdAt: '2026-03-18T10:20:00.000Z',
      updatedAt: '2026-03-18T10:20:00.000Z',
    };

    await expect(
      service.addMember(actor, group.groupId, {
        userId: 'user-3',
      }),
    ).rejects.toThrow(
      new ForbiddenException('This user is banned from the group.'),
    );
  });

  it('removes an active group ban', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    currentBan = {
      PK: 'GROUP#group-1',
      SK: 'BAN#user-2',
      entityType: 'GROUP_BAN',
      groupId: 'group-1',
      userId: 'user-2',
      bannedByUserId: 'user-1',
      reason: 'Spam',
      expiresAt: null,
      createdAt: '2026-03-18T10:20:00.000Z',
      updatedAt: '2026-03-18T10:20:00.000Z',
    };

    const result = await service.unbanMember(actor, group.groupId, 'user-2');

    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'delete',
          tableName: 'Memberships',
          key: {
            PK: 'GROUP#group-1',
            SK: 'BAN#user-2',
          },
        }),
        expect.objectContaining({
          kind: 'put',
          tableName: 'Groups',
          item: expect.objectContaining({
            entityType: 'GROUP_AUDIT_EVENT',
            action: 'GROUP_MEMBER_UNBANNED',
          }),
        }),
      ]),
    );
    expect(conversationsService.sendGroupSystemMessage).toHaveBeenCalledWith(
      actor,
      group.groupId,
      expect.arrayContaining(['user-1', 'user-2']),
      expect.stringContaining('unbanned Member Two'),
    );
    expect(result).toEqual(
      expect.objectContaining({
        groupId: 'group-1',
        userId: 'user-2',
      }),
    );
  });

  it('creates a new invite link with a code lookup record', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    repository.transactWrite.mockImplementationOnce((items: unknown) => {
      type TransactionPut = {
        kind: 'put';
        tableName: string;
        item: Record<string, unknown>;
      };

      const transactionItems = items as TransactionPut[];
      const invitePut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Groups' &&
          item.item.entityType === 'GROUP_INVITE_LINK',
      );
      const lookupPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Groups' &&
          item.item.entityType === 'GROUP_INVITE_CODE_LOOKUP',
      );

      currentInviteLink = invitePut?.item as unknown as StoredGroupInviteLink;
      currentInviteLookup =
        lookupPut?.item as unknown as StoredGroupInviteCodeLookup;
    });

    const result = await service.createInviteLink(actor, group.groupId, {
      maxUses: 10,
    });

    expect(result).toEqual(
      expect.objectContaining({
        groupId: 'group-1',
        maxUses: 10,
        usedCount: 0,
      }),
    );
    expect(currentInviteLookup).toEqual(
      expect.objectContaining({
        groupId: 'group-1',
        inviteId: result.inviteId,
      }),
    );
  });

  it('redeems an active invite link into a new membership', async () => {
    currentActorMembership = {
      ...currentActorMembership,
      deletedAt: '2026-03-18T10:21:00.000Z',
      updatedAt: '2026-03-18T10:21:00.000Z',
    };
    currentInviteLookup = {
      PK: 'GROUP_INVITE_CODE#invite-code',
      SK: 'LOOKUP',
      entityType: 'GROUP_INVITE_CODE_LOOKUP',
      code: 'invite-code',
      groupId: 'group-1',
      inviteId: 'invite-1',
      createdAt: '2026-03-18T10:20:00.000Z',
      updatedAt: '2026-03-18T10:20:00.000Z',
    };
    currentInviteLink = {
      PK: 'GROUP#group-1',
      SK: 'INVITE#invite-1',
      entityType: 'GROUP_INVITE_LINK',
      groupId: 'group-1',
      inviteId: 'invite-1',
      code: 'invite-code',
      createdByUserId: 'user-1',
      expiresAt: null,
      maxUses: 10,
      usedCount: 0,
      disabledAt: null,
      createdAt: '2026-03-18T10:20:00.000Z',
      updatedAt: '2026-03-18T10:20:00.000Z',
    };
    repository.transactWrite.mockImplementationOnce((items: unknown) => {
      type TransactionPut = {
        kind: 'put';
        tableName: string;
        item: Record<string, unknown>;
      };

      const transactionItems = items as TransactionPut[];
      const membershipPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Memberships' &&
          item.item.entityType === 'GROUP_MEMBERSHIP' &&
          item.item.userId === 'user-1',
      );
      const groupPut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Groups' &&
          item.item.entityType === 'GROUP_METADATA',
      );
      const invitePut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Groups' &&
          item.item.entityType === 'GROUP_INVITE_LINK',
      );

      if (membershipPut) {
        currentActorMembership =
          membershipPut.item as unknown as StoredMembership;
      }

      if (groupPut) {
        currentGroup = groupPut.item as unknown as StoredGroup;
      }

      if (invitePut) {
        currentInviteLink = invitePut.item as unknown as StoredGroupInviteLink;
      }
    });

    const result = await service.joinGroupByInvite(actor, 'invite-code');

    expect(result).toEqual(
      expect.objectContaining({
        groupId: 'group-1',
        userId: 'user-1',
        deletedAt: null,
      }),
    );
    expect(currentInviteLink?.usedCount).toBe(1);
  });

  it('rejects expired invite links', async () => {
    currentActorMembership = {
      ...currentActorMembership,
      deletedAt: '2026-03-18T10:21:00.000Z',
      updatedAt: '2026-03-18T10:21:00.000Z',
    };
    currentInviteLookup = {
      PK: 'GROUP_INVITE_CODE#invite-code',
      SK: 'LOOKUP',
      entityType: 'GROUP_INVITE_CODE_LOOKUP',
      code: 'invite-code',
      groupId: 'group-1',
      inviteId: 'invite-1',
      createdAt: '2026-03-18T10:20:00.000Z',
      updatedAt: '2026-03-18T10:20:00.000Z',
    };
    currentInviteLink = {
      PK: 'GROUP#group-1',
      SK: 'INVITE#invite-1',
      entityType: 'GROUP_INVITE_LINK',
      groupId: 'group-1',
      inviteId: 'invite-1',
      code: 'invite-code',
      createdByUserId: 'user-1',
      expiresAt: '2026-03-18T10:00:00.000Z',
      maxUses: 10,
      usedCount: 0,
      disabledAt: null,
      createdAt: '2026-03-18T09:20:00.000Z',
      updatedAt: '2026-03-18T09:20:00.000Z',
    };

    await expect(
      service.joinGroupByInvite(actor, 'invite-code'),
    ).rejects.toThrow(new ForbiddenException('Invite link has expired.'));
  });

  it('rejects expired invite links even when the actor is already an active member', async () => {
    currentInviteLookup = {
      PK: 'GROUP_INVITE_CODE#invite-code',
      SK: 'LOOKUP',
      entityType: 'GROUP_INVITE_CODE_LOOKUP',
      code: 'invite-code',
      groupId: 'group-1',
      inviteId: 'invite-1',
      createdAt: '2026-03-18T10:20:00.000Z',
      updatedAt: '2026-03-18T10:20:00.000Z',
    };
    currentInviteLink = {
      PK: 'GROUP#group-1',
      SK: 'INVITE#invite-1',
      entityType: 'GROUP_INVITE_LINK',
      groupId: 'group-1',
      inviteId: 'invite-1',
      code: 'invite-code',
      createdByUserId: 'user-1',
      expiresAt: '2026-03-18T10:00:00.000Z',
      maxUses: 10,
      usedCount: 0,
      disabledAt: null,
      createdAt: '2026-03-18T09:20:00.000Z',
      updatedAt: '2026-03-18T09:20:00.000Z',
    };

    await expect(
      service.joinGroupByInvite(actor, 'invite-code'),
    ).rejects.toThrow(new ForbiddenException('Invite link has expired.'));
  });

  it('rejects exhausted invite links', async () => {
    currentActorMembership = {
      ...currentActorMembership,
      deletedAt: '2026-03-18T10:21:00.000Z',
      updatedAt: '2026-03-18T10:21:00.000Z',
    };
    currentInviteLookup = {
      PK: 'GROUP_INVITE_CODE#invite-code',
      SK: 'LOOKUP',
      entityType: 'GROUP_INVITE_CODE_LOOKUP',
      code: 'invite-code',
      groupId: 'group-1',
      inviteId: 'invite-1',
      createdAt: '2026-03-18T10:20:00.000Z',
      updatedAt: '2026-03-18T10:20:00.000Z',
    };
    currentInviteLink = {
      PK: 'GROUP#group-1',
      SK: 'INVITE#invite-1',
      entityType: 'GROUP_INVITE_LINK',
      groupId: 'group-1',
      inviteId: 'invite-1',
      code: 'invite-code',
      createdByUserId: 'user-1',
      expiresAt: null,
      maxUses: 1,
      usedCount: 1,
      disabledAt: null,
      createdAt: '2026-03-18T09:20:00.000Z',
      updatedAt: '2026-03-18T09:20:00.000Z',
    };

    await expect(
      service.joinGroupByInvite(actor, 'invite-code'),
    ).rejects.toThrow(
      new ForbiddenException('Invite link has reached its usage limit.'),
    );
  });

  it('revokes an invite link and removes its code lookup', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    currentInviteLink = {
      PK: 'GROUP#group-1',
      SK: 'INVITE#invite-1',
      entityType: 'GROUP_INVITE_LINK',
      groupId: 'group-1',
      inviteId: 'invite-1',
      code: 'invite-code',
      createdByUserId: 'user-1',
      expiresAt: null,
      maxUses: 10,
      usedCount: 0,
      disabledAt: null,
      createdAt: '2026-03-18T09:20:00.000Z',
      updatedAt: '2026-03-18T09:20:00.000Z',
    };
    repository.transactWrite.mockImplementationOnce((items: unknown) => {
      type TransactionPut = {
        kind: 'put';
        tableName: string;
        item: Record<string, unknown>;
      };

      const transactionItems = items as TransactionPut[];
      const invitePut = transactionItems.find(
        (item) =>
          item.kind === 'put' &&
          item.tableName === 'Groups' &&
          item.item.entityType === 'GROUP_INVITE_LINK',
      );

      if (invitePut) {
        currentInviteLink = invitePut.item as unknown as StoredGroupInviteLink;
      }
    });

    const result = await service.revokeInviteLink(
      actor,
      group.groupId,
      'invite-1',
    );

    expect(result.disabledAt).toEqual(expect.any(String));
    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'delete',
          tableName: 'Groups',
          key: {
            PK: 'GROUP_INVITE_CODE#invite-code',
            SK: 'LOOKUP',
          },
        }),
      ]),
    );
  });

  it('removes the actor from group chat access when leaving a group', async () => {
    authorizationService.canDeleteGroup.mockReturnValue(false);
    repository.get.mockImplementation(
      (tableName: string, _pk: string, sk: string) => {
        if (tableName === 'Groups') {
          return group;
        }

        if (tableName === 'Memberships') {
          if (sk === actorMembership.SK) {
            return memberActorMembership;
          }

          if (sk === memberTwo.SK) {
            return memberTwo;
          }
        }

        return undefined;
      },
    );
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === 'USER#user-1' &&
          options?.beginsWith === 'CONV#GRP#group-1#LAST#'
        ) {
          return [
            {
              PK: 'USER#user-1',
              SK: 'CONV#GRP#group-1#LAST#2026-03-18T10:30:00.000Z',
              entityType: 'CONVERSATION',
              GSI1PK: 'USER#user-1#TYPE#GRP',
              userId: 'user-1',
              conversationId: 'GRP#group-1',
              groupName: 'Area 1',
              lastMessagePreview: 'Hello',
              lastSenderName: 'Ward Officer',
              unreadCount: 1,
              isGroup: true,
              deletedAt: null,
              updatedAt: '2026-03-18T10:30:00.000Z',
            },
          ];
        }

        return [actorMembership, memberTwo];
      },
    );

    const result = await service.leaveGroup(
      {
        ...actor,
        role: 'MEMBER' as never,
      },
      group.groupId,
    );

    expect(repository.delete).toHaveBeenCalledWith(
      'Conversations',
      'USER#user-1',
      'CONV#GRP#group-1#LAST#2026-03-18T10:30:00.000Z',
    );
    expect(chatRealtimeService.leaveConversationForUser).toHaveBeenCalledWith(
      'user-1',
      'GRP#group-1',
    );
    expect(chatRealtimeService.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'conversation.removed',
      expect.objectContaining({
        conversationId: 'group:group-1',
        conversationKey: 'GRP#group-1',
        reason: 'conversation.deleted',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        groupId: 'group-1',
        userId: 'user-1',
      }),
    );
  });

  it('removes a kicked member from group chat access immediately', async () => {
    authorizationService.canManageGroup.mockReturnValue(true);
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === 'USER#user-2' &&
          options?.beginsWith === 'CONV#GRP#group-1#LAST#'
        ) {
          return [
            {
              PK: 'USER#user-2',
              SK: 'CONV#GRP#group-1#LAST#2026-03-18T10:31:00.000Z',
              entityType: 'CONVERSATION',
              GSI1PK: 'USER#user-2#TYPE#GRP',
              userId: 'user-2',
              conversationId: 'GRP#group-1',
              groupName: 'Area 1',
              lastMessagePreview: 'Hello',
              lastSenderName: 'Ward Officer',
              unreadCount: 1,
              isGroup: true,
              deletedAt: null,
              updatedAt: '2026-03-18T10:31:00.000Z',
            },
          ];
        }

        return [actorMembership, memberTwo];
      },
    );

    const result = await service.manageMember(actor, group.groupId, 'user-2', {
      action: 'remove',
    });

    expect(repository.delete).toHaveBeenCalledWith(
      'Conversations',
      'USER#user-2',
      'CONV#GRP#group-1#LAST#2026-03-18T10:31:00.000Z',
    );
    expect(chatRealtimeService.leaveConversationForUser).toHaveBeenCalledWith(
      'user-2',
      'GRP#group-1',
    );
    expect(chatRealtimeService.emitToUser).toHaveBeenCalledWith(
      'user-2',
      'conversation.removed',
      expect.objectContaining({
        conversationId: 'group:group-1',
        conversationKey: 'GRP#group-1',
        reason: 'conversation.deleted',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        groupId: 'group-1',
        userId: 'user-2',
      }),
    );
  });
});
