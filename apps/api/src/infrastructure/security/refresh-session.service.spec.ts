import { createHash } from 'node:crypto';
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
    transactWrite: jest.fn(),
    delete: jest.fn(),
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

    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'put',
        tableName: 'Users',
        item: expect.objectContaining({
          entityType: 'USER_REFRESH_SESSION',
          sessionId: 'session-1',
          sessionScope: 'MOBILE_APP',
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
          deviceId: metadata.deviceId,
          appVariant: metadata.appVariant,
          lastUsedAt: expect.any(String),
        }),
      }),
      expect.objectContaining({
        kind: 'put',
        tableName: 'Users',
        item: expect.objectContaining({
          entityType: 'USER_SESSION_SLOT',
          sessionScope: 'MOBILE_APP',
          currentSessionId: 'session-1',
        }),
      }),
    ]);
  });

  it('derives a separate desktop web session scope from app variant metadata', async () => {
    const claims = buildClaims({ sid: 'session-web-1' });
    jwtTokenService.verifyRefreshToken.mockReturnValue(claims);

    await expect(
      service.persistIssuedRefreshToken('user-1', 'refresh-token', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        appVariant: 'admin-web',
        deviceId: 'device-admin-web-01',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        session: expect.objectContaining({
          sessionId: 'session-web-1',
          sessionScope: 'WEB_DESKTOP',
        }),
        replacedSessionId: undefined,
      }),
    );
  });

  it('replaces the previous active session in the same session scope', async () => {
    const claims = buildClaims({ sid: 'session-2' });
    const metadata: SessionClientMetadata = {
      userAgent: 'Mozilla/5.0 (Android 14)',
      appVariant: 'mobile-app',
      deviceId: 'device-mobile-02',
    };
    jwtTokenService.verifyRefreshToken.mockReturnValue(claims);
    repository.get
      .mockResolvedValueOnce({
        PK: 'USER#user-1',
        SK: 'SESSION_SLOT#MOBILE_APP',
        entityType: 'USER_SESSION_SLOT',
        userId: 'user-1',
        sessionScope: 'MOBILE_APP',
        currentSessionId: 'session-1',
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      })
      .mockResolvedValueOnce({
        PK: 'USER#user-1',
        SK: 'SESSION#session-1',
        entityType: 'USER_REFRESH_SESSION',
        userId: 'user-1',
        sessionId: 'session-1',
        sessionScope: 'MOBILE_APP',
        tokenHash: 'hash-1',
        expiresAt: '9999-12-31T23:59:59.999Z',
        revokedAt: null,
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T10:10:00.000Z',
        lastUsedAt: '2026-03-18T10:10:00.000Z',
      });

    await expect(
      service.persistIssuedRefreshToken('user-1', 'refresh-token', metadata),
    ).resolves.toEqual(
      expect.objectContaining({
        session: expect.objectContaining({
          sessionId: 'session-2',
          sessionScope: 'MOBILE_APP',
        }),
        replacedSessionId: 'session-1',
      }),
    );

    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'put',
        item: expect.objectContaining({
          sessionId: 'session-1',
          revokedAt: expect.any(String),
          replacedBySessionId: 'session-2',
        }),
      }),
      expect.objectContaining({
        kind: 'put',
        item: expect.objectContaining({
          sessionId: 'session-2',
          sessionScope: 'MOBILE_APP',
        }),
      }),
      expect.objectContaining({
        kind: 'put',
        item: expect.objectContaining({
          entityType: 'USER_SESSION_SLOT',
          currentSessionId: 'session-2',
          sessionScope: 'MOBILE_APP',
        }),
      }),
    ]);
  });

  it('lists session history while hiding dismissed entries', async () => {
    repository.queryByPk.mockResolvedValue([
      {
        PK: 'USER#user-1',
        SK: 'SESSION#session-1',
        entityType: 'USER_REFRESH_SESSION',
        userId: 'user-1',
        sessionId: 'session-1',
        sessionScope: 'MOBILE_APP',
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
        sessionScope: 'WEB_DESKTOP',
        tokenHash: 'hash-2',
        expiresAt: '2020-01-01T00:00:00.000Z',
        revokedAt: null,
        dismissedAt: '2026-03-18T10:30:00.000Z',
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

  it('keeps expired sessions in history when not dismissed', async () => {
    repository.queryByPk.mockResolvedValue([
      {
        PK: 'USER#user-1',
        SK: 'SESSION#session-expired',
        entityType: 'USER_REFRESH_SESSION',
        userId: 'user-1',
        sessionId: 'session-expired',
        sessionScope: 'WEB_DESKTOP',
        tokenHash: 'hash-expired',
        expiresAt: '2020-01-01T00:00:00.000Z',
        revokedAt: null,
        dismissedAt: null,
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      },
    ]);

    await expect(service.listSessionsForUser('user-1')).resolves.toEqual([
      expect.objectContaining({
        sessionId: 'session-expired',
      }),
    ]);
  });

  it('dismisses a revoked session from history', async () => {
    repository.get.mockResolvedValue({
      PK: 'USER#user-1',
      SK: 'SESSION#session-dismiss',
      entityType: 'USER_REFRESH_SESSION',
      userId: 'user-1',
      sessionId: 'session-dismiss',
      sessionScope: 'WEB_DESKTOP',
      tokenHash: 'hash-dismiss',
      expiresAt: '9999-12-31T23:59:59.999Z',
      revokedAt: '2026-03-18T11:00:00.000Z',
      dismissedAt: null,
      createdAt: '2026-03-18T10:00:00.000Z',
      updatedAt: '2026-03-18T11:00:00.000Z',
    });

    const result = await service.dismissSessionHistoryById(
      'user-1',
      'session-dismiss',
    );

    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        sessionId: 'session-dismiss',
        dismissedAt: expect.any(String),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        sessionId: 'session-dismiss',
        dismissedAt: expect.any(String),
      }),
    );
  });

  it('rejects dismissing an active session', async () => {
    repository.get.mockResolvedValue({
      PK: 'USER#user-1',
      SK: 'SESSION#session-active',
      entityType: 'USER_REFRESH_SESSION',
      userId: 'user-1',
      sessionId: 'session-active',
      sessionScope: 'MOBILE_APP',
      tokenHash: 'hash-active',
      expiresAt: '9999-12-31T23:59:59.999Z',
      revokedAt: null,
      dismissedAt: null,
      createdAt: '2026-03-18T10:00:00.000Z',
      updatedAt: '2026-03-18T10:00:00.000Z',
    });

    await expect(
      service.dismissSessionHistoryById('user-1', 'session-active'),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Only revoked or expired sessions can be removed from history.',
      ),
    );
    expect(repository.put).not.toHaveBeenCalled();
  });

  it('revokes a specific session by id', async () => {
    repository.get
      .mockResolvedValueOnce({
        PK: 'USER#user-1',
        SK: 'SESSION#session-1',
        entityType: 'USER_REFRESH_SESSION',
        userId: 'user-1',
        sessionId: 'session-1',
        sessionScope: 'MOBILE_APP',
        tokenHash: 'hash-1',
        expiresAt: '9999-12-31T23:59:59.999Z',
        revokedAt: null,
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      })
      .mockResolvedValueOnce({
        PK: 'USER#user-1',
        SK: 'SESSION_SLOT#MOBILE_APP',
        entityType: 'USER_SESSION_SLOT',
        userId: 'user-1',
        sessionScope: 'MOBILE_APP',
        currentSessionId: 'session-1',
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T10:00:00.000Z',
      });

    const session = await service.revokeSessionById('user-1', 'session-1');

    expect(repository.transactWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'put',
        item: expect.objectContaining({
          sessionId: 'session-1',
          revokedAt: expect.any(String),
        }),
      }),
      expect.objectContaining({
        kind: 'delete',
        key: {
          PK: 'USER#user-1',
          SK: 'SESSION_SLOT#MOBILE_APP',
        },
      }),
    ]);
    expect(session).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        revokedAt: expect.any(String),
      }),
    );
  });

  it('revokes every active session for a user', async () => {
    repository.queryByPk
      .mockResolvedValueOnce([
        {
          PK: 'USER#user-1',
          SK: 'SESSION#session-1',
          entityType: 'USER_REFRESH_SESSION',
          userId: 'user-1',
          sessionId: 'session-1',
          sessionScope: 'MOBILE_APP',
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
          sessionScope: 'WEB_DESKTOP',
          tokenHash: 'hash-2',
          expiresAt: '9999-12-31T23:59:59.999Z',
          revokedAt: '2026-03-18T11:00:00.000Z',
          createdAt: '2026-03-18T10:00:00.000Z',
          updatedAt: '2026-03-18T11:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          PK: 'USER#user-1',
          SK: 'SESSION_SLOT#MOBILE_APP',
          entityType: 'USER_SESSION_SLOT',
          userId: 'user-1',
          sessionScope: 'MOBILE_APP',
          currentSessionId: 'session-1',
          createdAt: '2026-03-18T10:00:00.000Z',
          updatedAt: '2026-03-18T10:00:00.000Z',
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
    expect(repository.delete).toHaveBeenCalledWith(
      'Users',
      'USER#user-1',
      'SESSION_SLOT#MOBILE_APP',
    );
  });

  it('keeps the current session active when exceptSessionId is provided', async () => {
    repository.queryByPk
      .mockResolvedValueOnce([
        {
          PK: 'USER#user-1',
          SK: 'SESSION#session-1',
          entityType: 'USER_REFRESH_SESSION',
          userId: 'user-1',
          sessionId: 'session-1',
          sessionScope: 'MOBILE_APP',
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
          sessionScope: 'WEB_DESKTOP',
          tokenHash: 'hash-2',
          expiresAt: '9999-12-31T23:59:59.999Z',
          revokedAt: null,
          createdAt: '2026-03-18T10:00:00.000Z',
          updatedAt: '2026-03-18T10:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          PK: 'USER#user-1',
          SK: 'SESSION_SLOT#MOBILE_APP',
          entityType: 'USER_SESSION_SLOT',
          userId: 'user-1',
          sessionScope: 'MOBILE_APP',
          currentSessionId: 'session-1',
          createdAt: '2026-03-18T10:00:00.000Z',
          updatedAt: '2026-03-18T10:00:00.000Z',
        },
        {
          PK: 'USER#user-1',
          SK: 'SESSION_SLOT#WEB_DESKTOP',
          entityType: 'USER_SESSION_SLOT',
          userId: 'user-1',
          sessionScope: 'WEB_DESKTOP',
          currentSessionId: 'session-2',
          createdAt: '2026-03-18T10:00:00.000Z',
          updatedAt: '2026-03-18T10:00:00.000Z',
        },
      ]);

    await expect(
      service.revokeAllSessionsForUser('user-1', {
        exceptSessionId: 'session-1',
      }),
    ).resolves.toBe(1);

    expect(repository.put).toHaveBeenCalledTimes(1);
    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        sessionId: 'session-2',
      }),
    );
    expect(repository.delete).toHaveBeenCalledTimes(1);
    expect(repository.delete).toHaveBeenCalledWith(
      'Users',
      'USER#user-1',
      'SESSION_SLOT#WEB_DESKTOP',
    );
  });

  it('rejects a revoked session-based access token immediately', async () => {
    repository.get.mockResolvedValue({
      PK: 'USER#user-1',
      SK: 'SESSION#session-1',
      entityType: 'USER_REFRESH_SESSION',
      userId: 'user-1',
      sessionId: 'session-1',
      sessionScope: 'MOBILE_APP',
      tokenHash: 'hash-1',
      expiresAt: '9999-12-31T23:59:59.999Z',
      revokedAt: '2026-03-18T11:00:00.000Z',
      createdAt: '2026-03-18T10:00:00.000Z',
      updatedAt: '2026-03-18T11:00:00.000Z',
    });

    await expect(
      service.assertActiveSessionForAccessToken(
        buildClaims({ sid: 'session-1', tokenType: 'access' }),
      ),
    ).rejects.toThrow(
      new UnauthorizedException('Refresh token session has been revoked.'),
    );
  });

  it('returns an idempotent result when revoking an already revoked refresh token', async () => {
    const claims = buildClaims({ sid: 'session-1' });
    const tokenHash = createHash('sha256')
      .update('refresh-token')
      .digest('hex');

    jwtTokenService.verifyRefreshToken.mockReturnValue(claims);
    repository.get
      .mockResolvedValueOnce({
        PK: 'USER#user-1',
        SK: 'SESSION#session-1',
        entityType: 'USER_REFRESH_SESSION',
        userId: 'user-1',
        sessionId: 'session-1',
        sessionScope: 'MOBILE_APP',
        tokenHash,
        expiresAt: '9999-12-31T23:59:59.999Z',
        revokedAt: '2026-03-18T11:00:00.000Z',
        createdAt: '2026-03-18T10:00:00.000Z',
        updatedAt: '2026-03-18T11:00:00.000Z',
      })
      .mockResolvedValueOnce(undefined);

    await expect(service.revokeRefreshToken('refresh-token')).resolves.toEqual({
      claims,
      revoked: false,
      alreadyRevoked: true,
      legacy: false,
    });
    expect(repository.put).not.toHaveBeenCalled();
    expect(repository.transactWrite).not.toHaveBeenCalled();
  });

  it('rejects refresh token revocation when the token is invalid', async () => {
    jwtTokenService.verifyRefreshToken.mockImplementation(() => {
      throw new UnauthorizedException('Refresh token is invalid.');
    });

    await expect(service.revokeRefreshToken('bad-token')).rejects.toThrow(
      new UnauthorizedException('Refresh token is invalid.'),
    );
    expect(repository.put).not.toHaveBeenCalled();
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
