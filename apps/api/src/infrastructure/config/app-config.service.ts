import { Injectable } from '@nestjs/common';
import { loadEnvFiles } from './load-env';

loadEnvFiles();

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

@Injectable()
export class AppConfigService {
  readonly port = readNumber('PORT', 3001);
  readonly apiPrefix = process.env.API_PREFIX ?? 'api';
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
    process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me';
  readonly refreshTokenSecret =
    process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me';
  readonly jwtIssuer = process.env.JWT_ISSUER ?? 'urban-management-system';
  readonly accessTokenTtlSeconds = readNumber('JWT_ACCESS_TTL_SECONDS', 3600);
  readonly refreshTokenTtlSeconds = readNumber(
    'JWT_REFRESH_TTL_SECONDS',
    604800,
  );
  readonly bcryptRounds = readNumber('BCRYPT_ROUNDS', 12);
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
  readonly pushProvider = (process.env.PUSH_PROVIDER ?? 'log')
    .trim()
    .toLowerCase();
  readonly pushWebhookUrl = process.env.PUSH_WEBHOOK_URL || undefined;
  readonly pushSkipActiveUsers =
    (process.env.PUSH_SKIP_ACTIVE_USERS ?? 'true').toLowerCase() === 'true';
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
  readonly retentionMaintenanceEnabled =
    (process.env.RETENTION_MAINTENANCE_ENABLED ?? 'false').toLowerCase() ===
    'true';
  readonly retentionMaintenanceIntervalMs = readNumber(
    'RETENTION_MAINTENANCE_INTERVAL_MS',
    6 * 60 * 60 * 1000,
  );
  readonly retentionMaintenanceLockTtlMs = readNumber(
    'RETENTION_MAINTENANCE_LOCK_TTL_MS',
    30 * 60 * 1000,
  );
  readonly chatReconciliationMaintenanceEnabled =
    (
      process.env.CHAT_RECONCILIATION_MAINTENANCE_ENABLED ?? 'false'
    ).toLowerCase() === 'true';
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

  readonly s3BucketName = process.env.S3_BUCKET_NAME ?? '';
  readonly s3Endpoint = process.env.S3_ENDPOINT || undefined;
  readonly s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL || undefined;
  readonly s3ForcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? 'false').toLowerCase() === 'true';
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
}
