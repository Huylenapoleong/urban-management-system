import { UnauthorizedException } from '@nestjs/common';
import type { JwtClaims } from '@urban/shared-types';
import { RefreshSessionService } from './refresh-session.service';

describe('RefreshSessionService', () => {
  const repository = {
    get: jest.fn(),
    put: jest.fn(),
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
