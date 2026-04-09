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

  it('accepts an incoming friend request and creates two friendship edges', async () => {
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
      ]),
    );
    expect(result).toEqual(
      expect.objectContaining({
        userId: otherCitizen.userId,
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

    const result = await service.searchUsersForChatAndFriend(actor, {
      mode: 'all',
      limit: '20',
    });
    const friend = result.data.find((item) => item.userId === 'user-2');
    const incoming = result.data.find((item) => item.userId === 'user-3');
    const officer = result.data.find((item) => item.userId === 'officer-1');
    const outOfScope = result.data.find((item) => item.userId === 'user-9');

    expect(friend).toEqual(
      expect.objectContaining({
        relationState: 'FRIEND',
        canMessage: true,
        canSendFriendRequest: false,
      }),
    );
    expect(incoming).toEqual(
      expect.objectContaining({
        relationState: 'INCOMING_REQUEST',
        canMessage: false,
        canSendFriendRequest: false,
      }),
    );
    expect(officer).toEqual(
      expect.objectContaining({
        relationState: 'NONE',
        canMessage: true,
        canSendFriendRequest: false,
      }),
    );
    expect(outOfScope).toBeUndefined();
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
});
