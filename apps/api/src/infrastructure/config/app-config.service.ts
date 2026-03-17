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
  readonly corsOrigin = process.env.CORS_ORIGIN ?? '*';
  readonly chatMessageRateLimitWindowSeconds = readNumber(
    'CHAT_MESSAGE_RATE_LIMIT_WINDOW_SECONDS',
    10,
  );
  readonly chatMessageRateLimitMaxPerWindow = readNumber(
    'CHAT_MESSAGE_RATE_LIMIT_MAX_PER_WINDOW',
    20,
  );

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
