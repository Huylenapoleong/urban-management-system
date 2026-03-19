import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { JwtClaims } from '@urban/shared-types';
import type {
  StoredRefreshSession,
  StoredUser,
} from '../../common/storage-records';
import type { SessionClientMetadata } from '../../common/request-session-metadata';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const usersService = {
    getByIdOrThrow: jest.fn(),
    registerCitizen: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    getUser: jest.fn(),
  };
  const passwordService = {
    verifyPassword: jest.fn(),
    hashPassword: jest.fn(),
  };
  const jwtTokenService = {
    issueTokenPair: jest.fn(),
    verifyRefreshToken: jest.fn(),
  };
  const refreshSessionService = {
    resolveRefreshToken: jest.fn(),
    persistIssuedRefreshToken: jest.fn(),
    rotateRefreshSession: jest.fn(),
    migrateLegacyRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    listSessionsForUser: jest.fn(),
    revokeSessionById: jest.fn(),
    revokeAllSessionsForUser: jest.fn(),
  };
  const chatRealtimeService = {
    disconnectSessionSockets: jest.fn(),
    disconnectUserSockets: jest.fn(),
  };
  const observabilityService = {
    recordSessionRevocations: jest.fn(),
  };

  let service: AuthService;

  const storedUser: StoredUser = {
    PK: 'USER#user-1',
    SK: 'PROFILE',
    entityType: 'USER_PROFILE',
    userId: 'user-1',
    phone: '0900000001',
    email: 'citizen.a@smartcity.local',
    passwordHash: 'hashed-password',
    fullName: 'Citizen A',
    role: 'CITIZEN',
    locationCode: 'VN-79-760-26734',
    unit: undefined,
    avatarUrl: undefined,
    status: 'ACTIVE',
    deletedAt: null,
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
    GSI1SK: 'USER',
  };

  const activeSession: StoredRefreshSession = {
    PK: 'USER#user-1',
    SK: 'SESSION#session-1',
    entityType: 'USER_REFRESH_SESSION',
    userId: 'user-1',
    sessionId: 'session-1',
    tokenHash: 'abc123',
    expiresAt: '2026-03-25T10:00:00.000Z',
    revokedAt: null,
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    deviceId: 'device-1',
    appVariant: 'mobile-app',
    lastUsedAt: '2026-03-18T10:00:00.000Z',
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  };

  const nextTokens = {
    accessToken: 'next-access-token',
    refreshToken: 'next-refresh-token',
    expiresIn: 3600,
    refreshExpiresIn: 604800,
    tokenType: 'Bearer' as const,
  };

  const sessionMetadata: SessionClientMetadata = {
    userAgent: 'Mozilla/5.0 (Android 14)',
    ipAddress: '203.113.1.20',
    deviceId: 'device-mobile-01',
    appVariant: 'mobile-app',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      usersService as never,
      passwordService as never,
      jwtTokenService as never,
      refreshSessionService as never,
      chatRealtimeService as never,
      observabilityService as never,
    );
    usersService.getByIdOrThrow.mockResolvedValue(storedUser);
    jwtTokenService.issueTokenPair.mockReturnValue(nextTokens);
  });

  it('rotates an existing session-based refresh token', async () => {
    refreshSessionService.resolveRefreshToken.mockResolvedValue({
      claims: buildClaims({ sid: activeSession.sessionId }),
      legacy: false,
      session: activeSession,
    });

    const result = await service.refresh(
      {
        refreshToken: 'current-refresh-token',
      },
      sessionMetadata,
    );

    expect(refreshSessionService.rotateRefreshSession).toHaveBeenCalledWith(
      activeSession,
      nextTokens.refreshToken,
      sessionMetadata,
    );
    expect(
      refreshSessionService.migrateLegacyRefreshToken,
    ).not.toHaveBeenCalled();
    expect(jwtTokenService.issueTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({ id: storedUser.userId }),
      expect.any(String),
    );
    expect(chatRealtimeService.disconnectSessionSockets).toHaveBeenCalledWith(
      activeSession.sessionId,
    );
    expect(observabilityService.recordSessionRevocations).toHaveBeenCalledWith(
      'refresh_rotation',
      1,
    );
    expect(result).toEqual({
      tokens: nextTokens,
      user: expect.objectContaining({ id: storedUser.userId }),
    });
  });

  it('migrates a legacy refresh token without forcing sign-in again', async () => {
    refreshSessionService.resolveRefreshToken.mockResolvedValue({
      claims: buildClaims(),
      legacy: true,
    });

    const result = await service.refresh(
      {
        refreshToken: 'legacy-refresh-token',
      },
      sessionMetadata,
    );

    expect(
      refreshSessionService.migrateLegacyRefreshToken,
    ).toHaveBeenCalledWith(
      storedUser.userId,
      'legacy-refresh-token',
      nextTokens.refreshToken,
      sessionMetadata,
    );
    expect(refreshSessionService.rotateRefreshSession).not.toHaveBeenCalled();
    expect(chatRealtimeService.disconnectSessionSockets).not.toHaveBeenCalled();
    expect(observabilityService.recordSessionRevocations).toHaveBeenCalledWith(
      'legacy_refresh_migration',
      1,
    );
    expect(result).toEqual({
      tokens: nextTokens,
      user: expect.objectContaining({ id: storedUser.userId }),
    });
  });

  it('rejects refresh for inactive users before issuing a new token pair', async () => {
    refreshSessionService.resolveRefreshToken.mockResolvedValue({
      claims: buildClaims({ sid: activeSession.sessionId }),
      legacy: false,
      session: activeSession,
    });
    usersService.getByIdOrThrow.mockResolvedValue({
      ...storedUser,
      status: 'LOCKED',
    });

    await expect(
      service.refresh({ refreshToken: 'current-refresh-token' }),
    ).rejects.toThrow(
      new UnauthorizedException('User account is unavailable.'),
    );
    expect(jwtTokenService.issueTokenPair).not.toHaveBeenCalled();
    expect(refreshSessionService.rotateRefreshSession).not.toHaveBeenCalled();
    expect(
      refreshSessionService.migrateLegacyRefreshToken,
    ).not.toHaveBeenCalled();
    expect(
      observabilityService.recordSessionRevocations,
    ).not.toHaveBeenCalled();
  });

  it('disconnects sockets for the logged out session immediately', async () => {
    jwtTokenService.verifyRefreshToken.mockReturnValue(
      buildClaims({ sid: activeSession.sessionId }),
    );

    await service.logout({ refreshToken: 'current-refresh-token' });

    expect(refreshSessionService.revokeRefreshToken).toHaveBeenCalledWith(
      'current-refresh-token',
    );
    expect(chatRealtimeService.disconnectSessionSockets).toHaveBeenCalledWith(
      activeSession.sessionId,
    );
    expect(observabilityService.recordSessionRevocations).toHaveBeenCalledWith(
      'logout',
      1,
    );
  });

  it('lists sessions with the current session marked first', async () => {
    refreshSessionService.listSessionsForUser.mockResolvedValue([
      {
        ...activeSession,
        sessionId: 'session-2',
        SK: 'SESSION#session-2',
        lastUsedAt: '2026-03-18T09:00:00.000Z',
        revokedAt: '2026-03-18T09:30:00.000Z',
      },
      activeSession,
    ]);

    const result = await service.listSessions(
      toAuthUser(),
      buildClaims({ sid: activeSession.sessionId, tokenType: 'access' }),
    );

    expect(refreshSessionService.listSessionsForUser).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        sessionId: activeSession.sessionId,
        isCurrent: true,
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        sessionId: 'session-2',
        isCurrent: false,
      }),
    );
  });

  it('revokes a specific session and disconnects its sockets', async () => {
    refreshSessionService.revokeSessionById.mockResolvedValue({
      ...activeSession,
      revokedAt: '2026-03-18T12:45:00.000Z',
      updatedAt: '2026-03-18T12:45:00.000Z',
    });

    const result = await service.revokeSession(
      toAuthUser(),
      buildClaims({ sid: activeSession.sessionId, tokenType: 'access' }),
      'session-2',
    );

    expect(refreshSessionService.revokeSessionById).toHaveBeenCalledWith(
      storedUser.userId,
      'session-2',
    );
    expect(chatRealtimeService.disconnectSessionSockets).toHaveBeenCalledWith(
      'session-2',
    );
    expect(observabilityService.recordSessionRevocations).toHaveBeenCalledWith(
      'session_revoke',
      1,
    );
    expect(result).toEqual({
      sessionId: 'session-2',
      revokedAt: '2026-03-18T12:45:00.000Z',
      currentSessionRevoked: false,
    });
  });

  it('throws when trying to revoke an unknown session', async () => {
    refreshSessionService.revokeSessionById.mockResolvedValue(undefined);

    await expect(
      service.revokeSession(
        toAuthUser(),
        buildClaims({ sid: activeSession.sessionId, tokenType: 'access' }),
        'missing-session',
      ),
    ).rejects.toThrow(new NotFoundException('Session not found.'));
    expect(
      observabilityService.recordSessionRevocations,
    ).not.toHaveBeenCalled();
  });

  it('revokes all sessions and disconnects the user sockets', async () => {
    refreshSessionService.revokeAllSessionsForUser.mockResolvedValue(3);

    const result = await service.logoutAll(
      toAuthUser(),
      buildClaims({ sid: activeSession.sessionId, tokenType: 'access' }),
    );

    expect(refreshSessionService.revokeAllSessionsForUser).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(chatRealtimeService.disconnectUserSockets).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(observabilityService.recordSessionRevocations).toHaveBeenCalledWith(
      'logout_all',
      3,
    );
    expect(result).toEqual(
      expect.objectContaining({
        revokedSessionCount: 3,
        currentSessionRevoked: true,
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
    exp: 1_742_866_000,
    ...overrides,
  };
}

function toAuthUser() {
  return {
    id: 'user-1',
    phone: '0900000001',
    email: 'citizen.a@smartcity.local',
    fullName: 'Citizen A',
    role: 'CITIZEN' as const,
    locationCode: 'VN-79-760-26734',
    unit: undefined,
    avatarUrl: undefined,
    status: 'ACTIVE' as const,
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  };
}
