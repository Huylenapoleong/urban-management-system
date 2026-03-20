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
    queryByIndex: jest.fn(),
    scanAll: jest.fn(),
    transactPut: jest.fn(),
    transactWrite: jest.fn(),
    put: jest.fn(),
  };
  const passwordService = {
    hashPassword: jest.fn(),
  };
  const authorizationService = {
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

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      repository as never,
      passwordService as never,
      authorizationService as never,
      chatPresenceService as never,
      chatRealtimeService as never,
      refreshSessionService as never,
      pushNotificationService as never,
      observabilityService as never,
      config as never,
    );
    passwordService.hashPassword.mockResolvedValue('hashed-password');
    authorizationService.canAccessLocationScope.mockReturnValue(true);
    authorizationService.canCreateUserRole.mockReturnValue(true);
    authorizationService.canManageUser.mockReturnValue(true);
    authorizationService.canReadUser.mockReturnValue(true);
    repository.get.mockResolvedValue(currentUser);
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
});
