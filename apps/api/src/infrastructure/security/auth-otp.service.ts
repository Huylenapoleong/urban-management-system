import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { Socket, connect as connectTcp } from 'node:net';
import { TLSSocket, connect as connectTls } from 'node:tls';
import { createUlid, nowIso, normalizeEmail } from '@urban/shared-utils';
import type { OtpPurpose } from '@urban/shared-constants';
import {
  makeAuthEmailOtpPk,
  makeAuthEmailOtpSk,
  makeAuthRegisterDraftPk,
  makeAuthRegisterDraftSk,
} from '@urban/shared-utils';
import type {
  StoredAuthEmailOtp,
  StoredAuthRegisterDraft,
} from '../../common/storage-records';
import { AppConfigService } from '../config/app-config.service';
import { UrbanTableRepository } from '../dynamodb/urban-table.repository';
import { RealtimeRedisService } from '../realtime/realtime-redis.service';

interface RequestOtpInput {
  purpose: OtpPurpose;
  email: string;
  userId?: string;
}

interface VerifyOtpInput {
  purpose: OtpPurpose;
  email: string;
  otpCode: string;
  userId?: string;
}

interface VerifyOtpOptions {
  consumeOnSuccess?: boolean;
}

interface UpsertRegisterDraftInput {
  email: string;
  phone?: string;
  passwordHash: string;
  fullName: string;
  locationCode: string;
  avatarUrl?: string;
}

export interface OtpChallengeResult {
  purpose: OtpPurpose;
  email: string;
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
}

interface SmtpRuntimeSession {
  socket: Socket | TLSSocket;
  reader: ReturnType<typeof createInterface>;
  lineIterator: AsyncIterator<string>;
}

interface OtpDispatchJob {
  attempt: number;
  email: string;
  expiresAt: string;
  otpCode: string;
  purpose: OtpPurpose;
}

@Injectable()
export class AuthOtpService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AuthOtpService.name);
  private smtpSession: SmtpRuntimeSession | undefined;
  private smtpQueue: Promise<unknown> = Promise.resolve();
  private smtpIdleCloseTimer: NodeJS.Timeout | undefined;
  private readonly smtpIdleTimeoutMs = 60_000;
  private otpDispatchTimer: NodeJS.Timeout | undefined;
  private otpDispatchDraining = false;
  private readonly localOtpDispatchQueue: string[] = [];
  private readonly otpDispatchPollIntervalMs = 250;
  private readonly otpDispatchBatchSize = 20;
  private readonly otpDispatchMaxAttempts = 3;
  private readonly otpDispatchRetryDelayMs = 1_000;

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly config: AppConfigService,
    private readonly realtimeRedisService: RealtimeRedisService,
  ) {}

  onModuleInit(): void {
    if (!this.shouldDispatchOtpAsync()) {
      return;
    }

    this.otpDispatchTimer = setInterval(() => {
      void this.triggerOtpDispatchDrain();
    }, this.otpDispatchPollIntervalMs);
    this.otpDispatchTimer.unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.otpDispatchTimer) {
      clearInterval(this.otpDispatchTimer);
      this.otpDispatchTimer = undefined;
    }

    await this.closeSmtpSessionGracefully();
  }

  async requestOtp(input: RequestOtpInput): Promise<OtpChallengeResult> {
    const email = normalizeEmail(input.email);
    const lockToken = await this.acquireOtpRequestLock(email, input.purpose);

    if (!lockToken) {
      throw new HttpException(
        'OTP request is being processed. Please retry shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      await this.assertOtpRequestWithinRateLimit(email, input.purpose);
      return await this.requestOtpCore({
        ...input,
        email,
      });
    } finally {
      await this.releaseOtpRequestLock(email, input.purpose, lockToken);
    }
  }

  private async requestOtpCore(
    input: RequestOtpInput,
  ): Promise<OtpChallengeResult> {
    const email = normalizeEmail(input.email);
    const now = nowIso();
    const existing = await this.getOtpRecord(email, input.purpose);

    if (
      existing &&
      !existing.consumedAt &&
      existing.expiresAt > now &&
      existing.resendAvailableAt > now
    ) {
      throw new HttpException(
        'OTP has been sent recently. Please wait before requesting again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otpCode = this.generateOtpCode();
    const expiresAt = this.secondsFromNowIso(this.config.authOtpTtlSeconds);
    const resendAvailableAt = this.secondsFromNowIso(
      this.config.authOtpResendCooldownSeconds,
    );
    const nextRecord: StoredAuthEmailOtp = {
      PK: makeAuthEmailOtpPk(email),
      SK: makeAuthEmailOtpSk(input.purpose),
      entityType: 'AUTH_EMAIL_OTP',
      otpId: createUlid(),
      purpose: input.purpose,
      email,
      userId: input.userId,
      codeHash: this.hashCode(otpCode),
      expiresAt,
      resendAvailableAt,
      attemptCount: 0,
      maxAttempts: this.config.authOtpMaxAttempts,
      consumedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.put(this.config.dynamodbUsersTableName, nextRecord);
    try {
      const payload = {
        email,
        otpCode,
        purpose: input.purpose,
        expiresAt,
      };

      if (this.shouldDispatchOtpAsync()) {
        await this.enqueueOtpDispatch(payload);
      } else {
        await this.dispatchOtpEmail(payload);
      }
    } catch (error) {
      await this.repository.delete(
        this.config.dynamodbUsersTableName,
        nextRecord.PK,
        nextRecord.SK,
      );
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.logger.error(
        `OTP delivery failed (purpose=${input.purpose}, email=${this.maskEmail(email)}): ${message}`,
      );
      throw new HttpException(
        'Unable to deliver OTP at this moment. Please retry.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      purpose: input.purpose,
      email,
      maskedEmail: this.maskEmail(email),
      expiresAt,
      resendAvailableAt,
    };
  }

  async verifyOtp(
    input: VerifyOtpInput,
    options: VerifyOtpOptions = {},
  ): Promise<StoredAuthEmailOtp> {
    const consumeOnSuccess = options.consumeOnSuccess ?? true;
    const email = normalizeEmail(input.email);
    const record = await this.getOtpRecord(email, input.purpose);
    const now = nowIso();

    if (!record || record.consumedAt || record.expiresAt <= now) {
      throw new UnauthorizedException('OTP is invalid or expired.');
    }

    if (record.userId && input.userId && record.userId !== input.userId) {
      throw new UnauthorizedException('OTP is invalid or expired.');
    }

    const isValid = this.compareCodeHash(record.codeHash, input.otpCode);

    if (!isValid) {
      const nextAttemptCount = record.attemptCount + 1;
      const exhausted = nextAttemptCount >= record.maxAttempts;
      const failedAttemptRecord: StoredAuthEmailOtp = {
        ...record,
        attemptCount: nextAttemptCount,
        consumedAt: exhausted ? now : record.consumedAt,
        updatedAt: now,
      };
      await this.repository.put(
        this.config.dynamodbUsersTableName,
        failedAttemptRecord,
      );
      throw new UnauthorizedException('OTP is invalid or expired.');
    }

    if (!consumeOnSuccess) {
      return record;
    }

    return this.consumeOtp({
      purpose: input.purpose,
      email,
      userId: input.userId,
    });
  }

  async consumeOtp(input: {
    purpose: OtpPurpose;
    email: string;
    userId?: string;
  }): Promise<StoredAuthEmailOtp> {
    const email = normalizeEmail(input.email);
    const record = await this.getOtpRecord(email, input.purpose);
    const now = nowIso();

    if (!record || record.expiresAt <= now) {
      throw new UnauthorizedException('OTP is invalid or expired.');
    }

    if (record.userId && input.userId && record.userId !== input.userId) {
      throw new UnauthorizedException('OTP is invalid or expired.');
    }

    if (record.consumedAt) {
      return record;
    }

    const consumedRecord: StoredAuthEmailOtp = {
      ...record,
      attemptCount: record.attemptCount + 1,
      consumedAt: now,
      updatedAt: now,
    };
    await this.repository.put(
      this.config.dynamodbUsersTableName,
      consumedRecord,
    );

    return consumedRecord;
  }

  async upsertRegisterDraft(
    input: UpsertRegisterDraftInput,
  ): Promise<StoredAuthRegisterDraft> {
    const email = normalizeEmail(input.email);
    const now = nowIso();
    const existing = await this.getRegisterDraft(email);
    const nextDraft: StoredAuthRegisterDraft = {
      PK: makeAuthRegisterDraftPk(email),
      SK: makeAuthRegisterDraftSk(),
      entityType: 'AUTH_REGISTER_DRAFT',
      email,
      phone: input.phone,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      locationCode: input.locationCode,
      avatarUrl: input.avatarUrl,
      expiresAt: this.secondsFromNowIso(
        this.config.authRegisterDraftTtlSeconds,
      ),
      consumedAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.repository.put(this.config.dynamodbUsersTableName, nextDraft);
    return nextDraft;
  }

  async getActiveRegisterDraft(
    emailInput: string,
  ): Promise<StoredAuthRegisterDraft | undefined> {
    const draft = await this.getRegisterDraft(normalizeEmail(emailInput));

    if (!draft || draft.consumedAt || draft.expiresAt <= nowIso()) {
      return undefined;
    }

    return draft;
  }

  async consumeRegisterDraft(emailInput: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    const draft = await this.getRegisterDraft(email);

    if (!draft) {
      return;
    }

    const consumedDraft: StoredAuthRegisterDraft = {
      ...draft,
      consumedAt: nowIso(),
      updatedAt: nowIso(),
    };

    await this.repository.put(
      this.config.dynamodbUsersTableName,
      consumedDraft,
    );
  }

  private async getOtpRecord(
    email: string,
    purpose: OtpPurpose,
  ): Promise<StoredAuthEmailOtp | undefined> {
    const record = await this.repository.get<StoredAuthEmailOtp>(
      this.config.dynamodbUsersTableName,
      makeAuthEmailOtpPk(email),
      makeAuthEmailOtpSk(purpose),
    );

    if (!record || record.entityType !== 'AUTH_EMAIL_OTP') {
      return undefined;
    }

    return record;
  }

  private async getRegisterDraft(
    email: string,
  ): Promise<StoredAuthRegisterDraft | undefined> {
    const draft = await this.repository.get<StoredAuthRegisterDraft>(
      this.config.dynamodbUsersTableName,
      makeAuthRegisterDraftPk(email),
      makeAuthRegisterDraftSk(),
    );

    if (!draft || draft.entityType !== 'AUTH_REGISTER_DRAFT') {
      return undefined;
    }

    return draft;
  }

  private generateOtpCode(): string {
    const length = Math.max(this.config.authOtpCodeLength, 4);
    const max = 10 ** length;
    const code = randomInt(0, max);
    return String(code).padStart(length, '0');
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private compareCodeHash(expectedHash: string, otpCode: string): boolean {
    const providedHash = Buffer.from(this.hashCode(otpCode), 'hex');
    const storedHash = Buffer.from(expectedHash, 'hex');

    return (
      providedHash.length === storedHash.length &&
      timingSafeEqual(providedHash, storedHash)
    );
  }

  private secondsFromNowIso(seconds: number): string {
    const timestamp = Date.now() + seconds * 1000;
    return new Date(timestamp).toISOString();
  }

  private shouldDispatchOtpAsync(): boolean {
    return (
      this.config.authOtpProvider === 'smtp' ||
      this.config.authOtpProvider === 'webhook'
    );
  }

  private getOtpDispatchQueueKey(): string {
    return `${this.config.redisKeyPrefix}:auth:otp:dispatch`;
  }

  private async enqueueOtpDispatch(payload: {
    email: string;
    otpCode: string;
    purpose: OtpPurpose;
    expiresAt: string;
  }): Promise<void> {
    const job: OtpDispatchJob = {
      ...payload,
      attempt: 0,
    };
    const serialized = JSON.stringify(job);
    const redisClient = this.realtimeRedisService.getClient();

    if (redisClient && this.realtimeRedisService.connected) {
      try {
        await redisClient.rPush(this.getOtpDispatchQueueKey(), serialized);
        return;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          `Redis OTP dispatch enqueue failed, fallback to local queue: ${message}`,
        );
      }
    }

    this.localOtpDispatchQueue.push(serialized);
    await this.triggerOtpDispatchDrain();
  }

  private async triggerOtpDispatchDrain(): Promise<void> {
    if (this.otpDispatchDraining) {
      return;
    }

    this.otpDispatchDraining = true;
    try {
      await this.drainOtpDispatchJobs();
    } finally {
      this.otpDispatchDraining = false;
    }
  }

  private async drainOtpDispatchJobs(): Promise<void> {
    for (let index = 0; index < this.otpDispatchBatchSize; index += 1) {
      const serialized = await this.dequeueOtpDispatchJob();
      if (!serialized) {
        return;
      }

      const job = this.parseOtpDispatchJob(serialized);
      if (!job) {
        continue;
      }

      try {
        await this.dispatchOtpEmail({
          email: job.email,
          otpCode: job.otpCode,
          purpose: job.purpose,
          expiresAt: job.expiresAt,
        });
      } catch (error) {
        const nextAttempt = job.attempt + 1;

        if (nextAttempt < this.otpDispatchMaxAttempts) {
          await this.requeueOtpDispatchJob({
            ...job,
            attempt: nextAttempt,
          });
          continue;
        }

        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.error(
          `OTP background delivery failed after retries (purpose=${job.purpose}, email=${this.maskEmail(job.email)}): ${message}`,
        );
      }
    }
  }

  private async dequeueOtpDispatchJob(): Promise<string | undefined> {
    const redisClient = this.realtimeRedisService.getClient();

    if (redisClient && this.realtimeRedisService.connected) {
      try {
        const item = await redisClient.lPop(this.getOtpDispatchQueueKey());
        return item ?? undefined;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          `Redis OTP dispatch dequeue failed, fallback to local queue: ${message}`,
        );
      }
    }

    return this.localOtpDispatchQueue.shift();
  }

  private parseOtpDispatchJob(serialized: string): OtpDispatchJob | undefined {
    try {
      const parsed = JSON.parse(serialized) as Partial<OtpDispatchJob>;

      if (
        typeof parsed.email !== 'string' ||
        typeof parsed.otpCode !== 'string' ||
        typeof parsed.expiresAt !== 'string' ||
        typeof parsed.purpose !== 'string'
      ) {
        return undefined;
      }

      return {
        attempt:
          typeof parsed.attempt === 'number' && Number.isFinite(parsed.attempt)
            ? Math.max(0, Math.floor(parsed.attempt))
            : 0,
        email: parsed.email,
        otpCode: parsed.otpCode,
        expiresAt: parsed.expiresAt,
        purpose: parsed.purpose,
      };
    } catch {
      return undefined;
    }
  }

  private async requeueOtpDispatchJob(job: OtpDispatchJob): Promise<void> {
    const serialized = JSON.stringify(job);

    await new Promise<void>((resolve) => {
      setTimeout(
        () => {
          void (async () => {
            const redisClient = this.realtimeRedisService.getClient();

            if (redisClient && this.realtimeRedisService.connected) {
              try {
                await redisClient.rPush(
                  this.getOtpDispatchQueueKey(),
                  serialized,
                );
                resolve();
                return;
              } catch {
                // fallback to local queue
              }
            }

            this.localOtpDispatchQueue.push(serialized);
            resolve();
          })();
        },
        this.otpDispatchRetryDelayMs * Math.max(1, job.attempt),
      );
    });
  }

  private async dispatchOtpEmail(input: {
    email: string;
    otpCode: string;
    purpose: OtpPurpose;
    expiresAt: string;
  }): Promise<void> {
    switch (this.config.authOtpProvider) {
      case 'disabled': {
        this.logger.warn(
          `OTP delivery skipped because AUTH_OTP_PROVIDER=disabled (purpose=${input.purpose}, email=${this.maskEmail(input.email)}).`,
        );
        return;
      }
      case 'webhook': {
        if (!this.config.authOtpWebhookUrl) {
          throw new Error(
            'AUTH_OTP_WEBHOOK_URL is required when AUTH_OTP_PROVIDER=webhook.',
          );
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, this.config.authOtpWebhookTimeoutMs);
        let response: Response;

        try {
          response = await fetch(this.config.authOtpWebhookUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              template: 'auth-otp',
              purpose: input.purpose,
              to: input.email,
              otpCode: input.otpCode,
              expiresAt: input.expiresAt,
              requestedAt: nowIso(),
            }),
            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted) {
            throw new Error(
              `OTP webhook timed out after ${this.config.authOtpWebhookTimeoutMs}ms.`,
            );
          }

          throw error;
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          throw new Error(`OTP webhook failed with status ${response.status}.`);
        }
        return;
      }
      case 'smtp': {
        await this.dispatchOtpEmailWithSmtp(input);
        return;
      }
      case 'log':
      default: {
        this.logger.log(
          `OTP delivered (purpose=${input.purpose}, email=${this.maskEmail(input.email)}, code=${input.otpCode}, expiresAt=${input.expiresAt}).`,
        );
      }
    }
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');

    if (!localPart || !domain) {
      return '***';
    }

    if (localPart.length <= 2) {
      return `${localPart[0] ?? '*'}***@${domain}`;
    }

    return `${localPart.slice(0, 2)}***@${domain}`;
  }

  private async assertOtpRequestWithinRateLimit(
    email: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const redisClient = this.realtimeRedisService.getClient();

    if (!redisClient || !this.realtimeRedisService.connected) {
      return;
    }

    const key = `${this.config.redisKeyPrefix}:auth:otp:rate:${purpose}:${email}`;

    try {
      const currentCount = await redisClient.incr(key);

      if (currentCount === 1) {
        await redisClient.expire(
          key,
          this.config.authOtpRequestRateLimitWindowSeconds,
        );
      }

      if (currentCount > this.config.authOtpRequestRateLimitMaxPerWindow) {
        throw new HttpException(
          'OTP request limit exceeded. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.logger.warn(
        `Redis OTP rate limit check failed, fallback to DynamoDB-only guard: ${message}`,
      );
    }
  }

  private async acquireOtpRequestLock(
    email: string,
    purpose: OtpPurpose,
  ): Promise<string | undefined> {
    const redisClient = this.realtimeRedisService.getClient();

    if (!redisClient || !this.realtimeRedisService.connected) {
      return 'local';
    }

    const key = `${this.config.redisKeyPrefix}:auth:otp:lock:${purpose}:${email}`;
    const token = createUlid();

    try {
      const result = await redisClient.set(key, token, {
        NX: true,
        EX: this.config.authOtpRedisLockSeconds,
      });

      return result === 'OK' ? token : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.logger.warn(
        `Redis OTP lock acquisition failed, fallback to local processing: ${message}`,
      );
      return 'local';
    }
  }

  private async releaseOtpRequestLock(
    email: string,
    purpose: OtpPurpose,
    token: string,
  ): Promise<void> {
    if (token === 'local') {
      return;
    }

    const redisClient = this.realtimeRedisService.getClient();

    if (!redisClient || !this.realtimeRedisService.connected) {
      return;
    }

    const key = `${this.config.redisKeyPrefix}:auth:otp:lock:${purpose}:${email}`;

    try {
      const currentToken = await redisClient.get(key);

      if (currentToken === token) {
        await redisClient.del(key);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.logger.warn(
        `Redis OTP lock release failed for ${purpose}/${this.maskEmail(email)}: ${message}`,
      );
    }
  }

  private async dispatchOtpEmailWithSmtp(input: {
    email: string;
    otpCode: string;
    purpose: OtpPurpose;
    expiresAt: string;
  }): Promise<void> {
    if (
      !this.config.authOtpSmtpHost ||
      !this.config.authOtpSmtpUsername ||
      !this.config.authOtpSmtpPassword ||
      !this.config.authOtpSmtpFrom
    ) {
      throw new Error(
        'SMTP configuration is incomplete for AUTH_OTP_PROVIDER=smtp.',
      );
    }

    const smtpEnvelopeFrom = this.resolveSmtpEnvelopeAddress(
      this.config.authOtpSmtpFrom,
    );
    const smtpHeaderFrom = this.resolveSmtpHeaderFrom(
      this.config.authOtpSmtpFrom,
      smtpEnvelopeFrom,
    );

    await this.enqueueSmtpOperation(async () => {
      await this.sendOtpEmailViaSmtpSession(
        input,
        smtpEnvelopeFrom,
        smtpHeaderFrom,
      );
    });
  }

  private enqueueSmtpOperation<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.smtpQueue.then(operation, operation);
    this.smtpQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async sendOtpEmailViaSmtpSession(
    input: {
      email: string;
      otpCode: string;
      purpose: OtpPurpose;
      expiresAt: string;
    },
    smtpEnvelopeFrom: string,
    smtpHeaderFrom: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const session = await this.getOrCreateSmtpSession();

      try {
        await this.sendSmtpCommand(
          session.socket,
          `MAIL FROM:<${smtpEnvelopeFrom}>`,
        );
        await this.readSmtpResponse(session.lineIterator, [250]);

        await this.sendSmtpCommand(session.socket, `RCPT TO:<${input.email}>`);
        await this.readSmtpResponse(session.lineIterator, [250, 251]);

        await this.sendSmtpCommand(session.socket, 'DATA');
        await this.readSmtpResponse(session.lineIterator, [354]);
        await this.sendSmtpData(
          session.socket,
          this.renderSmtpOtpEmail({
            ...input,
            fromHeader: smtpHeaderFrom,
            expiresInMinutes: Math.max(
              1,
              Math.ceil(this.config.authOtpTtlSeconds / 60),
            ),
          }),
        );
        await this.readSmtpResponse(session.lineIterator, [250]);
        this.scheduleSmtpSessionClose();
        return;
      } catch (error) {
        this.resetSmtpSession();
        if (attempt === 1) {
          throw error;
        }
      }
    }
  }

  private async getOrCreateSmtpSession(): Promise<SmtpRuntimeSession> {
    if (this.smtpSession && !this.smtpSession.socket.destroyed) {
      return this.smtpSession;
    }

    return this.openSmtpSession();
  }

  private async openSmtpSession(): Promise<SmtpRuntimeSession> {
    const smtpUsername = this.config.authOtpSmtpUsername;
    const smtpPassword = this.config.authOtpSmtpPassword;
    if (!smtpUsername || !smtpPassword) {
      throw new Error(
        'SMTP configuration is incomplete for AUTH_OTP_PROVIDER=smtp.',
      );
    }

    const socket = await this.connectSmtpSocket();
    const reader = createInterface({
      input: socket,
      crlfDelay: Infinity,
    });
    const lineIterator = reader[Symbol.asyncIterator]();

    try {
      await this.readSmtpResponse(lineIterator, [220]);
      await this.sendSmtpCommand(
        socket,
        `EHLO ${this.config.authOtpSmtpHelo ?? 'localhost'}`,
      );
      await this.readSmtpResponse(lineIterator, [250]);

      await this.sendSmtpCommand(socket, 'AUTH LOGIN');
      await this.readSmtpResponse(lineIterator, [334]);
      await this.sendSmtpCommand(
        socket,
        Buffer.from(smtpUsername).toString('base64'),
      );
      await this.readSmtpResponse(lineIterator, [334]);
      await this.sendSmtpCommand(
        socket,
        Buffer.from(smtpPassword).toString('base64'),
      );
      await this.readSmtpResponse(lineIterator, [235]);
    } catch (error) {
      reader.close();
      socket.end();
      socket.destroy();
      throw error;
    }

    const session: SmtpRuntimeSession = {
      socket,
      reader,
      lineIterator,
    };
    socket.once('close', () => {
      if (this.smtpSession?.socket === socket) {
        this.smtpSession = undefined;
      }
    });
    socket.once('error', () => {
      if (this.smtpSession?.socket === socket) {
        this.smtpSession = undefined;
      }
    });
    this.smtpSession = session;
    this.scheduleSmtpSessionClose();

    return session;
  }

  private scheduleSmtpSessionClose(): void {
    if (this.smtpIdleCloseTimer) {
      clearTimeout(this.smtpIdleCloseTimer);
      this.smtpIdleCloseTimer = undefined;
    }

    this.smtpIdleCloseTimer = setTimeout(() => {
      void this.closeSmtpSessionGracefully();
    }, this.smtpIdleTimeoutMs);
  }

  private async closeSmtpSessionGracefully(): Promise<void> {
    const session = this.smtpSession;
    this.smtpSession = undefined;
    if (this.smtpIdleCloseTimer) {
      clearTimeout(this.smtpIdleCloseTimer);
      this.smtpIdleCloseTimer = undefined;
    }

    if (!session) {
      return;
    }

    try {
      if (!session.socket.destroyed) {
        await this.sendSmtpCommand(session.socket, 'QUIT');
        await this.readSmtpResponse(session.lineIterator, [221]);
      }
    } catch {
      // Best-effort cleanup only.
    } finally {
      session.reader.close();
      session.socket.end();
      session.socket.destroy();
    }
  }

  private resetSmtpSession(): void {
    const session = this.smtpSession;
    this.smtpSession = undefined;
    if (this.smtpIdleCloseTimer) {
      clearTimeout(this.smtpIdleCloseTimer);
      this.smtpIdleCloseTimer = undefined;
    }

    if (!session) {
      return;
    }

    session.reader.close();
    session.socket.end();
    session.socket.destroy();
  }

  private async connectSmtpSocket(): Promise<Socket | TLSSocket> {
    if (!this.config.authOtpSmtpHost) {
      throw new Error('AUTH_OTP_SMTP_HOST is required.');
    }

    if (this.config.authOtpSmtpSecure) {
      const socket = connectTls({
        host: this.config.authOtpSmtpHost,
        port: this.config.authOtpSmtpPort,
        servername: this.config.authOtpSmtpHost,
      });

      await this.waitForSocketReady(socket, 'secureConnect');
      return socket;
    }

    const socket = connectTcp({
      host: this.config.authOtpSmtpHost,
      port: this.config.authOtpSmtpPort,
    });

    await this.waitForSocketReady(socket, 'connect');
    return socket;
  }

  private async waitForSocketReady(
    socket: Socket | TLSSocket,
    eventName: 'connect' | 'secureConnect',
  ): Promise<void> {
    const timeoutMs = 10000;
    const timeout = setTimeout(() => {
      socket.destroy(new Error('SMTP connection timeout.'));
    }, timeoutMs);

    try {
      await Promise.race([
        once(socket, eventName),
        once(socket, 'error').then(([error]) => {
          throw error;
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sendSmtpCommand(
    socket: Socket | TLSSocket,
    command: string,
  ): Promise<void> {
    await this.sendSmtpData(socket, `${command}\r\n`);
  }

  private async sendSmtpData(
    socket: Socket | TLSSocket,
    data: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      socket.write(data, (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async readSmtpResponse(
    lineIterator: AsyncIterator<string>,
    expectedCodes: number[],
  ): Promise<void> {
    const timeoutMs = 10000;
    const lines: string[] = [];
    let responseCode: string | undefined;

    while (true) {
      const line = await this.readSmtpLineWithTimeout(lineIterator, timeoutMs);
      lines.push(line);
      const match = /^(\d{3})([\s-])(.*)$/.exec(line);

      if (!match) {
        continue;
      }

      responseCode ??= match[1];
      const isFinalLine = match[1] === responseCode && match[2] === ' ';

      if (!isFinalLine) {
        continue;
      }

      const code = Number(responseCode);

      if (!expectedCodes.includes(code)) {
        throw new Error(
          `SMTP response ${code} is unexpected. Expected ${expectedCodes.join(', ')}. Details: ${lines.join(' | ')}`,
        );
      }

      return;
    }
  }

  private async readSmtpLineWithTimeout(
    lineIterator: AsyncIterator<string>,
    timeoutMs: number,
  ): Promise<string> {
    const nextLinePromise = lineIterator.next();

    const result = await Promise.race([
      nextLinePromise,
      new Promise<IteratorResult<string>>((_, reject) => {
        setTimeout(() => {
          reject(new Error('SMTP response timeout.'));
        }, timeoutMs);
      }),
    ]);

    if (result.done || typeof result.value !== 'string') {
      throw new Error('SMTP connection closed unexpectedly.');
    }

    return result.value;
  }

  private renderSmtpOtpEmail(input: {
    email: string;
    otpCode: string;
    purpose: OtpPurpose;
    expiresAt: string;
    fromHeader: string;
    expiresInMinutes: number;
  }): string {
    const purposeLabel = this.formatOtpPurposeLabel(input.purpose);
    const subject = `[Urban Management] ${purposeLabel} OTP`;
    const plainBody = [
      'Hello,',
      '',
      'We received a request for your Urban Management account.',
      `Purpose: ${purposeLabel}`,
      `OTP code: ${input.otpCode}`,
      `Expires in: ${input.expiresInMinutes} minute(s)`,
      `Expires at (UTC): ${input.expiresAt}`,
      '',
      'If this was not you, please ignore this email and review your account security.',
      '',
      'Urban Management System',
    ].join('\r\n');
    const escapedPurpose = this.escapeHtml(purposeLabel);
    const escapedCode = this.escapeHtml(input.otpCode);
    const escapedExpiresAt = this.escapeHtml(input.expiresAt);
    const htmlBody = [
      '<!doctype html>',
      '<html>',
      '<body style="margin:0;padding:0;background:#f4f6fb;font-family:Segoe UI,Arial,sans-serif;color:#1f2937;">',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">',
      '<tr><td align="center">',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">',
      '<tr><td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">',
      '<div style="font-size:18px;font-weight:700;color:#0f172a;">Urban Management</div>',
      '<div style="margin-top:4px;font-size:13px;color:#6b7280;">Security verification code</div>',
      '</td></tr>',
      '<tr><td style="padding:24px;">',
      '<p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;">Hello,</p>',
      '<p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;">We received a request that requires OTP verification for your account.</p>',
      `<p style="margin:0 0 8px 0;font-size:13px;color:#374151;"><strong>Purpose:</strong> ${escapedPurpose}</p>`,
      `<p style="margin:0 0 14px 0;font-size:13px;color:#374151;"><strong>Expires at (UTC):</strong> ${escapedExpiresAt}</p>`,
      `<div style="margin:0 0 16px 0;padding:14px 16px;border:1px dashed #bfdbfe;background:#eff6ff;border-radius:8px;font-size:30px;letter-spacing:6px;font-weight:700;text-align:center;color:#1d4ed8;">${escapedCode}</div>`,
      `<p style="margin:0;font-size:12px;color:#6b7280;">This OTP is valid for ${input.expiresInMinutes} minute(s). If you did not request this, ignore this email.</p>`,
      '</td></tr>',
      '<tr><td style="padding:14px 24px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">Urban Management System</td></tr>',
      '</table>',
      '</td></tr>',
      '</table>',
      '</body>',
      '</html>',
    ].join('');
    const boundary = `=_urban_otp_${createUlid()}`;
    const encodedPlainBody = this.escapeSmtpBody(plainBody);
    const encodedHtmlBody = this.escapeSmtpBody(htmlBody);
    const messageLines = [
      `From: ${input.fromHeader}`,
      `To: ${input.email}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      encodedPlainBody,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      encodedHtmlBody,
      '',
      `--${boundary}--`,
      '',
      '.',
      '',
    ];
    return messageLines.join('\r\n');
  }

  private formatOtpPurposeLabel(purpose: OtpPurpose): string {
    switch (purpose) {
      case 'REGISTER':
        return 'Registration';
      case 'LOGIN':
        return 'Login';
      case 'FORGOT_PASSWORD':
        return 'Password reset';
      case 'CHANGE_PASSWORD':
        return 'Password change';
      case 'DEACTIVATE_ACCOUNT':
        return 'Account deactivation';
      case 'REACTIVATE_ACCOUNT':
        return 'Account reactivation';
      case 'DELETE_ACCOUNT':
        return 'Permanent account deletion';
      default:
        return 'Account verification';
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeSmtpBody(value: string): string {
    const normalized = value.replace(/\r?\n/g, '\r\n');
    if (normalized.startsWith('.')) {
      return `.${normalized}`;
    }
    return normalized.replace(/\r\n\./g, '\r\n..');
  }

  private resolveSmtpEnvelopeAddress(fromValue: string): string {
    const value = fromValue.trim();
    const bracketMatch = /<([^<>]+)>/.exec(value);

    if (bracketMatch?.[1]) {
      const email = bracketMatch[1].trim();
      if (this.isLikelyEmailAddress(email)) {
        return email;
      }
    }

    if (this.isLikelyEmailAddress(value)) {
      return value;
    }

    const emailMatch = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(
      value,
    );
    if (emailMatch?.[0] && this.isLikelyEmailAddress(emailMatch[0])) {
      return emailMatch[0];
    }

    throw new Error(
      'AUTH_OTP_SMTP_FROM must contain a valid email address (e.g. "Urban Management <name@example.com>").',
    );
  }

  private resolveSmtpHeaderFrom(
    fromValue: string,
    envelopeFrom: string,
  ): string {
    const value = fromValue.trim();

    if (/<[^<>]+>/.test(value)) {
      return value;
    }

    if (this.isLikelyEmailAddress(value)) {
      return value;
    }

    const displayName = value.replace(envelopeFrom, '').trim();
    if (!displayName) {
      return envelopeFrom;
    }

    return `${displayName} <${envelopeFrom}>`;
  }

  private isLikelyEmailAddress(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}
