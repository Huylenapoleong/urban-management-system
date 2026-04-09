import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtClaims } from '@urban/shared-types';
import type {
  StoredRefreshSession,
  StoredUser,
} from '../../common/storage-records';
import type { SessionClientMetadata } from '../../common/request-session-metadata';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const usersService = {
    deactivateOwnAccount: jest.fn(),
    getByIdOrThrow: jest.fn(),
    getActiveByIdOrThrow: jest.fn(),
    registerCitizen: jest.fn(),
    registerCitizenWithPreparedInput: jest.fn(),
    reactivateOwnAccount: jest.fn(),
    deleteOwnAccountPermanently: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    updatePassword: jest.fn(),
    getUser: jest.fn(),
  };
  const authOtpService = {
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
    consumeOtp: jest.fn(),
    upsertRegisterDraft: jest.fn(),
    getActiveRegisterDraft: jest.fn(),
    consumeRegisterDraft: jest.fn(),
  };
  const passwordService = {
    verifyPassword: jest.fn(),
    hashPassword: jest.fn(),
  };
  const passwordPolicyService = {
    validateOrThrow: jest.fn(),
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
    dismissSessionHistoryById: jest.fn(),
    revokeAllSessionsForUser: jest.fn(),
  };
  const chatRealtimeService = {
    disconnectSessionSockets: jest.fn(),
    disconnectUserSockets: jest.fn(),
  };
  const observabilityService = {
    recordSessionRevocations: jest.fn(),
  };
  const repository = {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  const config = {
    dynamodbUsersTableName: 'Users',
    authLoginMaxAttempts: 5,
    authLoginWindowSeconds: 900,
    authLoginLockSeconds: 900,
    authRegisterMaxAttempts: 5,
    authRegisterWindowSeconds: 900,
    authRegisterLockSeconds: 900,
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
    sessionScope: 'MOBILE_APP',
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
      authOtpService as never,
      passwordPolicyService as never,
      passwordService as never,
      jwtTokenService as never,
      refreshSessionService as never,
      chatRealtimeService as never,
      observabilityService as never,
      repository as never,
      config as never,
    );
    passwordPolicyService.validateOrThrow.mockImplementation(() => undefined);
    usersService.getByIdOrThrow.mockResolvedValue(storedUser);
    usersService.getActiveByIdOrThrow.mockResolvedValue(storedUser);
    jwtTokenService.issueTokenPair.mockReturnValue(nextTokens);
    repository.get.mockResolvedValue(undefined);
  });

  it('rotates an existing session-based refresh token', async () => {
    refreshSessionService.resolveRefreshToken.mockResolvedValue({
      claims: buildClaims({ sid: activeSession.sessionId }),
      legacy: false,
      session: activeSession,
    });
    refreshSessionService.rotateRefreshSession.mockResolvedValue({
      session: {
        ...activeSession,
        sessionId: 'session-2',
        SK: 'SESSION#session-2',
      },
      replacedSessionId: activeSession.sessionId,
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

  it('replaces the previous session when logging in again on the same scope', async () => {
    usersService.findByEmail.mockResolvedValue(storedUser);
    passwordService.verifyPassword.mockResolvedValue(true);
    refreshSessionService.persistIssuedRefreshToken.mockResolvedValue({
      session: {
        ...activeSession,
        sessionId: 'session-2',
        SK: 'SESSION#session-2',
      },
      replacedSessionId: activeSession.sessionId,
    });

    const result = await service.login(
      {
        login: storedUser.email,
        password: 'Password123!',
      },
      sessionMetadata,
    );

    expect(
      refreshSessionService.persistIssuedRefreshToken,
    ).toHaveBeenCalledWith(
      storedUser.userId,
      nextTokens.refreshToken,
      sessionMetadata,
    );
    expect(chatRealtimeService.disconnectSessionSockets).toHaveBeenCalledWith(
      activeSession.sessionId,
    );
    expect(observabilityService.recordSessionRevocations).toHaveBeenCalledWith(
      'session_scope_replace',
      1,
    );
    expect(result).toEqual({
      tokens: nextTokens,
      user: expect.objectContaining({ id: storedUser.userId }),
    });
  });

  it('rejects login when password does not satisfy policy', async () => {
    passwordPolicyService.validateOrThrow.mockImplementationOnce(() => {
      throw new BadRequestException('password is too common or predictable.');
    });

    await expect(
      service.login(
        {
          login: storedUser.email,
          password: 'Password123!',
        },
        sessionMetadata,
      ),
    ).rejects.toThrow(
      new BadRequestException('password is too common or predictable.'),
    );
    expect(usersService.findByEmail).not.toHaveBeenCalled();
  });

  it('blocks login when attempt window is locked', async () => {
    repository.get.mockResolvedValueOnce({
      PK: 'AUTH#ATTEMPT#LOGIN#EMAIL#citizen.a@smartcity.local',
      SK: 'ATTEMPT',
      entityType: 'AUTH_IDENTITY_ATTEMPT',
      purpose: 'LOGIN',
      identityType: 'EMAIL',
      identityValue: 'citizen.a@smartcity.local',
      attemptCount: 5,
      firstAttemptAt: '2026-03-18T09:50:00.000Z',
      lastAttemptAt: '2026-03-18T09:59:00.000Z',
      lockedUntil: '2999-01-01T00:00:00.000Z',
      expiresAt: '2999-01-01T00:10:00.000Z',
      createdAt: '2026-03-18T09:50:00.000Z',
      updatedAt: '2026-03-18T09:59:00.000Z',
    });

    await expect(
      service.login(
        {
          login: storedUser.email,
          password: 'Password123!',
        },
        sessionMetadata,
      ),
    ).rejects.toMatchObject({
      status: 429,
      message: 'Too many attempts. Please try again later.',
    });
    expect(usersService.findByEmail).not.toHaveBeenCalled();
  });

  it('records failed login attempts for invalid credentials', async () => {
    usersService.findByEmail.mockResolvedValue(undefined);

    await expect(
      service.login(
        {
          login: storedUser.email,
          password: 'Password123!',
        },
        sessionMetadata,
      ),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials.'));

    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        entityType: 'AUTH_IDENTITY_ATTEMPT',
        purpose: 'LOGIN',
        identityType: 'EMAIL',
        identityValue: storedUser.email,
        attemptCount: 1,
      }),
    );
  });

  it('requests OTP for forgot password without exposing account existence', async () => {
    usersService.findByEmail.mockResolvedValue(undefined);

    await expect(
      service.requestForgotPasswordOtp({ login: 'missing@smartcity.local' }),
    ).resolves.toEqual({
      requested: true,
    });
    expect(authOtpService.requestOtp).not.toHaveBeenCalled();
  });

  it('confirms forgot password and consumes OTP only after password update succeeds', async () => {
    usersService.findByEmail.mockResolvedValue(storedUser);
    passwordService.verifyPassword.mockResolvedValue(false);
    passwordService.hashPassword.mockResolvedValue('forgot-new-hash');
    refreshSessionService.revokeAllSessionsForUser.mockResolvedValue(2);

    await expect(
      service.confirmForgotPassword({
        login: storedUser.email,
        otpCode: '123456',
        newPassword: 'Password456!',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        revokedSessionCount: 2,
      }),
    );

    expect(authOtpService.verifyOtp).toHaveBeenCalledWith(
      {
        purpose: 'FORGOT_PASSWORD',
        email: storedUser.email,
        otpCode: '123456',
        userId: storedUser.userId,
      },
      { consumeOnSuccess: false },
    );
    expect(usersService.updatePassword).toHaveBeenCalledWith(
      storedUser.userId,
      'forgot-new-hash',
    );
    expect(authOtpService.consumeOtp).toHaveBeenCalledWith({
      purpose: 'FORGOT_PASSWORD',
      email: storedUser.email,
      userId: storedUser.userId,
    });
    expect(chatRealtimeService.disconnectUserSockets).toHaveBeenCalledWith(
      storedUser.userId,
    );
  });

  it('does not consume forgot-password OTP when password update fails', async () => {
    usersService.findByEmail.mockResolvedValue(storedUser);
    passwordService.verifyPassword.mockResolvedValue(false);
    passwordService.hashPassword.mockResolvedValue('forgot-new-hash');
    usersService.updatePassword.mockRejectedValueOnce(
      new Error('db write failed'),
    );

    await expect(
      service.confirmForgotPassword({
        login: storedUser.email,
        otpCode: '123456',
        newPassword: 'Password456!',
      }),
    ).rejects.toThrow('db write failed');

    expect(authOtpService.verifyOtp).toHaveBeenCalledWith(
      {
        purpose: 'FORGOT_PASSWORD',
        email: storedUser.email,
        otpCode: '123456',
        userId: storedUser.userId,
      },
      { consumeOnSuccess: false },
    );
    expect(authOtpService.consumeOtp).not.toHaveBeenCalled();
  });

  it('still succeeds forgot-password confirm when OTP consume fails after password reset', async () => {
    usersService.findByEmail.mockResolvedValue(storedUser);
    passwordService.verifyPassword.mockResolvedValue(false);
    passwordService.hashPassword.mockResolvedValue('forgot-new-hash');
    refreshSessionService.revokeAllSessionsForUser.mockResolvedValue(2);
    authOtpService.consumeOtp.mockRejectedValueOnce(
      new Error('consume failed'),
    );

    await expect(
      service.confirmForgotPassword({
        login: storedUser.email,
        otpCode: '123456',
        newPassword: 'Password456!',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        revokedSessionCount: 2,
      }),
    );
    expect(usersService.updatePassword).toHaveBeenCalledWith(
      storedUser.userId,
      'forgot-new-hash',
    );
    expect(refreshSessionService.revokeAllSessionsForUser).toHaveBeenCalledWith(
      storedUser.userId,
    );
  });

  it('changes password and revokes other sessions while keeping current session active', async () => {
    usersService.getByIdOrThrow.mockResolvedValue(storedUser);
    passwordService.verifyPassword
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    passwordService.hashPassword.mockResolvedValue('new-hash');
    refreshSessionService.listSessionsForUser.mockResolvedValue([
      activeSession,
      {
        ...activeSession,
        sessionId: 'session-2',
        SK: 'SESSION#session-2',
        revokedAt: null,
      },
    ]);
    refreshSessionService.revokeAllSessionsForUser.mockResolvedValue(1);

    await expect(
      service.changePassword(
        toAuthUser(),
        buildClaims({ sid: activeSession.sessionId, tokenType: 'access' }),
        {
          currentPassword: 'Password123!',
          newPassword: 'Password456!',
          otpCode: '123456',
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        revokedSessionCount: 1,
        currentSessionRevoked: false,
      }),
    );
    expect(authOtpService.verifyOtp).toHaveBeenCalledWith(
      {
        purpose: 'CHANGE_PASSWORD',
        email: storedUser.email,
        otpCode: '123456',
        userId: storedUser.userId,
      },
      { consumeOnSuccess: false },
    );
    expect(usersService.updatePassword).toHaveBeenCalledWith(
      storedUser.userId,
      'new-hash',
    );
    expect(refreshSessionService.revokeAllSessionsForUser).toHaveBeenCalledWith(
      storedUser.userId,
      { exceptSessionId: activeSession.sessionId },
    );
    expect(chatRealtimeService.disconnectSessionSockets).toHaveBeenCalledWith(
      'session-2',
    );
    expect(chatRealtimeService.disconnectUserSockets).not.toHaveBeenCalled();
    expect(observabilityService.recordSessionRevocations).toHaveBeenCalledWith(
      'password_change',
      1,
    );
    expect(authOtpService.consumeOtp).toHaveBeenCalledWith({
      purpose: 'CHANGE_PASSWORD',
      email: storedUser.email,
      userId: storedUser.userId,
    });
  });

  it('migrates a legacy refresh token without forcing sign-in again', async () => {
    refreshSessionService.resolveRefreshToken.mockResolvedValue({
      claims: buildClaims(),
      legacy: true,
    });
    refreshSessionService.migrateLegacyRefreshToken.mockResolvedValue({
      session: {
        ...activeSession,
        sessionId: 'session-legacy-1',
        SK: 'SESSION#session-legacy-1',
      },
      replacedSessionId: undefined,
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
    refreshSessionService.revokeRefreshToken.mockResolvedValue({
      claims: buildClaims({ sid: activeSession.sessionId }),
      revoked: true,
      alreadyRevoked: false,
      legacy: false,
    });

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

  it('keeps logout idempotent for an already revoked refresh token', async () => {
    refreshSessionService.revokeRefreshToken.mockResolvedValue({
      claims: buildClaims({ sid: activeSession.sessionId }),
      revoked: false,
      alreadyRevoked: true,
      legacy: false,
    });

    await expect(
      service.logout({ refreshToken: 'current-refresh-token' }),
    ).resolves.toEqual({
      loggedOut: true,
    });
    expect(
      observabilityService.recordSessionRevocations,
    ).not.toHaveBeenCalled();
    expect(chatRealtimeService.disconnectSessionSockets).toHaveBeenCalledWith(
      activeSession.sessionId,
    );
  });

  it('rejects logout when the provided refresh token is invalid', async () => {
    refreshSessionService.revokeRefreshToken.mockRejectedValue(
      new UnauthorizedException('Refresh token is invalid.'),
    );

    await expect(
      service.logout({ refreshToken: 'invalid-refresh-token' }),
    ).rejects.toThrow(new UnauthorizedException('Refresh token is invalid.'));
    expect(chatRealtimeService.disconnectSessionSockets).not.toHaveBeenCalled();
    expect(chatRealtimeService.disconnectUserSockets).not.toHaveBeenCalled();
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

  it('dismisses revoked session history for current user', async () => {
    refreshSessionService.dismissSessionHistoryById.mockResolvedValue({
      ...activeSession,
      revokedAt: '2026-03-18T12:45:00.000Z',
      dismissedAt: '2026-03-18T13:00:00.000Z',
      updatedAt: '2026-03-18T13:00:00.000Z',
    });

    const result = await service.dismissSessionHistory(
      toAuthUser(),
      buildClaims({ sid: activeSession.sessionId, tokenType: 'access' }),
      'session-1',
    );

    expect(
      refreshSessionService.dismissSessionHistoryById,
    ).toHaveBeenCalledWith(storedUser.userId, 'session-1');
    expect(result).toEqual({
      sessionId: 'session-1',
      dismissedAt: '2026-03-18T13:00:00.000Z',
    });
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

  it('deactivates current account after OTP verification and revokes sessions', async () => {
    usersService.getActiveByIdOrThrow.mockResolvedValue(storedUser);
    usersService.deactivateOwnAccount.mockResolvedValue({
      ...storedUser,
      status: 'DEACTIVATED',
      updatedAt: '2026-03-18T13:15:00.000Z',
    });
    refreshSessionService.revokeAllSessionsForUser.mockResolvedValue(2);

    await expect(
      service.confirmDeactivateAccount(
        toAuthUser(),
        buildClaims({ sid: activeSession.sessionId, tokenType: 'access' }),
        {
          otpCode: '123456',
        },
      ),
    ).resolves.toEqual({
      status: 'DEACTIVATED',
      occurredAt: '2026-03-18T13:15:00.000Z',
      revokedSessionCount: 2,
      currentSessionRevoked: true,
    });
    expect(authOtpService.verifyOtp).toHaveBeenCalledWith(
      {
        purpose: 'DEACTIVATE_ACCOUNT',
        email: storedUser.email,
        otpCode: '123456',
        userId: storedUser.userId,
      },
      { consumeOnSuccess: false },
    );
    expect(usersService.deactivateOwnAccount).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(refreshSessionService.revokeAllSessionsForUser).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(chatRealtimeService.disconnectUserSockets).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(authOtpService.consumeOtp).toHaveBeenCalledWith({
      purpose: 'DEACTIVATE_ACCOUNT',
      email: storedUser.email,
      userId: storedUser.userId,
    });
  });

  it('requests OTP for account reactivation only when credentials are valid', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...storedUser,
      status: 'DEACTIVATED',
    });
    passwordService.verifyPassword.mockResolvedValue(true);
    authOtpService.requestOtp.mockResolvedValue({
      purpose: 'REACTIVATE_ACCOUNT',
      email: storedUser.email,
      maskedEmail: 'ci***@smartcity.local',
      expiresAt: '2026-03-19T10:05:00.000Z',
      resendAvailableAt: '2026-03-19T10:01:00.000Z',
    });

    await expect(
      service.requestReactivateAccountOtp({
        login: storedUser.email,
        password: 'Password123!',
      }),
    ).resolves.toEqual({
      otpRequested: true,
      purpose: 'REACTIVATE_ACCOUNT',
      maskedEmail: 'ci***@smartcity.local',
      expiresAt: '2026-03-19T10:05:00.000Z',
      resendAvailableAt: '2026-03-19T10:01:00.000Z',
    });
    expect(authOtpService.requestOtp).toHaveBeenCalledWith({
      purpose: 'REACTIVATE_ACCOUNT',
      email: storedUser.email,
      userId: storedUser.userId,
    });
  });

  it('reactivates account after OTP verification and issues a new token pair', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...storedUser,
      status: 'DEACTIVATED',
    });
    passwordService.verifyPassword.mockResolvedValue(true);
    usersService.reactivateOwnAccount.mockResolvedValue(storedUser);
    refreshSessionService.persistIssuedRefreshToken.mockResolvedValue({
      session: {
        ...activeSession,
        sessionId: 'session-3',
        SK: 'SESSION#session-3',
      },
      replacedSessionId: undefined,
    });

    await expect(
      service.confirmReactivateAccount(
        {
          login: storedUser.email,
          password: 'Password123!',
          otpCode: '123456',
        },
        sessionMetadata,
      ),
    ).resolves.toEqual({
      tokens: nextTokens,
      user: expect.objectContaining({ id: storedUser.userId }),
    });
    expect(authOtpService.verifyOtp).toHaveBeenCalledWith(
      {
        purpose: 'REACTIVATE_ACCOUNT',
        email: storedUser.email,
        otpCode: '123456',
        userId: storedUser.userId,
      },
      { consumeOnSuccess: false },
    );
    expect(usersService.reactivateOwnAccount).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(authOtpService.consumeOtp).toHaveBeenCalledWith({
      purpose: 'REACTIVATE_ACCOUNT',
      email: storedUser.email,
      userId: storedUser.userId,
    });
  });

  it('permanently deletes account after password and OTP verification', async () => {
    usersService.getActiveByIdOrThrow.mockResolvedValue(storedUser);
    usersService.deleteOwnAccountPermanently.mockResolvedValue({
      ...storedUser,
      phone: undefined,
      email: undefined,
      fullName: 'Deleted User',
      status: 'DELETED',
      deletedAt: '2026-03-18T13:20:00.000Z',
      updatedAt: '2026-03-18T13:20:00.000Z',
    });
    passwordService.verifyPassword.mockResolvedValue(true);
    refreshSessionService.revokeAllSessionsForUser.mockResolvedValue(3);

    await expect(
      service.confirmDeleteAccount(
        toAuthUser(),
        buildClaims({ sid: activeSession.sessionId, tokenType: 'access' }),
        {
          currentPassword: 'Password123!',
          otpCode: '123456',
          acceptTerms: true,
        },
      ),
    ).resolves.toEqual({
      status: 'DELETED',
      deletedAt: '2026-03-18T13:20:00.000Z',
      revokedSessionCount: 3,
      currentSessionRevoked: true,
    });
    expect(authOtpService.verifyOtp).toHaveBeenCalledWith(
      {
        purpose: 'DELETE_ACCOUNT',
        email: storedUser.email,
        otpCode: '123456',
        userId: storedUser.userId,
      },
      { consumeOnSuccess: false },
    );
    expect(usersService.deleteOwnAccountPermanently).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(refreshSessionService.revokeAllSessionsForUser).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(chatRealtimeService.disconnectUserSockets).toHaveBeenCalledWith(
      storedUser.userId,
    );
    expect(authOtpService.consumeOtp).toHaveBeenCalledWith({
      purpose: 'DELETE_ACCOUNT',
      email: storedUser.email,
      userId: storedUser.userId,
    });
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
