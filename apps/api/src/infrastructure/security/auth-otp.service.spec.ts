import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthOtpService } from './auth-otp.service';

describe('AuthOtpService', () => {
  const repository = {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  const redisClient = {
    del: jest.fn(),
    expire: jest.fn(),
    get: jest.fn(),
    incr: jest.fn(),
    set: jest.fn(),
  };
  const realtimeRedisService = {
    connected: false,
    getClient: jest.fn(),
  };
  const config = {
    authOtpProvider: 'disabled',
    authOtpWebhookUrl: undefined as string | undefined,
    authOtpWebhookTimeoutMs: 5000,
    authOtpSmtpHost: undefined,
    authOtpSmtpPort: 465,
    authOtpSmtpSecure: true,
    authOtpSmtpUsername: undefined,
    authOtpSmtpPassword: undefined,
    authOtpSmtpFrom: undefined,
    authOtpSmtpHelo: undefined,
    authOtpCodeLength: 6,
    authOtpTtlSeconds: 300,
    authOtpResendCooldownSeconds: 60,
    authOtpMaxAttempts: 5,
    authOtpRequestRateLimitWindowSeconds: 3600,
    authOtpRequestRateLimitMaxPerWindow: 10,
    authOtpRedisLockSeconds: 5,
    authRegisterDraftTtlSeconds: 900,
    dynamodbUsersTableName: 'Users',
    redisKeyPrefix: 'urban',
  };

  let service: AuthOtpService;

  beforeEach(() => {
    jest.clearAllMocks();
    realtimeRedisService.connected = false;
    realtimeRedisService.getClient.mockReturnValue(undefined);
    service = new AuthOtpService(
      repository as never,
      config as never,
      realtimeRedisService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests OTP and persists a challenge record', async () => {
    repository.get.mockResolvedValue(undefined);

    const result = await service.requestOtp({
      purpose: 'FORGOT_PASSWORD',
      email: 'Citizen.A@smartcity.local',
      userId: 'user-1',
    });

    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        entityType: 'AUTH_EMAIL_OTP',
        purpose: 'FORGOT_PASSWORD',
        email: 'citizen.a@smartcity.local',
        userId: 'user-1',
        attemptCount: 0,
        consumedAt: null,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        purpose: 'FORGOT_PASSWORD',
        email: 'citizen.a@smartcity.local',
      }),
    );
  });

  it('rejects OTP resend while challenge is still in cooldown window', async () => {
    repository.get.mockResolvedValue({
      PK: 'AUTH#EMAIL#citizen.a@smartcity.local',
      SK: 'OTP#FORGOT_PASSWORD',
      entityType: 'AUTH_EMAIL_OTP',
      otpId: 'otp-1',
      purpose: 'FORGOT_PASSWORD',
      email: 'citizen.a@smartcity.local',
      codeHash: 'hash',
      expiresAt: '9999-12-31T23:59:59.999Z',
      resendAvailableAt: '9999-12-31T23:59:59.999Z',
      attemptCount: 0,
      maxAttempts: 5,
      consumedAt: null,
      createdAt: '2026-03-19T10:00:00.000Z',
      updatedAt: '2026-03-19T10:00:00.000Z',
    });

    await expect(
      service.requestOtp({
        purpose: 'FORGOT_PASSWORD',
        email: 'citizen.a@smartcity.local',
      }),
    ).rejects.toThrow(HttpException);
    expect(repository.put).not.toHaveBeenCalled();
  });

  it('rejects concurrent OTP request when redis lock is already held', async () => {
    realtimeRedisService.connected = true;
    realtimeRedisService.getClient.mockReturnValue(redisClient);
    redisClient.set.mockResolvedValue(null);

    await expect(
      service.requestOtp({
        purpose: 'LOGIN',
        email: 'citizen.a@smartcity.local',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(redisClient.set).toHaveBeenCalled();
    expect(repository.put).not.toHaveBeenCalled();
  });

  it('rejects OTP request when redis rate limit is exceeded', async () => {
    realtimeRedisService.connected = true;
    realtimeRedisService.getClient.mockReturnValue(redisClient);
    redisClient.set.mockResolvedValue('OK');
    redisClient.incr.mockResolvedValue(11);
    redisClient.get.mockResolvedValue('lock-token');
    redisClient.del.mockResolvedValue(1);

    await expect(
      service.requestOtp({
        purpose: 'LOGIN',
        email: 'citizen.a@smartcity.local',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(redisClient.incr).toHaveBeenCalled();
    expect(repository.put).not.toHaveBeenCalled();
  });

  it('verifies OTP and consumes challenge', async () => {
    repository.get.mockResolvedValue({
      PK: 'AUTH#EMAIL#citizen.a@smartcity.local',
      SK: 'OTP#LOGIN',
      entityType: 'AUTH_EMAIL_OTP',
      otpId: 'otp-1',
      purpose: 'LOGIN',
      email: 'citizen.a@smartcity.local',
      userId: 'user-1',
      codeHash: createHash('sha256').update('123456').digest('hex'),
      expiresAt: '9999-12-31T23:59:59.999Z',
      resendAvailableAt: '2026-03-19T10:01:00.000Z',
      attemptCount: 0,
      maxAttempts: 5,
      consumedAt: null,
      createdAt: '2026-03-19T10:00:00.000Z',
      updatedAt: '2026-03-19T10:00:00.000Z',
    });

    await expect(
      service.verifyOtp({
        purpose: 'LOGIN',
        email: 'citizen.a@smartcity.local',
        otpCode: '123456',
        userId: 'user-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        consumedAt: expect.any(String),
      }),
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        consumedAt: expect.any(String),
      }),
    );
  });

  it('verifies OTP without consuming when consumeOnSuccess=false', async () => {
    repository.get.mockResolvedValue({
      PK: 'AUTH#EMAIL#citizen.a@smartcity.local',
      SK: 'OTP#FORGOT_PASSWORD',
      entityType: 'AUTH_EMAIL_OTP',
      otpId: 'otp-2',
      purpose: 'FORGOT_PASSWORD',
      email: 'citizen.a@smartcity.local',
      userId: 'user-1',
      codeHash: createHash('sha256').update('123456').digest('hex'),
      expiresAt: '9999-12-31T23:59:59.999Z',
      resendAvailableAt: '2026-03-19T10:01:00.000Z',
      attemptCount: 0,
      maxAttempts: 5,
      consumedAt: null,
      createdAt: '2026-03-19T10:00:00.000Z',
      updatedAt: '2026-03-19T10:00:00.000Z',
    });

    await expect(
      service.verifyOtp(
        {
          purpose: 'FORGOT_PASSWORD',
          email: 'citizen.a@smartcity.local',
          otpCode: '123456',
          userId: 'user-1',
        },
        { consumeOnSuccess: false },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        purpose: 'FORGOT_PASSWORD',
        consumedAt: null,
      }),
    );
    expect(repository.put).not.toHaveBeenCalled();
  });

  it('consumes OTP explicitly after deferred verification', async () => {
    repository.get.mockResolvedValue({
      PK: 'AUTH#EMAIL#citizen.a@smartcity.local',
      SK: 'OTP#FORGOT_PASSWORD',
      entityType: 'AUTH_EMAIL_OTP',
      otpId: 'otp-3',
      purpose: 'FORGOT_PASSWORD',
      email: 'citizen.a@smartcity.local',
      userId: 'user-1',
      codeHash: createHash('sha256').update('123456').digest('hex'),
      expiresAt: '9999-12-31T23:59:59.999Z',
      resendAvailableAt: '2026-03-19T10:01:00.000Z',
      attemptCount: 0,
      maxAttempts: 5,
      consumedAt: null,
      createdAt: '2026-03-19T10:00:00.000Z',
      updatedAt: '2026-03-19T10:00:00.000Z',
    });

    await expect(
      service.consumeOtp({
        purpose: 'FORGOT_PASSWORD',
        email: 'citizen.a@smartcity.local',
        userId: 'user-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        consumedAt: expect.any(String),
      }),
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        purpose: 'FORGOT_PASSWORD',
        consumedAt: expect.any(String),
      }),
    );
  });

  it('increments attempts and rejects invalid OTP code', async () => {
    repository.get.mockResolvedValue({
      PK: 'AUTH#EMAIL#citizen.a@smartcity.local',
      SK: 'OTP#LOGIN',
      entityType: 'AUTH_EMAIL_OTP',
      otpId: 'otp-1',
      purpose: 'LOGIN',
      email: 'citizen.a@smartcity.local',
      userId: 'user-1',
      codeHash: createHash('sha256').update('123456').digest('hex'),
      expiresAt: '9999-12-31T23:59:59.999Z',
      resendAvailableAt: '2026-03-19T10:01:00.000Z',
      attemptCount: 1,
      maxAttempts: 5,
      consumedAt: null,
      createdAt: '2026-03-19T10:00:00.000Z',
      updatedAt: '2026-03-19T10:00:00.000Z',
    });

    await expect(
      service.verifyOtp({
        purpose: 'LOGIN',
        email: 'citizen.a@smartcity.local',
        otpCode: '654321',
        userId: 'user-1',
      }),
    ).rejects.toThrow(new UnauthorizedException('OTP is invalid or expired.'));
    expect(repository.put).toHaveBeenCalledWith(
      'Users',
      expect.objectContaining({
        attemptCount: 2,
      }),
    );
  });

  it('passes an abort signal when dispatching OTP through the webhook provider', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    global.fetch = fetchMock as typeof fetch;
    config.authOtpProvider = 'webhook';
    config.authOtpWebhookUrl = 'https://otp.test/webhook';
    repository.get.mockResolvedValue(undefined);

    try {
      await service.requestOtp({
        purpose: 'LOGIN',
        email: 'citizen.a@smartcity.local',
      });
    } finally {
      global.fetch = originalFetch;
      config.authOtpProvider = 'disabled';
      config.authOtpWebhookUrl = undefined;
    }

    expect(fetchMock).toHaveBeenCalledWith(
      'https://otp.test/webhook',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
