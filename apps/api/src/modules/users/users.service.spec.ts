import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { StoredUser } from '../../common/storage-records';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const repository = {
    batchGet: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(),
    queryByPk: jest.fn(),
    queryByIndex: jest.fn(),
    scanAll: jest.fn(),
    transactPut: jest.fn(),
    transactWrite: jest.fn(),
    put: jest.fn(),
  };
  const passwordService = {
    hashPassword: jest.fn(),
  };
  const passwordPolicyService = {
    validateOrThrow: jest.fn(),
  };
  const authorizationService = {
    canAccessDirectConversation: jest.fn(),
    canAccessLocationScope: jest.fn(),
    canCreateUserRole: jest.fn(),
    canManageUser: jest.fn(),
    canReadUser: jest.fn(),
  };
  const chatPresenceService = {
    getPresence: jest.fn(),
  };
  const chatRealtimeService = {
    emitToUser: jest.fn(),
    leaveConversationForUser: jest.fn(),
    disconnectUserSockets: jest.fn(),
  };
  const refreshSessionService = {
    revokeAllSessionsForUser: jest.fn(),
  };
  const mediaAssetService = {
    createOwnedAssetReference: jest.fn(
      (input: {
        key: string;
        target: string;
        entityId?: string;
        ownerUserId: string;
      }) => ({
        key: input.key,
        target: input.target,
        entityId: input.entityId,
        uploadedBy: input.ownerUserId,
      }),
    ),
    resolveAssetWithLegacyUrl: jest.fn((asset: unknown, url: unknown) =>
      Promise.resolve({
        asset,
        url,
      }),
    ),
  };
  const pushNotificationService = {
    deleteDevice: jest.fn(),
    listDevices: jest.fn(),
    registerDevice: jest.fn(),
  };
  const observabilityService = {
    recordSessionRevocations: jest.fn(),
  };
  const config = {
    dynamodbUsersTableName: 'Users',
    dynamodbConversationsTableName: 'Conversations',
    dynamodbUsersPhoneIndexName: 'GSI1-Phone',
    dynamodbUsersEmailIndexName: 'GSI2-Email',
  };

  let service: UsersService;

  const actor = {
    id: 'user-1',
    role: 'CITIZEN' as const,
    locationCode: 'VN-HCM-BQ1-P01',
    fullName: 'Citizen One',
    status: 'ACTIVE' as const,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  };

  const currentUser: StoredUser = {
    PK: 'USER#user-1',
    SK: 'PROFILE',
    entityType: 'USER_PROFILE',
    GSI1SK: 'USER',
    userId: 'user-1',
    phone: '+84901111111',
    email: 'citizen.one@example.com',
    passwordHash: 'hashed-password',
    fullName: 'Citizen One',
    role: 'CITIZEN',
    locationCode: 'VN-HCM-BQ1-P01',
    unit: undefined,
    avatarUrl: undefined,
    status: 'ACTIVE',
    deletedAt: null,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  };
  const otherCitizen: StoredUser = {
    ...currentUser,
    PK: 'USER#user-2',
    userId: 'user-2',
    phone: '+84902222222',
    email: 'citizen.two@example.com',
    fullName: 'Citizen Two',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      repository as never,
      passwordService as never,
      passwordPolicyService as never,
      authorizationService as never,
      chatPresenceService as never,
      chatRealtimeService as never,
      refreshSessionService as never,
      mediaAssetService as never,
      pushNotificationService as never,
      observabilityService as never,
      config as never,
    );
    passwordPolicyService.validateOrThrow.mockImplementation(() => undefined);
    passwordService.hashPassword.mockResolvedValue('hashed-password');
    authorizationService.canAccessLocationScope.mockReturnValue(true);
    authorizationService.canAccessDirectConversation.mockReturnValue(true);
    authorizationService.canCreateUserRole.mockReturnValue(true);
    authorizationService.canManageUser.mockReturnValue(true);
    authorizationService.canReadUser.mockReturnValue(true);
    repository.get.mockResolvedValue(currentUser);
    repository.queryByPk.mockResolvedValue([]);
    repository.queryByIndex.mockResolvedValue([]);
    repository.batchGet.mockResolvedValue([]);
    repository.delete.mockResolvedValue(undefined);
    repository.transactWrite.mockResolvedValue(undefined);
  });

  it('prevents citizens from changing their own locationCode', async () => {
    await expect(
      service.updateProfile(actor, {
        locationCode: 'VN-HCM-BQ1-P02',
      }),
    ).rejects.toThrow(
      new ForbiddenException('Citizens cannot change locationCode.'),
    );
    expect(repository.transactWrite).not.toHaveBeenCalled();
  });

  it('prefers avatarKey over legacy avatarUrl during profile update', async () => {
    repository.get.mockResolvedValue({
      ...currentUser,
      avatarUrl: 'https://cdn.example.com/legacy-avatar.jpg',
    });

    await service.updateProfile(actor, {
      avatarKey: 'uploads/avatar/user-1/avatar-next.jpg',
      avatarUrl: 'https://cdn.example.com/legacy-avatar.jpg',
    });

    expect(mediaAssetService.createOwnedAssetReference).toHaveBeenCalledWith({
      key: 'uploads/avatar/user-1/avatar-next.jpg',
      target: 'AVATAR',
      ownerUserId: actor.id,
      entityId: actor.id,
    });
    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'put',
          tableName: 'Users',
          item: expect.objectContaining({
            avatarAsset: expect.objectContaining({
              key: 'uploads/avatar/user-1/avatar-next.jpg',
            }),
            avatarUrl: undefined,
          }),
        }),
      ]),
    );
  });

  it('clears the current avatar without touching identity claims', async () => {
    repository.get.mockResolvedValue({
      ...currentUser,
      avatarAsset: {
        key: 'uploads/avatar/user-1/avatar-current.jpg',
        target: 'AVATAR',
        uploadedBy: actor.id,
      },
      avatarUrl: 'https://cdn.example.com/avatar-current.jpg',
    });

    const result = await service.clearCurrentAvatar(actor);

    expect(result).toEqual(
      expect.objectContaining({
        avatarAsset: undefined,
        avatarUrl: undefined,
      }),
    );
    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'put',
          tableName: 'Users',
          item: expect.objectContaining({
            avatarAsset: undefined,
            avatarUrl: undefined,
          }),
        }),
      ]),
    );
  });

  it('maps identity write conflicts back to duplicate email validation', async () => {
    const otherUser: StoredUser = {
      ...currentUser,
      PK: 'USER#user-2',
      userId: 'user-2',
      email: 'citizen.two@example.com',
      phone: '+84902222222',
      updatedAt: '2026-03-20T00:05:00.000Z',
    };
    const transactionError = new Error('Transaction canceled');
    (transactionError as Error & { cause?: unknown }).cause = {
      name: 'TransactionCanceledException',
    };

    repository.transactWrite.mockRejectedValue(transactionError);
    repository.queryByIndex.mockImplementation(
      (
        _tableName: string,
        indexName: string,
        pkKeyName: string,
        _skKeyName: string,
        pk: string,
      ) => {
        if (
          indexName === 'GSI2-Email' &&
          pkKeyName === 'email' &&
          pk === 'citizen.two@example.com'
        ) {
          return [{ PK: otherUser.PK, SK: otherUser.SK }];
        }

        return [];
      },
    );
    repository.batchGet.mockResolvedValue([otherUser]);

    await expect(
      service.updateProfile(actor, {
        email: 'citizen.two@example.com',
      }),
    ).rejects.toThrow(new BadRequestException('email already exists.'));
  });

  it('writes the profile and identity claims in a single transaction on register', async () => {
    await service.registerCitizen({
      phone: '+84903333333',
      email: 'citizen.three@example.com',
      password: 'Password123!',
      fullName: 'Citizen Three',
      locationCode: 'VN-HCM-BQ1-P01',
    });

    expect(repository.transactWrite).toHaveBeenCalledTimes(1);
    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'put',
        tableName: 'Users',
        item: expect.objectContaining({
          entityType: 'USER_PROFILE',
          phone: expect.any(String),
          email: 'citizen.three@example.com',
        }),
      }),
      expect.objectContaining({
        kind: 'put',
        tableName: 'Users',
        item: expect.objectContaining({
          entityType: 'USER_IDENTITY_CLAIM',
          identityType: 'PHONE',
          identityValue: expect.any(String),
        }),
      }),
      expect.objectContaining({
        kind: 'put',
        tableName: 'Users',
        item: expect.objectContaining({
          entityType: 'USER_IDENTITY_CLAIM',
          identityType: 'EMAIL',
          identityValue: 'citizen.three@example.com',
        }),
      }),
    ]);
  });

  it('rejects createUser when a legacy user already owns the email', async () => {
    const otherUser: StoredUser = {
      ...currentUser,
      PK: 'USER#user-2',
      userId: 'user-2',
      email: 'existing.officer@example.com',
      phone: '+84904444444',
      role: 'WARD_OFFICER',
      updatedAt: '2026-03-20T00:05:00.000Z',
    };

    repository.queryByIndex.mockImplementation(
      (
        _tableName: string,
        indexName: string,
        pkKeyName: string,
        _skKeyName: string,
        pk: string,
      ) => {
        if (
          indexName === 'GSI2-Email' &&
          pkKeyName === 'email' &&
          pk === 'existing.officer@example.com'
        ) {
          return [{ PK: otherUser.PK, SK: otherUser.SK }];
        }

        return [];
      },
    );
    repository.batchGet.mockResolvedValue([otherUser]);

    await expect(
      service.createUser(
        {
          ...actor,
          role: 'PROVINCE_OFFICER',
        },
        {
          email: 'existing.officer@example.com',
          password: 'Password123!',
          fullName: 'Officer Three',
          role: 'WARD_OFFICER',
          locationCode: 'VN-HCM-BQ1-P01',
        },
      ),
    ).rejects.toThrow(new BadRequestException('email already exists.'));
    expect(repository.transactWrite).not.toHaveBeenCalled();
  });

  it('maps updateStatus write conflicts to a retryable conflict error', async () => {
    const transactionError = new Error('Transaction canceled');
    transactionError.cause = {
      name: 'TransactionCanceledException',
    };
    repository.transactPut.mockRejectedValue(transactionError);

    await expect(
      service.updateStatus(
        {
          ...actor,
          role: 'WARD_OFFICER',
        },
        currentUser.userId,
        {
          status: 'LOCKED',
        },
      ),
    ).rejects.toThrow(new ConflictException('User changed. Please retry.'));
  });

  it('finds user by email through identity claim before falling back to GSI', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Users' &&
          pk === 'IDENTITY#EMAIL#citizen.one@example.com' &&
          sk === 'CLAIM'
        ) {
          return {
            PK: 'IDENTITY#EMAIL#citizen.one@example.com',
            SK: 'CLAIM',
            entityType: 'USER_IDENTITY_CLAIM',
            userId: currentUser.userId,
            identityType: 'EMAIL',
            identityValue: 'citizen.one@example.com',
            createdAt: '2026-03-20T00:00:00.000Z',
            updatedAt: '2026-03-20T00:00:00.000Z',
          };
        }

        if (
          tableName === 'Users' &&
          pk === currentUser.PK &&
          sk === currentUser.SK
        ) {
          return currentUser;
        }

        return undefined;
      },
    );

    const user = await service.findByEmail('citizen.one@example.com');

    expect(user).toEqual(currentUser);
    expect(repository.queryByIndex).not.toHaveBeenCalled();
  });

  it('cleans up stale identity claim when claimed user profile is missing', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Users' &&
          pk === 'IDENTITY#EMAIL#stale@example.com' &&
          sk === 'CLAIM'
        ) {
          return {
            PK: 'IDENTITY#EMAIL#stale@example.com',
            SK: 'CLAIM',
            entityType: 'USER_IDENTITY_CLAIM',
            userId: 'user-stale',
            identityType: 'EMAIL',
            identityValue: 'stale@example.com',
            createdAt: '2026-03-20T00:00:00.000Z',
            updatedAt: '2026-03-20T00:00:00.000Z',
          };
        }

        if (
          tableName === 'Users' &&
          pk === 'USER#user-stale' &&
          sk === 'PROFILE'
        ) {
          return undefined;
        }

        return undefined;
      },
    );
    repository.transactWrite.mockResolvedValue(undefined);

    const user = await service.findByEmail('stale@example.com');

    expect(user).toBeUndefined();
    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'delete',
        key: {
          PK: 'IDENTITY#EMAIL#stale@example.com',
          SK: 'CLAIM',
        },
      }),
    ]);
  });

  it('retries updatePassword on conditional write conflict and succeeds', async () => {
    const transactionError = new Error('Transaction canceled');
    transactionError.cause = {
      name: 'TransactionCanceledException',
    };
    repository.get
      .mockResolvedValueOnce({
        ...currentUser,
        updatedAt: '2026-03-20T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        ...currentUser,
        updatedAt: '2026-03-20T00:00:01.000Z',
      });
    repository.transactPut
      .mockRejectedValueOnce(transactionError)
      .mockResolvedValueOnce(undefined);

    const updated = await service.updatePassword(
      currentUser.userId,
      'hashed-password-new',
    );

    expect(repository.transactPut).toHaveBeenCalledTimes(2);
    expect(repository.transactPut).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({
        expressionAttributeValues: {
          ':expectedUpdatedAt': '2026-03-20T00:00:00.000Z',
        },
      }),
    ]);
    expect(repository.transactPut).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        expressionAttributeValues: {
          ':expectedUpdatedAt': '2026-03-20T00:00:01.000Z',
        },
      }),
    ]);
    expect(updated).toEqual(
      expect.objectContaining({
        userId: currentUser.userId,
        passwordHash: 'hashed-password-new',
      }),
    );
  });

  it('throws conflict when updatePassword still conflicts after retries', async () => {
    const transactionError = new Error('Transaction canceled');
    transactionError.cause = {
      name: 'TransactionCanceledException',
    };
    repository.get.mockResolvedValue(currentUser);
    repository.transactPut.mockRejectedValue(transactionError);

    await expect(
      service.updatePassword(currentUser.userId, 'hashed-password-new'),
    ).rejects.toThrow(
      new ConflictException(
        'User profile was changed by another request. Please retry.',
      ),
    );
    expect(repository.transactPut).toHaveBeenCalledTimes(3);
  });

  it('deactivates own account with optimistic concurrency', async () => {
    repository.get.mockResolvedValue(currentUser);
    repository.transactPut.mockResolvedValue(undefined);

    const result = await service.deactivateOwnAccount(currentUser.userId);

    expect(result).toEqual(
      expect.objectContaining({
        userId: currentUser.userId,
        status: 'DEACTIVATED',
      }),
    );
    expect(repository.transactPut).toHaveBeenCalledWith([
      expect.objectContaining({
        tableName: 'Users',
        expressionAttributeValues: {
          ':expectedUpdatedAt': currentUser.updatedAt,
        },
        item: expect.objectContaining({
          userId: currentUser.userId,
          status: 'DEACTIVATED',
        }),
      }),
    ]);
  });

  it('reactivates own account only from deactivated state', async () => {
    repository.get.mockResolvedValue({
      ...currentUser,
      status: 'DEACTIVATED',
      updatedAt: '2026-03-20T00:10:00.000Z',
    });
    repository.transactPut.mockResolvedValue(undefined);

    const result = await service.reactivateOwnAccount(currentUser.userId);

    expect(result).toEqual(
      expect.objectContaining({
        userId: currentUser.userId,
        status: 'ACTIVE',
      }),
    );
    expect(repository.transactPut).toHaveBeenCalledWith([
      expect.objectContaining({
        tableName: 'Users',
        expressionAttributeValues: {
          ':expectedUpdatedAt': '2026-03-20T00:10:00.000Z',
        },
        item: expect.objectContaining({
          userId: currentUser.userId,
          status: 'ACTIVE',
        }),
      }),
    ]);
  });

  it('permanently deletes own account and removes identity claims', async () => {
    repository.get.mockResolvedValue(currentUser);
    repository.transactWrite.mockResolvedValue(undefined);

    const result = await service.deleteOwnAccountPermanently(
      currentUser.userId,
    );

    expect(result).toEqual(
      expect.objectContaining({
        userId: currentUser.userId,
        status: 'DELETED',
        phone: undefined,
        email: undefined,
        fullName: 'Deleted User',
      }),
    );
    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'put',
          tableName: 'Users',
          item: expect.objectContaining({
            userId: currentUser.userId,
            status: 'DELETED',
            phone: undefined,
            email: undefined,
          }),
        }),
        expect.objectContaining({
          kind: 'delete',
          tableName: 'Users',
          key: {
            PK: 'IDENTITY#PHONE#+84901111111',
            SK: 'CLAIM',
          },
        }),
        expect.objectContaining({
          kind: 'delete',
          tableName: 'Users',
          key: {
            PK: 'IDENTITY#EMAIL#citizen.one@example.com',
            SK: 'CLAIM',
          },
        }),
      ]),
    );
  });

  it('creates outgoing and incoming friend request records', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (tableName !== 'Users') {
          return undefined;
        }

        if (pk === currentUser.PK && sk === currentUser.SK) {
          return currentUser;
        }

        if (pk === otherCitizen.PK && sk === otherCitizen.SK) {
          return otherCitizen;
        }

        return undefined;
      },
    );

    const result = await service.sendFriendRequest(actor, otherCitizen.userId);

    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'put',
        tableName: 'Users',
        item: expect.objectContaining({
          entityType: 'USER_FRIEND_REQUEST',
          direction: 'OUTGOING',
          requesterUserId: actor.id,
          targetUserId: otherCitizen.userId,
        }),
      }),
      expect.objectContaining({
        kind: 'put',
        tableName: 'Users',
        item: expect.objectContaining({
          entityType: 'USER_FRIEND_REQUEST',
          direction: 'INCOMING',
          requesterUserId: actor.id,
          targetUserId: otherCitizen.userId,
        }),
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        userId: otherCitizen.userId,
        direction: 'OUTGOING',
      }),
    );
  });

  it('allows citizen friend requests across different locations', async () => {
    const remoteCitizen: StoredUser = {
      ...otherCitizen,
      PK: 'USER#user-9',
      userId: 'user-9',
      fullName: 'Citizen Nine',
      locationCode: 'VN-HCM-BQ2-P01',
      email: 'citizen.nine@example.com',
      phone: '+84904444444',
    };

    authorizationService.canAccessDirectConversation.mockReturnValue(false);
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (tableName !== 'Users') {
          return undefined;
        }

        if (pk === currentUser.PK && sk === currentUser.SK) {
          return currentUser;
        }

        if (pk === remoteCitizen.PK && sk === remoteCitizen.SK) {
          return remoteCitizen;
        }

        return undefined;
      },
    );

    const result = await service.sendFriendRequest(actor, remoteCitizen.userId);

    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'put',
        tableName: 'Users',
        item: expect.objectContaining({
          entityType: 'USER_FRIEND_REQUEST',
          direction: 'OUTGOING',
          requesterUserId: actor.id,
          targetUserId: remoteCitizen.userId,
        }),
      }),
      expect.objectContaining({
        kind: 'put',
        tableName: 'Users',
        item: expect.objectContaining({
          entityType: 'USER_FRIEND_REQUEST',
          direction: 'INCOMING',
          requesterUserId: actor.id,
          targetUserId: remoteCitizen.userId,
        }),
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        userId: remoteCitizen.userId,
        direction: 'OUTGOING',
      }),
    );
  });

  it('requires accepting existing incoming request instead of creating duplicate', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (tableName !== 'Users') {
          return undefined;
        }

        if (pk === currentUser.PK && sk === currentUser.SK) {
          return currentUser;
        }

        if (pk === otherCitizen.PK && sk === otherCitizen.SK) {
          return otherCitizen;
        }

        if (
          pk === currentUser.PK &&
          sk === `FRIEND_REQUEST#FROM#${otherCitizen.userId}`
        ) {
          return {
            PK: currentUser.PK,
            SK: sk,
            entityType: 'USER_FRIEND_REQUEST',
            requesterUserId: otherCitizen.userId,
            targetUserId: currentUser.userId,
            direction: 'INCOMING',
            createdAt: '2026-03-20T00:05:00.000Z',
            updatedAt: '2026-03-20T00:05:00.000Z',
          };
        }

        return undefined;
      },
    );

    await expect(
      service.sendFriendRequest(actor, otherCitizen.userId),
    ).rejects.toThrow(
      new ConflictException(
        'This user already sent you a friend request. Accept it instead.',
      ),
    );
  });

  it('accepts an incoming friend request and creates two friendship edges with DM summaries', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (tableName !== 'Users') {
          return undefined;
        }

        if (pk === currentUser.PK && sk === currentUser.SK) {
          return currentUser;
        }

        if (pk === otherCitizen.PK && sk === otherCitizen.SK) {
          return otherCitizen;
        }

        if (
          pk === currentUser.PK &&
          sk === `FRIEND_REQUEST#FROM#${otherCitizen.userId}`
        ) {
          return {
            PK: currentUser.PK,
            SK: sk,
            entityType: 'USER_FRIEND_REQUEST',
            requesterUserId: otherCitizen.userId,
            targetUserId: currentUser.userId,
            direction: 'INCOMING',
            createdAt: '2026-03-20T00:05:00.000Z',
            updatedAt: '2026-03-20T00:05:00.000Z',
          };
        }

        if (
          pk === otherCitizen.PK &&
          sk === `FRIEND_REQUEST#TO#${currentUser.userId}`
        ) {
          return {
            PK: otherCitizen.PK,
            SK: sk,
            entityType: 'USER_FRIEND_REQUEST',
            requesterUserId: otherCitizen.userId,
            targetUserId: currentUser.userId,
            direction: 'OUTGOING',
            createdAt: '2026-03-20T00:05:00.000Z',
            updatedAt: '2026-03-20T00:05:00.000Z',
          };
        }

        return undefined;
      },
    );

    const result = await service.acceptFriendRequest(
      actor,
      otherCitizen.userId,
    );

    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'put',
          tableName: 'Users',
          item: expect.objectContaining({
            entityType: 'USER_FRIEND_EDGE',
            userId: actor.id,
            friendUserId: otherCitizen.userId,
          }),
        }),
        expect.objectContaining({
          kind: 'put',
          tableName: 'Users',
          item: expect.objectContaining({
            entityType: 'USER_FRIEND_EDGE',
            userId: otherCitizen.userId,
            friendUserId: actor.id,
          }),
        }),
        expect.objectContaining({
          kind: 'put',
          tableName: 'Conversations',
          item: expect.objectContaining({
            entityType: 'CONVERSATION',
            userId: actor.id,
            conversationId: 'DM#user-1#user-2',
            groupName: otherCitizen.fullName,
            lastMessagePreview: '',
            lastSenderName: '',
            unreadCount: 0,
            isGroup: false,
            requestStatus: null,
          }),
        }),
        expect.objectContaining({
          kind: 'put',
          tableName: 'Conversations',
          item: expect.objectContaining({
            entityType: 'CONVERSATION',
            userId: otherCitizen.userId,
            conversationId: 'DM#user-1#user-2',
            groupName: currentUser.fullName,
            lastMessagePreview: '',
            lastSenderName: '',
            unreadCount: 0,
            isGroup: false,
            requestStatus: null,
          }),
        }),
      ]),
    );
    expect(result).toEqual(
      expect.objectContaining({
        userId: otherCitizen.userId,
      }),
    );
  });

  it('keeps an existing DM summary instead of overwriting it during friend acceptance', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (tableName !== 'Users') {
          return undefined;
        }

        if (pk === currentUser.PK && sk === currentUser.SK) {
          return currentUser;
        }

        if (pk === otherCitizen.PK && sk === otherCitizen.SK) {
          return otherCitizen;
        }

        if (
          pk === currentUser.PK &&
          sk === `FRIEND_REQUEST#FROM#${otherCitizen.userId}`
        ) {
          return {
            PK: currentUser.PK,
            SK: sk,
            entityType: 'USER_FRIEND_REQUEST',
            requesterUserId: otherCitizen.userId,
            targetUserId: currentUser.userId,
            direction: 'INCOMING',
            createdAt: '2026-03-20T00:05:00.000Z',
            updatedAt: '2026-03-20T00:05:00.000Z',
          };
        }

        if (
          pk === otherCitizen.PK &&
          sk === `FRIEND_REQUEST#TO#${currentUser.userId}`
        ) {
          return {
            PK: otherCitizen.PK,
            SK: sk,
            entityType: 'USER_FRIEND_REQUEST',
            requesterUserId: otherCitizen.userId,
            targetUserId: currentUser.userId,
            direction: 'OUTGOING',
            createdAt: '2026-03-20T00:05:00.000Z',
            updatedAt: '2026-03-20T00:05:00.000Z',
          };
        }

        return undefined;
      },
    );
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          options?.beginsWith === 'CONV#DM#user-1#user-2#LAST#'
        ) {
          if (pk === 'USER#user-1') {
            return [
              {
                PK: 'USER#user-1',
                SK: 'CONV#DM#user-1#user-2#LAST#2026-03-20T00:06:00.000Z',
                entityType: 'CONVERSATION',
                GSI1PK: 'INBOX_STATS#user-1#DM',
                userId: 'user-1',
                conversationId: 'DM#user-1#user-2',
                groupName: otherCitizen.fullName,
                lastMessagePreview: 'Hello there',
                lastSenderName: otherCitizen.fullName,
                unreadCount: 1,
                isGroup: false,
                isPinned: false,
                archivedAt: null,
                mutedUntil: null,
                deletedAt: null,
                updatedAt: '2026-03-20T00:06:00.000Z',
                lastReadAt: null,
              },
            ];
          }

          return [];
        }

        return [];
      },
    );

    await service.acceptFriendRequest(actor, otherCitizen.userId);

    const [[transactionItems]] = repository.transactWrite.mock.calls;
    expect(transactionItems).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Conversations',
          item: expect.objectContaining({
            userId: actor.id,
            conversationId: 'DM#user-1#user-2',
          }),
        }),
      ]),
    );
    expect(transactionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Conversations',
          item: expect.objectContaining({
            userId: otherCitizen.userId,
            conversationId: 'DM#user-1#user-2',
          }),
        }),
      ]),
    );
  });

  it('stores a private contact alias and updates the existing DM summary label', async () => {
    repository.get.mockImplementation(
      (_tableName: string, pk: string, sk: string) => {
        if (pk === currentUser.PK && sk === currentUser.SK) {
          return currentUser;
        }

        if (pk === otherCitizen.PK && sk === otherCitizen.SK) {
          return otherCitizen;
        }

        return undefined;
      },
    );
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === 'USER#user-1' &&
          options?.beginsWith === 'CONV#DM#user-1#user-2#LAST#'
        ) {
          return [
            {
              PK: 'USER#user-1',
              SK: 'CONV#DM#user-1#user-2#LAST#2026-03-20T00:06:00.000Z',
              entityType: 'CONVERSATION',
              GSI1PK: 'INBOX_STATS#user-1#DM',
              userId: 'user-1',
              conversationId: 'DM#user-1#user-2',
              groupName: otherCitizen.fullName,
              lastMessagePreview: 'Hello there',
              lastSenderName: otherCitizen.fullName,
              unreadCount: 1,
              isGroup: false,
              isPinned: false,
              archivedAt: null,
              mutedUntil: null,
              deletedAt: null,
              updatedAt: '2026-03-20T00:06:00.000Z',
              lastReadAt: null,
            },
          ];
        }

        return [];
      },
    );

    const result = await service.setContactAlias(actor, otherCitizen.userId, {
      alias: 'Anh Hai',
    });

    expect(result).toEqual(
      expect.objectContaining({
        userId: otherCitizen.userId,
        alias: 'Anh Hai',
      }),
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        entityType: 'USER_CONTACT_ALIAS',
        targetUserId: otherCitizen.userId,
        alias: 'Anh Hai',
      }),
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Conversations',
      expect.objectContaining({
        conversationId: 'DM#user-1#user-2',
        groupName: 'Anh Hai',
      }),
    );
    expect(chatRealtimeService.emitToUser).toHaveBeenCalledWith(
      actor.id,
      'conversation.updated',
      expect.objectContaining({
        summary: expect.objectContaining({
          conversationId: `dm:${otherCitizen.userId}`,
          groupName: 'Anh Hai',
        }),
      }),
    );
  });

  it('clears a private contact alias and restores the counterpart full name in DM summary', async () => {
    repository.get.mockImplementation(
      (_tableName: string, pk: string, sk: string) => {
        if (pk === currentUser.PK && sk === currentUser.SK) {
          return currentUser;
        }

        if (pk === otherCitizen.PK && sk === otherCitizen.SK) {
          return otherCitizen;
        }

        if (
          pk === currentUser.PK &&
          sk === `CONTACT_ALIAS#${otherCitizen.userId}`
        ) {
          return {
            PK: currentUser.PK,
            SK: sk,
            entityType: 'USER_CONTACT_ALIAS',
            ownerUserId: currentUser.userId,
            targetUserId: otherCitizen.userId,
            alias: 'Anh Hai',
            createdAt: '2026-03-20T00:06:00.000Z',
            updatedAt: '2026-03-20T00:06:00.000Z',
          };
        }

        return undefined;
      },
    );
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === 'USER#user-1' &&
          options?.beginsWith === 'CONV#DM#user-1#user-2#LAST#'
        ) {
          return [
            {
              PK: 'USER#user-1',
              SK: 'CONV#DM#user-1#user-2#LAST#2026-03-20T00:06:00.000Z',
              entityType: 'CONVERSATION',
              GSI1PK: 'INBOX_STATS#user-1#DM',
              userId: 'user-1',
              conversationId: 'DM#user-1#user-2',
              groupName: 'Anh Hai',
              lastMessagePreview: 'Hello there',
              lastSenderName: otherCitizen.fullName,
              unreadCount: 1,
              isGroup: false,
              isPinned: false,
              archivedAt: null,
              mutedUntil: null,
              deletedAt: null,
              updatedAt: '2026-03-20T00:06:00.000Z',
              lastReadAt: null,
            },
          ];
        }

        return [];
      },
    );

    const result = await service.clearContactAlias(actor, otherCitizen.userId);

    expect(result).toEqual(
      expect.objectContaining({
        userId: otherCitizen.userId,
      }),
    );
    expect(repository.delete).toHaveBeenCalledWith(
      'Users',
      currentUser.PK,
      `CONTACT_ALIAS#${otherCitizen.userId}`,
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Conversations',
      expect.objectContaining({
        conversationId: 'DM#user-1#user-2',
        groupName: otherCitizen.fullName,
      }),
    );
  });

  it('rejects an incoming friend request and deletes both pending request records', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (tableName !== 'Users') {
          return undefined;
        }

        if (pk === currentUser.PK && sk === currentUser.SK) {
          return currentUser;
        }

        if (pk === otherCitizen.PK && sk === otherCitizen.SK) {
          return otherCitizen;
        }

        if (
          pk === currentUser.PK &&
          sk === `FRIEND_REQUEST#FROM#${otherCitizen.userId}`
        ) {
          return {
            PK: currentUser.PK,
            SK: sk,
            entityType: 'USER_FRIEND_REQUEST',
            requesterUserId: otherCitizen.userId,
            targetUserId: currentUser.userId,
            direction: 'INCOMING',
            createdAt: '2026-03-20T00:05:00.000Z',
            updatedAt: '2026-03-20T00:05:00.000Z',
          };
        }

        if (
          pk === otherCitizen.PK &&
          sk === `FRIEND_REQUEST#TO#${currentUser.userId}`
        ) {
          return {
            PK: otherCitizen.PK,
            SK: sk,
            entityType: 'USER_FRIEND_REQUEST',
            requesterUserId: otherCitizen.userId,
            targetUserId: currentUser.userId,
            direction: 'OUTGOING',
            createdAt: '2026-03-20T00:05:00.000Z',
            updatedAt: '2026-03-20T00:05:00.000Z',
          };
        }

        return undefined;
      },
    );

    const result = await service.rejectIncomingFriendRequest(
      actor,
      otherCitizen.userId,
    );

    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'delete',
        tableName: 'Users',
        key: {
          PK: currentUser.PK,
          SK: `FRIEND_REQUEST#FROM#${otherCitizen.userId}`,
        },
      }),
      expect.objectContaining({
        kind: 'delete',
        tableName: 'Users',
        key: {
          PK: otherCitizen.PK,
          SK: `FRIEND_REQUEST#TO#${currentUser.userId}`,
        },
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        userId: otherCitizen.userId,
        action: 'REJECTED',
      }),
    );
  });

  it('cancels an outgoing friend request and deletes both pending request records', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (tableName !== 'Users') {
          return undefined;
        }

        if (pk === currentUser.PK && sk === currentUser.SK) {
          return currentUser;
        }

        if (pk === otherCitizen.PK && sk === otherCitizen.SK) {
          return otherCitizen;
        }

        if (
          pk === currentUser.PK &&
          sk === `FRIEND_REQUEST#TO#${otherCitizen.userId}`
        ) {
          return {
            PK: currentUser.PK,
            SK: sk,
            entityType: 'USER_FRIEND_REQUEST',
            requesterUserId: currentUser.userId,
            targetUserId: otherCitizen.userId,
            direction: 'OUTGOING',
            createdAt: '2026-03-20T00:05:00.000Z',
            updatedAt: '2026-03-20T00:05:00.000Z',
          };
        }

        if (
          pk === otherCitizen.PK &&
          sk === `FRIEND_REQUEST#FROM#${currentUser.userId}`
        ) {
          return {
            PK: otherCitizen.PK,
            SK: sk,
            entityType: 'USER_FRIEND_REQUEST',
            requesterUserId: currentUser.userId,
            targetUserId: otherCitizen.userId,
            direction: 'INCOMING',
            createdAt: '2026-03-20T00:05:00.000Z',
            updatedAt: '2026-03-20T00:05:00.000Z',
          };
        }

        return undefined;
      },
    );

    const result = await service.cancelOutgoingFriendRequest(
      actor,
      otherCitizen.userId,
    );

    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'delete',
        tableName: 'Users',
        key: {
          PK: currentUser.PK,
          SK: `FRIEND_REQUEST#TO#${otherCitizen.userId}`,
        },
      }),
      expect.objectContaining({
        kind: 'delete',
        tableName: 'Users',
        key: {
          PK: otherCitizen.PK,
          SK: `FRIEND_REQUEST#FROM#${currentUser.userId}`,
        },
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        userId: otherCitizen.userId,
        action: 'CANCELED',
      }),
    );
  });

  it('blocks citizen DM start when friendship edge does not exist', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Users' &&
          pk === `USER#${actor.id}` &&
          sk === `FRIEND#${otherCitizen.userId}`
        ) {
          return undefined;
        }

        return currentUser;
      },
    );

    await expect(service.canStartCitizenDm(actor, otherCitizen)).resolves.toBe(
      false,
    );
  });

  it('keeps existing DM summaries after removing a friend', async () => {
    const remoteCitizen: StoredUser = {
      ...otherCitizen,
      PK: 'USER#user-9',
      userId: 'user-9',
      fullName: 'Citizen Remote',
      email: 'citizen.remote@example.com',
      locationCode: 'VN-HCM-BQ2-P01',
    };
    const conversationId = 'DM#user-1#user-9';
    const actorSummary = {
      PK: 'USER#user-1',
      SK: `CONV#${conversationId}#LAST#2026-03-20T00:10:00.000Z`,
      entityType: 'CONVERSATION' as const,
      conversationId,
      userId: 'user-1',
      groupName: remoteCitizen.fullName,
      lastMessagePreview: 'Xin chao',
      lastSenderName: currentUser.fullName,
      unreadCount: 0,
      isGroup: false,
      isPinned: false,
      archivedAt: null,
      mutedUntil: null,
      requestStatus: null,
      requestDirection: null,
      requestRequestedAt: null,
      requestRespondedAt: null,
      requestRespondedByUserId: null,
      deletedAt: null,
      updatedAt: '2026-03-20T00:10:00.000Z',
      lastReadAt: '2026-03-20T00:10:00.000Z',
      GSI1PK: 'INBOXSTATS#user-1#DM',
    };
    const remoteSummary = {
      ...actorSummary,
      PK: 'USER#user-9',
      userId: 'user-9',
      groupName: currentUser.fullName,
      lastSenderName: remoteCitizen.fullName,
      GSI1PK: 'INBOXSTATS#user-9#DM',
    };

    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Users' &&
          pk === currentUser.PK &&
          sk === 'PROFILE'
        ) {
          return currentUser;
        }

        if (
          tableName === 'Users' &&
          pk === remoteCitizen.PK &&
          sk === 'PROFILE'
        ) {
          return remoteCitizen;
        }

        if (
          tableName === 'Users' &&
          pk === currentUser.PK &&
          sk === `FRIEND#${remoteCitizen.userId}`
        ) {
          return {
            PK: currentUser.PK,
            SK: sk,
            entityType: 'USER_FRIEND_EDGE',
            userId: currentUser.userId,
            friendUserId: remoteCitizen.userId,
            createdAt: '2026-03-20T00:04:00.000Z',
            updatedAt: '2026-03-20T00:04:00.000Z',
          };
        }

        if (
          tableName === 'Users' &&
          pk === remoteCitizen.PK &&
          sk === `FRIEND#${currentUser.userId}`
        ) {
          return {
            PK: remoteCitizen.PK,
            SK: sk,
            entityType: 'USER_FRIEND_EDGE',
            userId: remoteCitizen.userId,
            friendUserId: currentUser.userId,
            createdAt: '2026-03-20T00:04:00.000Z',
            updatedAt: '2026-03-20T00:04:00.000Z',
          };
        }

        return undefined;
      },
    );
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === 'USER#user-1' &&
          options?.beginsWith === `CONV#${conversationId}#LAST#`
        ) {
          return [actorSummary];
        }

        if (
          tableName === 'Conversations' &&
          pk === 'USER#user-9' &&
          options?.beginsWith === `CONV#${conversationId}#LAST#`
        ) {
          return [remoteSummary];
        }

        return [];
      },
    );
    authorizationService.canAccessDirectConversation.mockReturnValue(false);

    const result = await service.removeFriend(actor, remoteCitizen.userId);

    expect(result).toEqual(
      expect.objectContaining({
        userId: remoteCitizen.userId,
        removedAt: expect.any(String),
      }),
    );
    expect(repository.delete).not.toHaveBeenCalled();
    expect(chatRealtimeService.leaveConversationForUser).not.toHaveBeenCalled();
    expect(chatRealtimeService.emitToUser).not.toHaveBeenCalled();
  });

  it('creates a user-level block and removes friendship and pending requests', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Users' &&
          pk === currentUser.PK &&
          sk === 'PROFILE'
        ) {
          return currentUser;
        }

        if (
          tableName === 'Users' &&
          pk === otherCitizen.PK &&
          sk === 'PROFILE'
        ) {
          return otherCitizen;
        }

        if (
          tableName === 'Users' &&
          pk === currentUser.PK &&
          sk === `FRIEND#${otherCitizen.userId}`
        ) {
          return {
            PK: currentUser.PK,
            SK: sk,
            entityType: 'USER_FRIEND_EDGE',
            userId: currentUser.userId,
            friendUserId: otherCitizen.userId,
            createdAt: '2026-03-20T00:04:00.000Z',
            updatedAt: '2026-03-20T00:04:00.000Z',
          };
        }

        if (
          tableName === 'Users' &&
          pk === otherCitizen.PK &&
          sk === `FRIEND#${currentUser.userId}`
        ) {
          return {
            PK: otherCitizen.PK,
            SK: sk,
            entityType: 'USER_FRIEND_EDGE',
            userId: otherCitizen.userId,
            friendUserId: currentUser.userId,
            createdAt: '2026-03-20T00:04:00.000Z',
            updatedAt: '2026-03-20T00:04:00.000Z',
          };
        }

        return undefined;
      },
    );

    const result = await service.blockUser(actor, otherCitizen.userId);

    expect(result).toEqual(
      expect.objectContaining({
        userId: otherCitizen.userId,
        blockedAt: expect.any(String),
      }),
    );
    expect(repository.transactWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'put',
          tableName: 'Users',
          item: expect.objectContaining({
            entityType: 'USER_BLOCK_EDGE',
            blockerUserId: currentUser.userId,
            blockedUserId: otherCitizen.userId,
            direction: 'OUTGOING',
          }),
        }),
        expect.objectContaining({
          kind: 'put',
          tableName: 'Users',
          item: expect.objectContaining({
            entityType: 'USER_BLOCK_EDGE',
            blockerUserId: currentUser.userId,
            blockedUserId: otherCitizen.userId,
            direction: 'INCOMING',
          }),
        }),
        expect.objectContaining({
          kind: 'delete',
          tableName: 'Users',
          key: {
            PK: currentUser.PK,
            SK: `FRIEND#${otherCitizen.userId}`,
          },
        }),
        expect.objectContaining({
          kind: 'delete',
          tableName: 'Users',
          key: {
            PK: otherCitizen.PK,
            SK: `FRIEND#${currentUser.userId}`,
          },
        }),
      ]),
    );
  });

  it('blocks new friend requests when either side blocked the other', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Users' &&
          pk === currentUser.PK &&
          sk === 'PROFILE'
        ) {
          return currentUser;
        }

        if (
          tableName === 'Users' &&
          pk === otherCitizen.PK &&
          sk === 'PROFILE'
        ) {
          return otherCitizen;
        }

        if (
          tableName === 'Users' &&
          pk === currentUser.PK &&
          sk === `BLOCKED_BY#${otherCitizen.userId}`
        ) {
          return {
            PK: currentUser.PK,
            SK: sk,
            entityType: 'USER_BLOCK_EDGE',
            blockerUserId: otherCitizen.userId,
            blockedUserId: currentUser.userId,
            direction: 'INCOMING',
            createdAt: '2026-03-20T00:04:00.000Z',
            updatedAt: '2026-03-20T00:04:00.000Z',
          };
        }

        return undefined;
      },
    );

    await expect(
      service.sendFriendRequest(actor, otherCitizen.userId),
    ).rejects.toThrow(
      new ForbiddenException(
        'Friend requests are blocked between these users.',
      ),
    );
  });

  it('searches users for chat/friend with relation and capability flags', async () => {
    const incomingCitizen: StoredUser = {
      ...currentUser,
      PK: 'USER#user-3',
      userId: 'user-3',
      fullName: 'Citizen Three',
      email: 'citizen.three@example.com',
      phone: '+84903333333',
      updatedAt: '2026-03-20T00:06:00.000Z',
    };
    const wardOfficer: StoredUser = {
      ...currentUser,
      PK: 'USER#officer-1',
      userId: 'officer-1',
      fullName: 'Ward Officer',
      role: 'WARD_OFFICER',
      unit: 'Ward Office',
      email: 'ward.officer@example.com',
      phone: '+84909999999',
      updatedAt: '2026-03-20T00:07:00.000Z',
    };
    const acceptedRequestCitizen: StoredUser = {
      ...currentUser,
      PK: 'USER#user-5',
      userId: 'user-5',
      fullName: 'Citizen Five',
      email: 'citizen.five@example.com',
      phone: '+84906666666',
      updatedAt: '2026-03-20T00:07:45.000Z',
    };
    const strangerCitizen: StoredUser = {
      ...currentUser,
      PK: 'USER#user-4',
      userId: 'user-4',
      fullName: 'Citizen Four',
      email: 'citizen.four@example.com',
      phone: '+84905555555',
      updatedAt: '2026-03-20T00:07:30.000Z',
    };
    const outOfScopeCitizen: StoredUser = {
      ...currentUser,
      PK: 'USER#user-9',
      userId: 'user-9',
      fullName: 'Citizen Nine',
      locationCode: 'VN-HCM-BQ2-P01',
      email: 'citizen.nine@example.com',
      phone: '+84904444444',
      updatedAt: '2026-03-20T00:08:00.000Z',
    };

    repository.scanAll.mockResolvedValue([
      currentUser,
      otherCitizen,
      incomingCitizen,
      wardOfficer,
      acceptedRequestCitizen,
      strangerCitizen,
      outOfScopeCitizen,
    ]);
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (tableName !== 'Users' || pk !== 'USER#user-1') {
          return [];
        }

        if (options?.beginsWith === 'FRIEND#') {
          return [
            {
              PK: 'USER#user-1',
              SK: 'FRIEND#user-2',
              entityType: 'USER_FRIEND_EDGE',
              userId: 'user-1',
              friendUserId: 'user-2',
              createdAt: '2026-03-20T00:04:00.000Z',
              updatedAt: '2026-03-20T00:04:00.000Z',
            },
          ];
        }

        if (options?.beginsWith === 'FRIEND_REQUEST#') {
          return [
            {
              PK: 'USER#user-1',
              SK: 'FRIEND_REQUEST#FROM#user-3',
              entityType: 'USER_FRIEND_REQUEST',
              requesterUserId: 'user-3',
              targetUserId: 'user-1',
              direction: 'INCOMING',
              createdAt: '2026-03-20T00:05:00.000Z',
              updatedAt: '2026-03-20T00:05:00.000Z',
            },
          ];
        }

        return [];
      },
    );
    authorizationService.canAccessDirectConversation.mockImplementation(
      (currentActor: { id: string }, target: { userId: string }) =>
        currentActor.id === 'user-1' && target.userId !== 'user-9',
    );
    repository.batchGet.mockResolvedValue([
      {
        PK: 'DMREQ#DM#user-1#user-5',
        SK: 'STATE',
        entityType: 'DIRECT_MESSAGE_REQUEST',
        conversationId: 'DM#user-1#user-5',
        requesterUserId: 'user-1',
        targetUserId: 'user-5',
        status: 'ACCEPTED',
        createdAt: '2026-03-20T00:05:30.000Z',
        updatedAt: '2026-03-20T00:06:00.000Z',
        respondedAt: '2026-03-20T00:06:00.000Z',
        respondedByUserId: 'user-5',
      },
    ]);

    const result = await service.searchUsersForChatAndFriend(actor, {
      mode: 'all',
      limit: '20',
    });
    const friend = result.data.find((item) => item.userId === 'user-2');
    const incoming = result.data.find((item) => item.userId === 'user-3');
    const officer = result.data.find((item) => item.userId === 'officer-1');
    const acceptedRequester = result.data.find(
      (item) => item.userId === 'user-5',
    );
    const stranger = result.data.find((item) => item.userId === 'user-4');
    const outOfScope = result.data.find((item) => item.userId === 'user-9');

    expect(friend).toEqual(
      expect.objectContaining({
        relationState: 'FRIEND',
        canMessage: true,
        canSendFriendRequest: false,
        canSendMessageRequest: false,
      }),
    );
    expect(incoming).toEqual(
      expect.objectContaining({
        relationState: 'INCOMING_REQUEST',
        canMessage: false,
        canSendFriendRequest: false,
        canSendMessageRequest: false,
      }),
    );
    expect(officer).toEqual(
      expect.objectContaining({
        relationState: 'NONE',
        canMessage: true,
        canSendFriendRequest: false,
        canSendMessageRequest: false,
      }),
    );
    expect(acceptedRequester).toEqual(
      expect.objectContaining({
        relationState: 'NONE',
        canMessage: true,
        canSendFriendRequest: true,
        canSendMessageRequest: false,
      }),
    );
    expect(stranger).toEqual(
      expect.objectContaining({
        relationState: 'NONE',
        canMessage: false,
        canSendFriendRequest: true,
        canSendMessageRequest: true,
      }),
    );
    expect(outOfScope).toEqual(
      expect.objectContaining({
        relationState: 'NONE',
        canMessage: false,
        canSendFriendRequest: true,
        canSendMessageRequest: false,
      }),
    );
  });

  it('filters discovery by chat mode to only immediate message candidates', async () => {
    repository.scanAll.mockResolvedValue([currentUser, otherCitizen]);
    repository.queryByPk.mockResolvedValue([]);
    authorizationService.canAccessDirectConversation.mockReturnValue(true);

    const result = await service.searchUsersForChatAndFriend(actor, {
      mode: 'chat',
      limit: '20',
    });

    expect(result.data).toHaveLength(0);
  });

  it('includes non-friend citizens in friend discovery mode even when chat access is blocked', async () => {
    const remoteCitizen: StoredUser = {
      ...otherCitizen,
      PK: 'USER#user-9',
      userId: 'user-9',
      fullName: 'Citizen Nine',
      locationCode: 'VN-HCM-BQ2-P01',
      email: 'citizen.nine@example.com',
      phone: '+84904444444',
      updatedAt: '2026-03-20T00:08:00.000Z',
    };

    repository.scanAll.mockResolvedValue([currentUser, remoteCitizen]);
    repository.queryByPk.mockResolvedValue([]);
    authorizationService.canAccessDirectConversation.mockReturnValue(false);

    const result = await service.searchUsersForChatAndFriend(actor, {
      mode: 'friend',
      limit: '20',
    });

    expect(result.data).toEqual([
      expect.objectContaining({
        userId: remoteCitizen.userId,
        relationState: 'NONE',
        canMessage: false,
        canSendFriendRequest: true,
        canSendMessageRequest: false,
      }),
    ]);
  });

  it('hides blocked users from discovery results', async () => {
    repository.scanAll.mockResolvedValue([currentUser, otherCitizen]);
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Users' &&
          pk === 'USER#user-1' &&
          options?.beginsWith === 'BLOCK#'
        ) {
          return [
            {
              PK: 'USER#user-1',
              SK: 'BLOCK#user-2',
              entityType: 'USER_BLOCK_EDGE',
              blockerUserId: 'user-1',
              blockedUserId: 'user-2',
              direction: 'OUTGOING',
              createdAt: '2026-03-20T00:08:00.000Z',
              updatedAt: '2026-03-20T00:08:00.000Z',
            },
          ];
        }

        return [];
      },
    );

    const result = await service.searchUsersForChatAndFriend(actor, {
      mode: 'all',
      limit: '20',
    });

    expect(result.data).toEqual([]);
  });
});
