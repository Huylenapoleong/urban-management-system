import { UnauthorizedException } from '@nestjs/common';
import type { JwtClaims } from '@urban/shared-types';
import type {
  StoredRefreshSession,
  StoredUser,
} from '../../common/storage-records';
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
  };
  const refreshSessionService = {
    resolveRefreshToken: jest.fn(),
    persistIssuedRefreshToken: jest.fn(),
    rotateRefreshSession: jest.fn(),
    migrateLegacyRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      usersService as never,
      passwordService as never,
      jwtTokenService as never,
      refreshSessionService as never,
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

    const result = await service.refresh({
      refreshToken: 'current-refresh-token',
    });

    expect(refreshSessionService.rotateRefreshSession).toHaveBeenCalledWith(
      activeSession,
      nextTokens.refreshToken,
    );
    expect(
      refreshSessionService.migrateLegacyRefreshToken,
    ).not.toHaveBeenCalled();
    expect(jwtTokenService.issueTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({ id: storedUser.userId }),
      expect.any(String),
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

    const result = await service.refresh({
      refreshToken: 'legacy-refresh-token',
    });

    expect(
      refreshSessionService.migrateLegacyRefreshToken,
    ).toHaveBeenCalledWith(
      storedUser.userId,
      'legacy-refresh-token',
      nextTokens.refreshToken,
    );
    expect(refreshSessionService.rotateRefreshSession).not.toHaveBeenCalled();
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
