import { Injectable } from '@nestjs/common';
import { loadEnvFiles } from './load-env';

loadEnvFiles();

const DEFAULT_ACCESS_SECRET = 'dev-access-secret-change-me';
const DEFAULT_REFRESH_SECRET = 'dev-refresh-secret-change-me';
const ALLOWED_PUSH_PROVIDERS = new Set(['disabled', 'log', 'webhook']);
const ALLOWED_AUTH_OTP_PROVIDERS = new Set([
  'disabled',
  'log',
  'webhook',
  'smtp',
]);

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
}

function normalizeCorsOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function readCommaSeparatedList(
  value: string | undefined,
  fallback: string[],
): string[] {
  const source = value?.trim() ? value : fallback.join(',');

  return source
    .split(',')
    .map((item) => normalizeCorsOrigin(item))
    .filter(Boolean);
}

function readCommaSeparatedStrings(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

@Injectable()
export class AppConfigService {
  readonly nodeEnv = (process.env.NODE_ENV ?? 'development')
    .trim()
    .toLowerCase();
  readonly port = readNumber('PORT', 3001);
  readonly apiPrefix = process.env.API_PREFIX ?? 'api';
  readonly swaggerEnabled = readBoolean(
    'SWAGGER_ENABLED',
    this.nodeEnv !== 'production',
  );
  readonly awsRegion = process.env.AWS_REGION ?? 'ap-southeast-1';
  readonly awsMaxAttempts = readNumber('AWS_MAX_ATTEMPTS', 3);
  readonly dynamodbEndpoint = process.env.DYNAMODB_ENDPOINT || undefined;

  readonly dynamodbUsersTableName =
    process.env.DYNAMODB_USERS_TABLE_NAME ?? 'Users';
  readonly dynamodbUsersPhoneIndexName =
    process.env.DYNAMODB_USERS_PHONE_INDEX_NAME ?? 'GSI1-Phone';
  readonly dynamodbUsersEmailIndexName =
    process.env.DYNAMODB_USERS_EMAIL_INDEX_NAME ?? 'GSI2-Email';

  readonly dynamodbGroupsTableName =
    process.env.DYNAMODB_GROUPS_TABLE_NAME ?? 'Groups';
  readonly dynamodbGroupsTypeLocationIndexName =
    process.env.DYNAMODB_GROUPS_TYPE_LOCATION_INDEX_NAME ?? 'GSI1-Type-Loc';

  readonly dynamodbMembershipsTableName =
    process.env.DYNAMODB_MEMBERSHIPS_TABLE_NAME ?? 'Memberships';
  readonly dynamodbMembershipsUserGroupsIndexName =
    process.env.DYNAMODB_MEMBERSHIPS_USER_GROUPS_INDEX_NAME ??
    'GSI1-UserGroups';

  readonly dynamodbMessagesTableName =
    process.env.DYNAMODB_MESSAGES_TABLE_NAME ?? 'Messages';

  readonly dynamodbConversationsTableName =
    process.env.DYNAMODB_CONVERSATIONS_TABLE_NAME ?? 'Conversations';
  readonly dynamodbConversationsInboxStatsIndexName =
    process.env.DYNAMODB_CONVERSATIONS_INBOX_STATS_INDEX_NAME ??
    'GSI1-InboxStats';

  readonly dynamodbReportsTableName =
    process.env.DYNAMODB_REPORTS_TABLE_NAME ?? 'Reports';
  readonly dynamodbReportsCategoryLocationIndexName =
    process.env.DYNAMODB_REPORTS_CATEGORY_LOCATION_INDEX_NAME ?? 'GSI1-CatLoc';
  readonly dynamodbReportsStatusLocationIndexName =
    process.env.DYNAMODB_REPORTS_STATUS_LOCATION_INDEX_NAME ?? 'GSI2-StatusLoc';

  readonly accessTokenSecret =
    process.env.JWT_ACCESS_SECRET ?? DEFAULT_ACCESS_SECRET;
  readonly refreshTokenSecret =
    process.env.JWT_REFRESH_SECRET ?? DEFAULT_REFRESH_SECRET;
  readonly jwtIssuer = process.env.JWT_ISSUER ?? 'urban-management-system';
  readonly accessTokenTtlSeconds = readNumber('JWT_ACCESS_TTL_SECONDS', 3600);
  readonly refreshTokenTtlSeconds = readNumber(
    'JWT_REFRESH_TTL_SECONDS',
    604800,
  );
  readonly bcryptRounds = readNumber('BCRYPT_ROUNDS', 12);
  readonly passwordMinLength = readNumber('PASSWORD_MIN_LENGTH', 10);
  readonly passwordMaxLength = readNumber('PASSWORD_MAX_LENGTH', 64);
  readonly passwordMinCharacterClasses = readNumber(
    'PASSWORD_MIN_CHARACTER_CLASSES',
    3,
  );
  readonly passwordRequireSymbol = readBoolean(
    'PASSWORD_REQUIRE_SYMBOL',
    false,
  );
  readonly passwordPrivilegedMinLength = readNumber(
    'PASSWORD_PRIVILEGED_MIN_LENGTH',
    12,
  );
  readonly passwordPrivilegedMinCharacterClasses = readNumber(
    'PASSWORD_PRIVILEGED_MIN_CHARACTER_CLASSES',
    4,
  );
  readonly passwordPrivilegedRequireSymbol = readBoolean(
    'PASSWORD_PRIVILEGED_REQUIRE_SYMBOL',
    true,
  );
  readonly passwordBlocklistEnabled = readBoolean(
    'PASSWORD_BLOCKLIST_ENABLED',
    true,
  );
  readonly passwordBlocklistTerms = readCommaSeparatedStrings(
    process.env.PASSWORD_BLOCKLIST_TERMS,
  ).map((term) => term.toLowerCase());
  readonly corsOrigins = readCommaSeparatedList(process.env.CORS_ORIGIN, [
    'http://localhost:3000',
    'http://localhost:8081',
  ]);
  readonly chatMessageRateLimitWindowSeconds = readNumber(
    'CHAT_MESSAGE_RATE_LIMIT_WINDOW_SECONDS',
    10,
  );
  readonly chatMessageRateLimitMaxPerWindow = readNumber(
    'CHAT_MESSAGE_RATE_LIMIT_MAX_PER_WINDOW',
    20,
  );
  readonly redisUrl = process.env.REDIS_URL || undefined;
  readonly redisKeyPrefix = process.env.REDIS_KEY_PREFIX ?? 'urban';
  readonly chatPresenceTtlSeconds = readNumber('CHAT_PRESENCE_TTL_SECONDS', 90);
  readonly chatPresenceHeartbeatSeconds = readNumber(
    'CHAT_PRESENCE_HEARTBEAT_SECONDS',
    30,
  );
  readonly chatPresenceLastSeenTtlSeconds = readNumber(
    'CHAT_PRESENCE_LAST_SEEN_TTL_SECONDS',
    30 * 24 * 60 * 60,
  );
  readonly chatOutboxPollIntervalMs = readNumber(
    'CHAT_OUTBOX_POLL_INTERVAL_MS',
    3000,
  );
  readonly chatOutboxBatchSize = readNumber('CHAT_OUTBOX_BATCH_SIZE', 100);
  readonly chatOutboxShardCount = readNumber('CHAT_OUTBOX_SHARD_COUNT', 8);
  readonly chatCallInviteTtlSeconds = readNumber(
    'CHAT_CALL_INVITE_TTL_SECONDS',
    90,
  );
  readonly chatCallActiveTtlSeconds = readNumber(
    'CHAT_CALL_ACTIVE_TTL_SECONDS',
    4 * 60 * 60,
  );
  readonly pushProvider = (process.env.PUSH_PROVIDER ?? 'log')
    .trim()
    .toLowerCase();
  readonly pushWebhookUrl = process.env.PUSH_WEBHOOK_URL || undefined;
  readonly authOtpProvider = (process.env.AUTH_OTP_PROVIDER ?? 'log')
    .trim()
    .toLowerCase();
  readonly authOtpWebhookUrl = process.env.AUTH_OTP_WEBHOOK_URL || undefined;
  readonly authOtpSmtpHost = process.env.AUTH_OTP_SMTP_HOST || undefined;
  readonly authOtpSmtpPort = readNumber('AUTH_OTP_SMTP_PORT', 465);
  readonly authOtpSmtpSecure = readBoolean('AUTH_OTP_SMTP_SECURE', true);
  readonly authOtpSmtpUsername =
    process.env.AUTH_OTP_SMTP_USERNAME || undefined;
  readonly authOtpSmtpPassword =
    process.env.AUTH_OTP_SMTP_PASSWORD || undefined;
  readonly authOtpSmtpFrom = process.env.AUTH_OTP_SMTP_FROM || undefined;
  readonly authOtpSmtpHelo = process.env.AUTH_OTP_SMTP_HELO || undefined;
  readonly authOtpCodeLength = readNumber('AUTH_OTP_CODE_LENGTH', 6);
  readonly authOtpTtlSeconds = readNumber('AUTH_OTP_TTL_SECONDS', 300);
  readonly authOtpResendCooldownSeconds = readNumber(
    'AUTH_OTP_RESEND_COOLDOWN_SECONDS',
    60,
  );
  readonly authOtpMaxAttempts = readNumber('AUTH_OTP_MAX_ATTEMPTS', 5);
  readonly authOtpRequestRateLimitWindowSeconds = readNumber(
    'AUTH_OTP_REQUEST_RATE_LIMIT_WINDOW_SECONDS',
    3600,
  );
  readonly authOtpRequestRateLimitMaxPerWindow = readNumber(
    'AUTH_OTP_REQUEST_RATE_LIMIT_MAX_PER_WINDOW',
    10,
  );
  readonly authOtpRedisLockSeconds = readNumber(
    'AUTH_OTP_REDIS_LOCK_SECONDS',
    5,
  );
  readonly authRegisterDraftTtlSeconds = readNumber(
    'AUTH_REGISTER_DRAFT_TTL_SECONDS',
    900,
  );
  readonly authLoginMaxAttempts = readNumber('AUTH_LOGIN_MAX_ATTEMPTS', 5);
  readonly authLoginWindowSeconds = readNumber(
    'AUTH_LOGIN_WINDOW_SECONDS',
    900,
  );
  readonly authLoginLockSeconds = readNumber('AUTH_LOGIN_LOCK_SECONDS', 900);
  readonly authRegisterMaxAttempts = readNumber(
    'AUTH_REGISTER_MAX_ATTEMPTS',
    5,
  );
  readonly authRegisterWindowSeconds = readNumber(
    'AUTH_REGISTER_WINDOW_SECONDS',
    900,
  );
  readonly authRegisterLockSeconds = readNumber(
    'AUTH_REGISTER_LOCK_SECONDS',
    900,
  );
  readonly uploadPresignTtlSeconds = readNumber(
    'UPLOAD_PRESIGN_TTL_SECONDS',
    300,
  );
  readonly pushSkipActiveUsers = readBoolean('PUSH_SKIP_ACTIVE_USERS', true);
  readonly pushOutboxPollIntervalMs = readNumber(
    'PUSH_OUTBOX_POLL_INTERVAL_MS',
    4000,
  );
  readonly pushOutboxBatchSize = readNumber('PUSH_OUTBOX_BATCH_SIZE', 100);
  readonly pushOutboxShardCount = readNumber('PUSH_OUTBOX_SHARD_COUNT', 8);
  readonly circuitBreakerFailureThreshold = readNumber(
    'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
    5,
  );
  readonly circuitBreakerOpenDurationMs = readNumber(
    'CIRCUIT_BREAKER_OPEN_DURATION_MS',
    30000,
  );
  readonly retentionExpiredSessionGraceDays = readNumber(
    'RETENTION_EXPIRED_SESSION_GRACE_DAYS',
    30,
  );
  readonly retentionDismissedSessionDays = readNumber(
    'RETENTION_DISMISSED_SESSION_DAYS',
    14,
  );
  readonly retentionAuthEmailOtpDays = readNumber(
    'RETENTION_AUTH_EMAIL_OTP_DAYS',
    2,
  );
  readonly retentionAuthRegisterDraftDays = readNumber(
    'RETENTION_AUTH_REGISTER_DRAFT_DAYS',
    2,
  );
  readonly retentionRevokedRefreshTokenGraceDays = readNumber(
    'RETENTION_REVOKED_REFRESH_TOKEN_GRACE_DAYS',
    30,
  );
  readonly retentionChatOutboxDays = readNumber(
    'RETENTION_CHAT_OUTBOX_DAYS',
    7,
  );
  readonly retentionPushOutboxDays = readNumber(
    'RETENTION_PUSH_OUTBOX_DAYS',
    7,
  );
  readonly retentionDeletedConversationSummaryDays = readNumber(
    'RETENTION_DELETED_CONVERSATION_SUMMARY_DAYS',
    30,
  );
  readonly retentionMaintenanceEnabled = readBoolean(
    'RETENTION_MAINTENANCE_ENABLED',
    false,
  );
  readonly retentionMaintenanceIntervalMs = readNumber(
    'RETENTION_MAINTENANCE_INTERVAL_MS',
    6 * 60 * 60 * 1000,
  );
  readonly retentionMaintenanceLockTtlMs = readNumber(
    'RETENTION_MAINTENANCE_LOCK_TTL_MS',
    30 * 60 * 1000,
  );
  readonly chatReconciliationMaintenanceEnabled = readBoolean(
    'CHAT_RECONCILIATION_MAINTENANCE_ENABLED',
    false,
  );
  readonly chatReconciliationMaintenanceIntervalMs = readNumber(
    'CHAT_RECONCILIATION_MAINTENANCE_INTERVAL_MS',
    6 * 60 * 60 * 1000,
  );
  readonly chatReconciliationMaintenanceLockTtlMs = readNumber(
    'CHAT_RECONCILIATION_MAINTENANCE_LOCK_TTL_MS',
    30 * 60 * 1000,
  );
  readonly chatReconciliationMaintenanceMode =
    (process.env.CHAT_RECONCILIATION_MAINTENANCE_MODE ?? 'preview')
      .trim()
      .toLowerCase() === 'repair'
      ? 'repair'
      : 'preview';
  readonly groupDeleteCleanupEnabled = readBoolean(
    'GROUP_DELETE_CLEANUP_ENABLED',
    true,
  );
  readonly groupDeleteCleanupIntervalMs = readNumber(
    'GROUP_DELETE_CLEANUP_INTERVAL_MS',
    5 * 60 * 1000,
  );
  readonly groupDeleteCleanupLockTtlMs = readNumber(
    'GROUP_DELETE_CLEANUP_LOCK_TTL_MS',
    10 * 60 * 1000,
  );

  readonly s3BucketName = process.env.S3_BUCKET_NAME ?? '';
  readonly s3Endpoint = process.env.S3_ENDPOINT || undefined;
  readonly s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL || undefined;
  readonly s3ForcePathStyle = readBoolean('S3_FORCE_PATH_STYLE', false);
  readonly uploadKeyPrefix = process.env.UPLOAD_KEY_PREFIX ?? 'uploads';
  readonly uploadMaxFileSizeBytes = readNumber(
    'UPLOAD_MAX_FILE_SIZE_BYTES',
    10 * 1024 * 1024,
  );
  readonly uploadAllowedMimeTypes = (
    process.env.UPLOAD_ALLOWED_MIME_TYPES ??
    [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].join(',')
  )
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  constructor() {
    this.validate();
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get corsAllowsAnyOrigin(): boolean {
    return this.corsOrigins.includes('*');
  }

  get corsOriginSetting(): true | string[] {
    return this.corsAllowsAnyOrigin ? true : this.corsOrigins;
  }

  isCorsOriginAllowed(origin: string | undefined): boolean {
    if (!origin) {
      return true;
    }

    if (this.corsAllowsAnyOrigin) {
      return true;
    }

    return this.corsOrigins.includes(normalizeCorsOrigin(origin));
  }

  get dynamodbCredentials():
    | {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
      }
    | undefined {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      return {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
      };
    }

    return undefined;
  }

  private validate(): void {
    this.ensurePositive('PORT', this.port);
    this.ensurePositive('AWS_MAX_ATTEMPTS', this.awsMaxAttempts);
    this.ensurePositive('JWT_ACCESS_TTL_SECONDS', this.accessTokenTtlSeconds);
    this.ensurePositive('JWT_REFRESH_TTL_SECONDS', this.refreshTokenTtlSeconds);
    this.ensurePositive('BCRYPT_ROUNDS', this.bcryptRounds);
    this.ensurePositive('PASSWORD_MIN_LENGTH', this.passwordMinLength);
    this.ensurePositive('PASSWORD_MAX_LENGTH', this.passwordMaxLength);
    this.ensurePositive(
      'PASSWORD_MIN_CHARACTER_CLASSES',
      this.passwordMinCharacterClasses,
    );
    this.ensurePositive(
      'PASSWORD_PRIVILEGED_MIN_LENGTH',
      this.passwordPrivilegedMinLength,
    );
    this.ensurePositive(
      'PASSWORD_PRIVILEGED_MIN_CHARACTER_CLASSES',
      this.passwordPrivilegedMinCharacterClasses,
    );
    this.ensurePositive(
      'CHAT_MESSAGE_RATE_LIMIT_WINDOW_SECONDS',
      this.chatMessageRateLimitWindowSeconds,
    );
    this.ensurePositive(
      'CHAT_MESSAGE_RATE_LIMIT_MAX_PER_WINDOW',
      this.chatMessageRateLimitMaxPerWindow,
    );
    this.ensurePositive(
      'CHAT_PRESENCE_TTL_SECONDS',
      this.chatPresenceTtlSeconds,
    );
    this.ensurePositive(
      'CHAT_PRESENCE_HEARTBEAT_SECONDS',
      this.chatPresenceHeartbeatSeconds,
    );
    this.ensurePositive(
      'CHAT_PRESENCE_LAST_SEEN_TTL_SECONDS',
      this.chatPresenceLastSeenTtlSeconds,
    );
    this.ensurePositive('AUTH_OTP_CODE_LENGTH', this.authOtpCodeLength);
    this.ensurePositive('AUTH_OTP_SMTP_PORT', this.authOtpSmtpPort);
    this.ensurePositive('AUTH_OTP_TTL_SECONDS', this.authOtpTtlSeconds);
    this.ensurePositive(
      'AUTH_OTP_RESEND_COOLDOWN_SECONDS',
      this.authOtpResendCooldownSeconds,
    );
    this.ensurePositive('AUTH_OTP_MAX_ATTEMPTS', this.authOtpMaxAttempts);
    this.ensurePositive(
      'AUTH_OTP_REQUEST_RATE_LIMIT_WINDOW_SECONDS',
      this.authOtpRequestRateLimitWindowSeconds,
    );
    this.ensurePositive(
      'AUTH_OTP_REQUEST_RATE_LIMIT_MAX_PER_WINDOW',
      this.authOtpRequestRateLimitMaxPerWindow,
    );
    this.ensurePositive(
      'AUTH_OTP_REDIS_LOCK_SECONDS',
      this.authOtpRedisLockSeconds,
    );
    this.ensurePositive(
      'AUTH_REGISTER_DRAFT_TTL_SECONDS',
      this.authRegisterDraftTtlSeconds,
    );
    this.ensurePositive('AUTH_LOGIN_MAX_ATTEMPTS', this.authLoginMaxAttempts);
    this.ensurePositive(
      'AUTH_LOGIN_WINDOW_SECONDS',
      this.authLoginWindowSeconds,
    );
    this.ensurePositive('AUTH_LOGIN_LOCK_SECONDS', this.authLoginLockSeconds);
    this.ensurePositive(
      'AUTH_REGISTER_MAX_ATTEMPTS',
      this.authRegisterMaxAttempts,
    );
    this.ensurePositive(
      'AUTH_REGISTER_WINDOW_SECONDS',
      this.authRegisterWindowSeconds,
    );
    this.ensurePositive(
      'AUTH_REGISTER_LOCK_SECONDS',
      this.authRegisterLockSeconds,
    );
    this.ensurePositive(
      'UPLOAD_PRESIGN_TTL_SECONDS',
      this.uploadPresignTtlSeconds,
    );
    this.ensurePositive(
      'CHAT_OUTBOX_POLL_INTERVAL_MS',
      this.chatOutboxPollIntervalMs,
    );
    this.ensurePositive('CHAT_OUTBOX_BATCH_SIZE', this.chatOutboxBatchSize);
    this.ensurePositive('CHAT_OUTBOX_SHARD_COUNT', this.chatOutboxShardCount);
    this.ensurePositive(
      'CHAT_CALL_INVITE_TTL_SECONDS',
      this.chatCallInviteTtlSeconds,
    );
    this.ensurePositive(
      'CHAT_CALL_ACTIVE_TTL_SECONDS',
      this.chatCallActiveTtlSeconds,
    );
    this.ensurePositive(
      'PUSH_OUTBOX_POLL_INTERVAL_MS',
      this.pushOutboxPollIntervalMs,
    );
    this.ensurePositive('PUSH_OUTBOX_BATCH_SIZE', this.pushOutboxBatchSize);
    this.ensurePositive('PUSH_OUTBOX_SHARD_COUNT', this.pushOutboxShardCount);
    this.ensurePositive(
      'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      this.circuitBreakerFailureThreshold,
    );
    this.ensurePositive(
      'CIRCUIT_BREAKER_OPEN_DURATION_MS',
      this.circuitBreakerOpenDurationMs,
    );
    this.ensurePositive(
      'UPLOAD_MAX_FILE_SIZE_BYTES',
      this.uploadMaxFileSizeBytes,
    );
    this.ensurePositive(
      'RETENTION_DISMISSED_SESSION_DAYS',
      this.retentionDismissedSessionDays,
    );
    this.ensurePositive(
      'RETENTION_AUTH_EMAIL_OTP_DAYS',
      this.retentionAuthEmailOtpDays,
    );
    this.ensurePositive(
      'RETENTION_AUTH_REGISTER_DRAFT_DAYS',
      this.retentionAuthRegisterDraftDays,
    );

    if (this.chatPresenceHeartbeatSeconds >= this.chatPresenceTtlSeconds) {
      throw new Error(
        'CHAT_PRESENCE_HEARTBEAT_SECONDS must be lower than CHAT_PRESENCE_TTL_SECONDS.',
      );
    }

    if (this.chatCallActiveTtlSeconds < this.chatCallInviteTtlSeconds) {
      throw new Error(
        'CHAT_CALL_ACTIVE_TTL_SECONDS must be greater than or equal to CHAT_CALL_INVITE_TTL_SECONDS.',
      );
    }

    if (this.passwordMinLength < 8) {
      throw new Error('PASSWORD_MIN_LENGTH must be at least 8.');
    }

    if (this.passwordMaxLength < this.passwordMinLength) {
      throw new Error(
        'PASSWORD_MAX_LENGTH must be greater than or equal to PASSWORD_MIN_LENGTH.',
      );
    }

    if (this.passwordMaxLength > 72) {
      throw new Error(
        'PASSWORD_MAX_LENGTH must not exceed 72 because of bcrypt input limits.',
      );
    }

    if (
      this.passwordMinCharacterClasses < 1 ||
      this.passwordMinCharacterClasses > 4
    ) {
      throw new Error(
        'PASSWORD_MIN_CHARACTER_CLASSES must be between 1 and 4.',
      );
    }

    if (this.passwordPrivilegedMinLength < this.passwordMinLength) {
      throw new Error(
        'PASSWORD_PRIVILEGED_MIN_LENGTH must be greater than or equal to PASSWORD_MIN_LENGTH.',
      );
    }

    if (
      this.passwordPrivilegedMinCharacterClasses <
        this.passwordMinCharacterClasses ||
      this.passwordPrivilegedMinCharacterClasses > 4
    ) {
      throw new Error(
        'PASSWORD_PRIVILEGED_MIN_CHARACTER_CLASSES must be between PASSWORD_MIN_CHARACTER_CLASSES and 4.',
      );
    }

    if (!this.corsAllowsAnyOrigin && this.corsOrigins.length === 0) {
      throw new Error('CORS_ORIGIN must contain at least one allowed origin.');
    }

    if (!ALLOWED_PUSH_PROVIDERS.has(this.pushProvider)) {
      throw new Error('PUSH_PROVIDER must be one of: disabled, log, webhook.');
    }

    if (this.pushProvider === 'webhook' && !this.pushWebhookUrl) {
      throw new Error(
        'PUSH_WEBHOOK_URL is required when PUSH_PROVIDER=webhook.',
      );
    }

    if (!ALLOWED_AUTH_OTP_PROVIDERS.has(this.authOtpProvider)) {
      throw new Error(
        'AUTH_OTP_PROVIDER must be one of: disabled, log, webhook, smtp.',
      );
    }

    if (this.authOtpProvider === 'webhook' && !this.authOtpWebhookUrl) {
      throw new Error(
        'AUTH_OTP_WEBHOOK_URL is required when AUTH_OTP_PROVIDER=webhook.',
      );
    }

    if (this.authOtpProvider === 'smtp') {
      if (!this.authOtpSmtpHost) {
        throw new Error(
          'AUTH_OTP_SMTP_HOST is required when AUTH_OTP_PROVIDER=smtp.',
        );
      }
      if (!this.authOtpSmtpUsername) {
        throw new Error(
          'AUTH_OTP_SMTP_USERNAME is required when AUTH_OTP_PROVIDER=smtp.',
        );
      }
      if (!this.authOtpSmtpPassword) {
        throw new Error(
          'AUTH_OTP_SMTP_PASSWORD is required when AUTH_OTP_PROVIDER=smtp.',
        );
      }
      if (!this.authOtpSmtpFrom) {
        throw new Error(
          'AUTH_OTP_SMTP_FROM is required when AUTH_OTP_PROVIDER=smtp.',
        );
      }
    }

    if (!this.accessTokenSecret.trim()) {
      throw new Error('JWT_ACCESS_SECRET must not be empty.');
    }

    if (!this.refreshTokenSecret.trim()) {
      throw new Error('JWT_REFRESH_SECRET must not be empty.');
    }

    if (this.accessTokenSecret === this.refreshTokenSecret) {
      throw new Error(
        'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.',
      );
    }

    if (this.isProduction) {
      if (this.accessTokenSecret === DEFAULT_ACCESS_SECRET) {
        throw new Error('JWT_ACCESS_SECRET must be overridden in production.');
      }

      if (this.refreshTokenSecret === DEFAULT_REFRESH_SECRET) {
        throw new Error('JWT_REFRESH_SECRET must be overridden in production.');
      }

      if (this.accessTokenSecret.length < 32) {
        throw new Error(
          'JWT_ACCESS_SECRET must be at least 32 characters in production.',
        );
      }

      if (this.refreshTokenSecret.length < 32) {
        throw new Error(
          'JWT_REFRESH_SECRET must be at least 32 characters in production.',
        );
      }

      if (this.corsAllowsAnyOrigin) {
        throw new Error('CORS_ORIGIN cannot allow * in production.');
      }
    }
  }

  private ensurePositive(name: string, value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number.`);
    }
  }
}
