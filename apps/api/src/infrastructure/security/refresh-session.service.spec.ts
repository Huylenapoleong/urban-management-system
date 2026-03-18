import { UnauthorizedException } from '@nestjs/common';
import type { JwtClaims } from '@urban/shared-types';
import type { SessionClientMetadata } from '../../common/request-session-metadata';
import { RefreshSessionService } from './refresh-session.service';

describe('RefreshSessionService', () => {
  const repository = {
    get: jest.fn(),
    put: jest.fn(),
    queryByPk: jest.fn(),
    transactPut: jest.fn(),
  };
  const jwtTokenService = {
    verifyRefreshToken: jest.fn(),
  };
  const config = {
    dynamodbUsersTableName: 'Users',
  };

  let service: RefreshSessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RefreshSessionService(
      repository as never,
      jwtTokenService as never,
      config as never,
    );
  });

  it('rejects legacy access tokens without a session id immediately', async () => {
    await expect(
      service.assertActiveSessionForAccessToken(
        buildClaims({ tokenType: 'access' }),
      ),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Legacy access tokens are no longer accepted. Please refresh your session.',
      ),
    );
    expect(repository.get).not.toHaveBeenCalled();
  });

  it('accepts a legacy refresh token once so it can migrate to a session-based pair', async () => {
    const claims = buildClaims();
    jwtTokenService.verifyRefreshToken.mockReturnValue(claims);
    repository.get.mockResolvedValue(undefined);

    await expect(
      service.resolveRefreshToken('legacy-refresh-token'),
    ).resolves.toEqual({
      claims,
      legacy: true,
    });
    expect(repository.get).toHaveBeenCalledWith(
      'Users',
      'USER#user-1',
      expect.stringMatching(/^REVOKED_REFRESH#/),
    );
  });

  it('rejects a legacy refresh token after it has already been migrated or revoked', async () => {
    const claims = buildClaims();
    jwtTokenService.verifyRefreshToken.mockReturnValue(claims);
    repository.get.mockResolvedValue({
      expiresAt: '9999-12-31T23:59:59.999Z',
    });

    await expect(
      service.resolveRefreshToken('legacy-refresh-token'),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Legacy refresh token has already been migrated or revoked.',
      ),
    );
  });

  it('persists issued refresh tokens with device metadata and lastUsedAt', async () => {
    const claims = buildClaims({ sid: 'session-1' });
    const metadata: SessionClientMetadata = {
      userAgent: 'Mozilla/5.0',
      ipAddress: '203.113.1.20',
      deviceId: 'device-mobile-01',
      appVariant: 'mobile-app',
    };
    jwtTokenService.verifyRefreshToken.mockReturnValue(claims);

    await service.persistIssuedRefreshToken(
      'user-1',
      'refresh-token',
      metadata,
    );

    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        entityType: 'USER_REFRESH_SESSION',
        sessionId: 'session-1',
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        deviceId: metadata.deviceId,
        appVariant: metadata.appVariant,
        lastUsedAt: expect.any(String),
      }),
    );
  });

  it('lists non-expired sessions for a user', async () => {
    repository.queryByPk.mockResolvedValue([
      {
        PK: 'USER#user-1',
        SK: 'SESSION#session-1',
        entityType: 'USER_REFRESH_SESSION',
        userId: 'user-1',
        sessionId: 'session-1',
        tokenHash: 'hash-1',
        expiresAt: '9999-12-31T23:59:59.999Z',
        revokedAt: null,
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      },
      {
        PK: 'USER#user-1',
        SK: 'SESSION#session-2',
        entityType: 'USER_REFRESH_SESSION',
        userId: 'user-1',
        sessionId: 'session-2',
        tokenHash: 'hash-2',
        expiresAt: '2020-01-01T00:00:00.000Z',
        revokedAt: null,
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      },
    ]);

    const sessions = await service.listSessionsForUser('user-1');

    expect(repository.queryByPk).toHaveBeenCalledWith('Users', 'USER#user-1', {
      beginsWith: 'SESSION#',
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        lastUsedAt: '2026-03-18T10:00:00.000Z',
      }),
    );
  });

  it('revokes a specific session by id', async () => {
    repository.get.mockResolvedValue({
      PK: 'USER#user-1',
      SK: 'SESSION#session-1',
      entityType: 'USER_REFRESH_SESSION',
      userId: 'user-1',
      sessionId: 'session-1',
      tokenHash: 'hash-1',
      expiresAt: '9999-12-31T23:59:59.999Z',
      revokedAt: null,
      createdAt: '2026-03-18T10:00:00.000Z',
      updatedAt: '2026-03-18T10:00:00.000Z',
    });

    const session = await service.revokeSessionById('user-1', 'session-1');

    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        sessionId: 'session-1',
        revokedAt: expect.any(String),
      }),
    );
    expect(session).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        revokedAt: expect.any(String),
      }),
    );
  });

  it('revokes every active session for a user', async () => {
    repository.queryByPk.mockResolvedValue([
      {
        PK: 'USER#user-1',
        SK: 'SESSION#session-1',
        entityType: 'USER_REFRESH_SESSION',
        userId: 'user-1',
        sessionId: 'session-1',
        tokenHash: 'hash-1',
        expiresAt: '9999-12-31T23:59:59.999Z',
        revokedAt: null,
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      },
      {
        PK: 'USER#user-1',
        SK: 'SESSION#session-2',
        entityType: 'USER_REFRESH_SESSION',
        userId: 'user-1',
        sessionId: 'session-2',
        tokenHash: 'hash-2',
        expiresAt: '9999-12-31T23:59:59.999Z',
        revokedAt: '2026-03-18T11:00:00.000Z',
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T11:00:00.000Z',
      },
    ]);

    await expect(service.revokeAllSessionsForUser('user-1')).resolves.toBe(1);

    expect(repository.queryByPk).toHaveBeenCalledWith('Users', 'USER#user-1', {
      beginsWith: 'SESSION#',
    });
    expect(repository.put).toHaveBeenCalledTimes(1);
    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        entityType: 'USER_REFRESH_SESSION',
        sessionId: 'session-1',
      }),
    );
  });
});

function buildClaims(overrides: Partial<JwtClaims> = {}): JwtClaims {
  return {
    sub: 'user-1',
    role: 'CITIZEN',
    locationCode: 'VN-79-760-26734',
    tokenType: 'refresh',
    iss: 'urban-management-system',
    iat: 1_742_261_200,
    exp: 4_102_444_800,
    ...overrides,
  };
}
