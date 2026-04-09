import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GROUP_MEMBER_ROLES,
  GROUP_TYPES,
  MESSAGE_DELIVERY_STATES,
  MESSAGE_TYPES,
  OTP_PURPOSES,
  PUSH_DEVICE_PROVIDERS,
  REPORT_CATEGORIES,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
  SESSION_SCOPES,
  UPLOAD_TARGETS,
  USER_ROLES,
  USER_STATUSES,
} from '@urban/shared-constants';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const GROUP_MEMBER_ACTIONS = ['add', 'update', 'remove'] as const;
const BOOLEAN_QUERY_VALUES = ['true', 'false'] as const;
const FRIEND_REQUEST_DIRECTION_VALUES = ['INCOMING', 'OUTGOING'] as const;
const FRIEND_ACTION_VALUES = ['REJECTED', 'CANCELED'] as const;
const USER_DISCOVERY_MODE_VALUES = ['all', 'chat', 'friend'] as const;
const INTEGER_QUERY_PATTERN = /^\d+$/;

export class HealthStatusDto {
  @ApiProperty({ example: 'urban-management-api' })
  service!: string;

  @ApiProperty({ example: 'ok' })
  status!: string;
}

export class LiveHealthStatusDto extends HealthStatusDto {
  @ApiProperty({ example: '2026-03-17T10:00:00.000Z' })
  timestamp!: string;
}

export class HealthCheckItemDto {
  @ApiProperty({ example: 'dynamodb' })
  component!: string;

  @ApiProperty({
    enum: ['ok', 'error', 'skipped', 'shutting_down'],
    example: 'ok',
  })
  status!: 'ok' | 'error' | 'skipped' | 'shutting_down';

  @ApiProperty({ example: 'Users:ACTIVE' })
  detail!: string;
}

export class ReadinessStatusDto {
  @ApiProperty({ example: 'urban-management-api' })
  service!: string;

  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' })
  status!: 'ok' | 'degraded';

  @ApiProperty({ type: [HealthCheckItemDto] })
  checks!: HealthCheckItemDto[];

  @ApiProperty({ example: '2026-03-17T10:00:00.000Z' })
  timestamp!: string;
}

export class ErrorPayloadDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: 'Invalid credentials.' },
      {
        type: 'array',
        items: { type: 'string' },
        example: ['phone is invalid.'],
      },
    ],
  })
  message!: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ type: () => ErrorPayloadDto })
  error!: ErrorPayloadDto;

  @ApiProperty({ example: '/api/auth/login' })
  path!: string;

  @ApiProperty({ example: '2026-03-17T10:00:00.000Z' })
  timestamp!: string;

  @ApiPropertyOptional({ example: '01JREQUEST0000000000000001' })
  requestId?: string;
}

export class ResponseMetaDto {
  @ApiProperty({ example: 2 })
  count!: number;

  @ApiPropertyOptional({
    example:
      'eyJzb3J0VmFsdWUiOiIyMDI2LTAzLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6IjAxSlBDWS4uLiJ9',
  })
  nextCursor?: string;
}

export class AuthTokenPairDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string;

  @ApiProperty({ example: 3600 })
  expiresIn!: number;

  @ApiProperty({ example: 604800 })
  refreshExpiresIn!: number;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer' })
  tokenType!: 'Bearer';
}

export class UserProfileDto {
  @ApiProperty({ example: '01JPCY0000CITIZENA00000000' })
  id!: string;

  @ApiPropertyOptional({ example: '+84901234567' })
  phone?: string;

  @ApiPropertyOptional({ example: 'citizen.a@smartcity.local' })
  email?: string;

  @ApiProperty({ example: 'Le Thi Citizen A' })
  fullName!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'CITIZEN' })
  role!: (typeof USER_ROLES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiPropertyOptional({ example: 'Ward 1 People Committee' })
  unit?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-a.jpg' })
  avatarUrl?: string;

  @ApiProperty({ enum: USER_STATUSES, example: 'ACTIVE' })
  status!: (typeof USER_STATUSES)[number];

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ example: '2026-03-17T06:15:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-03-17T06:15:00.000Z' })
  updatedAt!: string;
}

export class PresenceStateDto {
  @ApiProperty({ example: '01JPCY0000CITIZENA00000000' })
  userId!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 2 })
  activeSocketCount!: number;

  @ApiPropertyOptional({ example: '2026-03-18T03:10:00.000Z' })
  lastSeenAt?: string;

  @ApiProperty({ example: '2026-03-18T03:11:15.000Z' })
  occurredAt!: string;
}

export class FriendUserItemDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiProperty({ example: 'Tran Van Citizen B' })
  fullName!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'CITIZEN' })
  role!: (typeof USER_ROLES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-b.jpg' })
  avatarUrl?: string;

  @ApiProperty({ enum: USER_STATUSES, example: 'ACTIVE' })
  status!: (typeof USER_STATUSES)[number];

  @ApiProperty({ example: '2026-03-20T06:00:00.000Z' })
  friendsSince!: string;
}

export class FriendRequestItemDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiProperty({ example: 'Tran Van Citizen B' })
  fullName!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'CITIZEN' })
  role!: (typeof USER_ROLES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-b.jpg' })
  avatarUrl?: string;

  @ApiProperty({ enum: USER_STATUSES, example: 'ACTIVE' })
  status!: (typeof USER_STATUSES)[number];

  @ApiProperty({
    enum: FRIEND_REQUEST_DIRECTION_VALUES,
    example: 'INCOMING',
  })
  direction!: (typeof FRIEND_REQUEST_DIRECTION_VALUES)[number];

  @ApiProperty({ example: '2026-03-20T06:00:00.000Z' })
  requestedAt!: string;
}

export class FriendActionResultDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiPropertyOptional({ enum: FRIEND_ACTION_VALUES, example: 'REJECTED' })
  action?: (typeof FRIEND_ACTION_VALUES)[number];

  @ApiPropertyOptional({ example: '2026-03-20T06:05:00.000Z' })
  occurredAt?: string;

  @ApiPropertyOptional({ example: '2026-03-20T06:05:00.000Z' })
  removedAt?: string;
}

export class UserDirectoryItemDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiProperty({ example: 'Tran Van Citizen B' })
  fullName!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'CITIZEN' })
  role!: (typeof USER_ROLES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-b.jpg' })
  avatarUrl?: string;

  @ApiProperty({ enum: USER_STATUSES, example: 'ACTIVE' })
  status!: (typeof USER_STATUSES)[number];

  @ApiProperty({
    enum: ['FRIEND', 'INCOMING_REQUEST', 'OUTGOING_REQUEST', 'NONE'],
    example: 'NONE',
  })
  relationState!: 'FRIEND' | 'INCOMING_REQUEST' | 'OUTGOING_REQUEST' | 'NONE';

  @ApiProperty({ example: true })
  canMessage!: boolean;

  @ApiProperty({ example: false })
  canSendFriendRequest!: boolean;
}

export class PushDeviceDto {
  @ApiProperty({ example: 'device-admin-web-01' })
  deviceId!: string;

  @ApiProperty({ enum: PUSH_DEVICE_PROVIDERS, example: 'WEB' })
  provider!: (typeof PUSH_DEVICE_PROVIDERS)[number];

  @ApiProperty({ example: 'chrome' })
  platform!: string;

  @ApiPropertyOptional({ example: 'admin-web' })
  appVariant?: string;

  @ApiProperty({ example: 'fcm_12...9xyz' })
  tokenPreview!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  disabledAt!: string | null;

  @ApiPropertyOptional({ example: '2026-03-18T11:00:00.000Z' })
  lastSeenAt?: string;

  @ApiProperty({ example: '2026-03-18T11:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-03-18T11:00:00.000Z' })
  updatedAt!: string;
}

export class PushDeviceRemovalResultDto {
  @ApiProperty({ example: 'device-admin-web-01' })
  deviceId!: string;

  @ApiProperty({ example: '2026-03-18T11:30:00.000Z' })
  removedAt!: string;
}

export class AuditEventItemDto {
  @ApiProperty({ example: '01JPDAUDIT0000000000000000' })
  id!: string;

  @ApiProperty({ enum: ['REPORT', 'CONVERSATION'], example: 'REPORT' })
  scope!: 'REPORT' | 'CONVERSATION';

  @ApiProperty({ example: 'REPORT_STATUS_UPDATED' })
  action!: string;

  @ApiProperty({ example: '01JPCY0000WARDOFFICER00000' })
  actorUserId!: string;

  @ApiProperty({ example: '2026-03-18T11:40:00.000Z' })
  occurredAt!: string;

  @ApiProperty({ example: 'Changed report status to IN_PROGRESS.' })
  summary!: string;

  @ApiPropertyOptional({ example: { status: 'IN_PROGRESS' } })
  metadata?: Record<string, unknown>;
}

export class ReportConversationLinkDto {
  @ApiProperty({ example: '01JPCY2000REPORTNEW00000000' })
  reportId!: string;

  @ApiProperty({ example: '01JPCY1000AREAGROUP0000000' })
  groupId!: string;

  @ApiProperty({ example: 'group:01JPCY1000AREAGROUP0000000' })
  conversationId!: string;

  @ApiProperty({ example: '01JPCY0000WARDOFFICER00000' })
  linkedByUserId!: string;

  @ApiProperty({ example: '2026-03-18T11:45:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-03-18T11:45:00.000Z' })
  updatedAt!: string;
}

export class AuthSessionDto {
  @ApiProperty({ type: () => AuthTokenPairDto })
  tokens!: AuthTokenPairDto;

  @ApiProperty({ type: () => UserProfileDto })
  user!: UserProfileDto;
}

export class AuthSessionInfoDto {
  @ApiProperty({ example: '01JSESSION0000000000000001' })
  sessionId!: string;

  @ApiProperty({ example: true })
  isCurrent!: boolean;

  @ApiProperty({ example: '2026-03-18T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-03-18T12:30:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ example: '2026-03-18T12:30:00.000Z' })
  lastUsedAt!: string;

  @ApiProperty({ example: '2026-03-25T12:00:00.000Z' })
  expiresAt!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  dismissedAt!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  revokedAt!: string | null;

  @ApiProperty({ enum: SESSION_SCOPES, example: 'WEB_DESKTOP' })
  sessionScope!: (typeof SESSION_SCOPES)[number];

  @ApiPropertyOptional({ example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
  userAgent?: string;

  @ApiPropertyOptional({ example: '203.113.1.20' })
  ipAddress?: string;

  @ApiPropertyOptional({ example: 'device-admin-web-01' })
  deviceId?: string;

  @ApiPropertyOptional({ example: 'admin-web' })
  appVariant?: string;
}

export class RevokeSessionResultDto {
  @ApiProperty({ example: '01JSESSION0000000000000001' })
  sessionId!: string;

  @ApiProperty({ example: '2026-03-18T12:45:00.000Z' })
  revokedAt!: string;

  @ApiProperty({ example: true })
  currentSessionRevoked!: boolean;
}

export class DismissSessionHistoryResultDto {
  @ApiProperty({ example: '01JSESSION0000000000000001' })
  sessionId!: string;

  @ApiProperty({ example: '2026-03-18T13:10:00.000Z' })
  dismissedAt!: string;
}

export class LogoutAllResultDto {
  @ApiProperty({ example: 3 })
  revokedSessionCount!: number;

  @ApiProperty({ example: '2026-03-18T12:50:00.000Z' })
  revokedAt!: string;

  @ApiProperty({ example: true })
  currentSessionRevoked!: boolean;
}
export class GroupMetadataDto {
  @ApiProperty({ example: '01JPCY1000AREAGROUP0000000' })
  id!: string;

  @ApiProperty({ example: 'Phuong 1 Q1 - Ha tang' })
  groupName!: string;

  @ApiProperty({ enum: GROUP_TYPES, example: 'AREA' })
  groupType!: (typeof GROUP_TYPES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiProperty({ example: '01JPCY0000WARDOFFICER00000' })
  createdBy!: string;

  @ApiPropertyOptional({ example: 'Nhom trao doi ve ha tang phuong 1.' })
  description?: string;

  @ApiProperty({ example: 24 })
  memberCount!: number;

  @ApiProperty({ example: false })
  isOfficial!: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ example: '2026-03-17T07:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-03-17T07:00:00.000Z' })
  updatedAt!: string;
}

export class GroupMembershipDto {
  @ApiProperty({ example: '01JPCY1000AREAGROUP0000000' })
  groupId!: string;

  @ApiProperty({ example: '01JPCY0000CITIZENA00000000' })
  userId!: string;

  @ApiProperty({ enum: GROUP_MEMBER_ROLES, example: 'MEMBER' })
  roleInGroup!: (typeof GROUP_MEMBER_ROLES)[number];

  @ApiProperty({ example: '2026-03-17T07:00:00.000Z' })
  joinedAt!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ example: '2026-03-17T07:00:00.000Z' })
  updatedAt!: string;
}

export class MessageItemDto {
  @ApiProperty({ example: 'group:01JPCY1000AREAGROUP0000000' })
  conversationId!: string;

  @ApiProperty({ example: '01JPCY3000GROUPMSG00000001' })
  id!: string;

  @ApiProperty({ example: '01JPCY0000CITIZENA00000000' })
  senderId!: string;

  @ApiProperty({ example: 'Le Thi Citizen A' })
  senderName!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-a.jpg' })
  senderAvatarUrl?: string;

  @ApiProperty({ enum: MESSAGE_TYPES, example: 'TEXT' })
  type!: (typeof MESSAGE_TYPES)[number];

  @ApiProperty({ example: '{"text":"O ga truoc so 123 Le Loi","mention":[]}' })
  content!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/file.jpg' })
  attachmentUrl?: string;

  @ApiPropertyOptional({ example: '01JPCY3000GROUPMSG00000001' })
  replyTo?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ example: '2026-03-17T08:00:00.000Z' })
  sentAt!: string;

  @ApiProperty({ example: '2026-03-17T08:00:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ enum: MESSAGE_DELIVERY_STATES, example: 'DELIVERED' })
  deliveryState?: (typeof MESSAGE_DELIVERY_STATES)[number];

  @ApiPropertyOptional({ example: 3 })
  recipientCount?: number;

  @ApiPropertyOptional({ example: 2 })
  deliveredCount?: number;

  @ApiPropertyOptional({ example: 1 })
  readByCount?: number;

  @ApiPropertyOptional({ example: '2026-03-17T08:01:00.000Z' })
  lastReadAt?: string;
}

export class ConversationSummaryDto {
  @ApiProperty({
    example: 'dm:01JPCY0000WARDOFFICER00000',
  })
  conversationId!: string;

  @ApiProperty({ example: 'Tran Van Ward' })
  groupName!: string;

  @ApiProperty({ example: 'Da xem, dang cho doi thi cong den xu ly.' })
  lastMessagePreview!: string;

  @ApiProperty({ example: 'Tran Van Ward' })
  lastSenderName!: string;

  @ApiProperty({ example: 1 })
  unreadCount!: number;

  @ApiProperty({ example: false })
  isGroup!: boolean;

  @ApiProperty({ example: false })
  isPinned!: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  archivedAt!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  mutedUntil!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ example: '2026-03-17T08:25:00.000Z' })
  updatedAt!: string;
}

export class ConversationDeletedResultDto {
  @ApiProperty({ example: 'group:01JPCY1000AREAGROUP0000000' })
  conversationId!: string;

  @ApiProperty({ example: '2026-03-18T09:15:00.000Z' })
  removedAt!: string;
}

export class ReportItemDto {
  @ApiProperty({ example: '01JPCY2000REPORTNEW00000000' })
  id!: string;

  @ApiProperty({ example: '01JPCY0000CITIZENA00000000' })
  userId!: string;

  @ApiPropertyOptional({ example: '01JPCY1000AREAGROUP0000000' })
  groupId?: string;

  @ApiProperty({ example: 'Den duong hong o Le Loi' })
  title!: string;

  @ApiPropertyOptional({ example: 'Khu vuc toi om, nguy hiem vao ban dem.' })
  description?: string;

  @ApiProperty({ enum: REPORT_CATEGORIES, example: 'INFRASTRUCTURE' })
  category!: (typeof REPORT_CATEGORIES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiProperty({ enum: REPORT_STATUSES, example: 'NEW' })
  status!: (typeof REPORT_STATUSES)[number];

  @ApiProperty({ enum: REPORT_PRIORITIES, example: 'HIGH' })
  priority!: (typeof REPORT_PRIORITIES)[number];

  @ApiProperty({
    type: [String],
    example: ['https://cdn.example.com/report-1.jpg'],
  })
  mediaUrls!: string[];

  @ApiPropertyOptional({ example: '01JPCY0000WARDOFFICER00000' })
  assignedOfficerId?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ example: '2026-03-17T08:15:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-03-17T08:40:00.000Z' })
  updatedAt!: string;
}

export class RegisterRequestDto {
  @ApiPropertyOptional({ example: '+84901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'citizen.c@smartcity.local' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @ApiProperty({ example: 'Ums@2026Secure1' })
  @IsString()
  @MinLength(10)
  @MaxLength(100)
  password!: string;

  @ApiProperty({ example: 'Nguyen Van Citizen C' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  @IsString()
  @MaxLength(30)
  locationCode!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-c.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}

export class RegisterOtpRequestDto extends RegisterRequestDto {}

export class RegisterOtpVerifyRequestDto {
  @ApiProperty({ example: 'citizen.c@smartcity.local' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  otpCode!: string;
}

export class LoginRequestDto {
  @ApiProperty({ example: 'citizen.a@smartcity.local' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  login!: string;

  @ApiProperty({ example: 'Ums@2026Secure1' })
  @IsString()
  @MinLength(10)
  @MaxLength(100)
  password!: string;
}

export class LoginOtpRequestDto extends LoginRequestDto {}

export class LoginOtpVerifyRequestDto {
  @ApiProperty({ example: 'citizen.a@smartcity.local' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  login!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  otpCode!: string;
}

export class ReactivateAccountOtpRequestDto extends LoginRequestDto {}

export class ReactivateAccountOtpVerifyRequestDto extends LoginRequestDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  otpCode!: string;
}

export class RefreshRequestDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  refreshToken!: string;
}

export class LogoutRequestDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  refreshToken!: string;
}

export class LogoutResultDto {
  @ApiProperty({ example: true })
  loggedOut!: true;
}

export class AuthOtpChallengeResultDto {
  @ApiProperty({ example: true })
  otpRequested!: true;

  @ApiProperty({ enum: OTP_PURPOSES, example: 'FORGOT_PASSWORD' })
  purpose!: (typeof OTP_PURPOSES)[number];

  @ApiProperty({ example: 'ci***@smartcity.local' })
  maskedEmail!: string;

  @ApiProperty({ example: '2026-03-19T10:05:00.000Z' })
  expiresAt!: string;

  @ApiProperty({ example: '2026-03-19T10:01:00.000Z' })
  resendAvailableAt!: string;
}

export class GenericAcceptedResultDto {
  @ApiProperty({ example: true })
  requested!: true;
}

export class ChangePasswordRequestDto {
  @ApiProperty({ example: 'Ums@2026Secure1' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  currentPassword!: string;

  @ApiProperty({ example: 'Ums@2026Secure2' })
  @IsString()
  @MinLength(10)
  @MaxLength(100)
  newPassword!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  otpCode!: string;
}

export class ChangePasswordResultDto {
  @ApiProperty({ example: '2026-03-19T10:06:00.000Z' })
  passwordChangedAt!: string;

  @ApiProperty({ example: 2 })
  revokedSessionCount!: number;

  @ApiProperty({ example: false })
  currentSessionRevoked!: boolean;
}

export class AccountLifecycleOtpVerifyRequestDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  otpCode!: string;
}

export class AccountLifecycleResultDto {
  @ApiProperty({ enum: USER_STATUSES, example: 'DEACTIVATED' })
  status!: (typeof USER_STATUSES)[number];

  @ApiProperty({ example: '2026-03-19T10:08:00.000Z' })
  occurredAt!: string;

  @ApiProperty({ example: 4 })
  revokedSessionCount!: number;

  @ApiProperty({ example: true })
  currentSessionRevoked!: boolean;
}

export class DeleteAccountConfirmRequestDto {
  @ApiProperty({ example: 'Ums@2026Secure1' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  currentPassword!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  otpCode!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  acceptTerms!: boolean;
}

export class DeleteAccountResultDto {
  @ApiProperty({ enum: USER_STATUSES, example: 'DELETED' })
  status!: (typeof USER_STATUSES)[number];

  @ApiProperty({ example: '2026-03-19T10:10:00.000Z' })
  deletedAt!: string;

  @ApiProperty({ example: 4 })
  revokedSessionCount!: number;

  @ApiProperty({ example: true })
  currentSessionRevoked!: boolean;
}

export class ForgotPasswordRequestDto {
  @ApiProperty({ example: 'citizen.a@smartcity.local' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  login!: string;
}

export class ForgotPasswordConfirmRequestDto {
  @ApiProperty({ example: 'citizen.a@smartcity.local' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  login!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  otpCode!: string;

  @ApiProperty({ example: 'Ums@2026Secure2' })
  @IsString()
  @MinLength(10)
  @MaxLength(100)
  newPassword!: string;
}

export class ForgotPasswordConfirmResultDto {
  @ApiProperty({ example: '2026-03-19T10:07:00.000Z' })
  passwordResetAt!: string;

  @ApiProperty({ example: 3 })
  revokedSessionCount!: number;
}

export class RegisterPushDeviceRequestDto {
  @ApiProperty({ example: 'device-admin-web-01' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  deviceId!: string;

  @ApiProperty({ enum: PUSH_DEVICE_PROVIDERS, example: 'WEB' })
  @IsIn(PUSH_DEVICE_PROVIDERS)
  provider!: (typeof PUSH_DEVICE_PROVIDERS)[number];

  @ApiProperty({ example: 'chrome' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  platform!: string;

  @ApiProperty({ example: 'fcm-or-web-push-token' })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  pushToken!: string;

  @ApiPropertyOptional({ example: 'admin-web' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVariant?: string;
}

export class UpdateConversationPreferencesRequestDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ example: '2026-03-20T00:00:00.000Z', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mutedUntil?: string | null;
}

export class UpdateProfileRequestDto {
  @ApiPropertyOptional({ example: '+84908887766' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'citizen.a+new@smartcity.local' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: 'Le Thi Citizen A Updated' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ example: 'Ward 1 People Committee' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  unit?: string;

  @ApiPropertyOptional({ example: 'VN-HCM-BQ1-P01' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  locationCode?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-a-new.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}

export class CreateUserRequestDto {
  @ApiPropertyOptional({ example: '+84901239999' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'ward.officer.2@smartcity.local' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @ApiProperty({ example: 'Ums@2026Secure1' })
  @IsString()
  @MinLength(10)
  @MaxLength(100)
  password!: string;

  @ApiProperty({ example: 'Tran Van Ward 2' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'WARD_OFFICER' })
  @IsIn(USER_ROLES)
  role!: (typeof USER_ROLES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  @IsString()
  @MaxLength(30)
  locationCode!: string;

  @ApiPropertyOptional({ example: 'Ward 1 People Committee' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  unit?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/officer.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}

export class UpdateUserStatusRequestDto {
  @ApiProperty({ enum: USER_STATUSES, example: 'LOCKED' })
  @IsIn(USER_STATUSES)
  status!: (typeof USER_STATUSES)[number];
}

export class CreateGroupRequestDto {
  @ApiProperty({ example: 'Phuong 1 Q1 - Ha tang' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  groupName!: string;

  @ApiProperty({ enum: GROUP_TYPES, example: 'AREA' })
  @IsIn(GROUP_TYPES)
  groupType!: (typeof GROUP_TYPES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  @IsString()
  @MaxLength(30)
  locationCode!: string;

  @ApiPropertyOptional({
    example: 'Nhom chinh thuc trao doi ve ha tang dia ban.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;
}

export class UpdateGroupRequestDto {
  @ApiPropertyOptional({ example: 'Phuong 1 Q1 - Moi truong' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  groupName?: string;

  @ApiPropertyOptional({ enum: GROUP_TYPES, example: 'TOPIC' })
  @IsOptional()
  @IsIn(GROUP_TYPES)
  groupType?: (typeof GROUP_TYPES)[number];

  @ApiPropertyOptional({ example: 'VN-HCM-BQ1-P01' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  locationCode?: string;

  @ApiPropertyOptional({ example: 'Nhom trao doi ve moi truong phuong 1.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;
}

export class ManageGroupMemberRequestDto {
  @ApiProperty({ enum: GROUP_MEMBER_ACTIONS, example: 'update' })
  @IsIn(GROUP_MEMBER_ACTIONS)
  action!: (typeof GROUP_MEMBER_ACTIONS)[number];

  @ApiPropertyOptional({ enum: GROUP_MEMBER_ROLES, example: 'OFFICER' })
  @IsOptional()
  @IsIn(GROUP_MEMBER_ROLES)
  roleInGroup?: (typeof GROUP_MEMBER_ROLES)[number];
}

export class SendDirectMessageRequestDto {
  @ApiProperty({ example: '01JPCY0000WARDOFFICER00000' })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  targetUserId!: string;

  @ApiPropertyOptional({
    example: 'mobile-1742205600-0001',
    description:
      'Client-generated id used for retry-safe message sending and deduplication.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMessageId?: string;

  @ApiPropertyOptional({ enum: MESSAGE_TYPES, example: 'TEXT' })
  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  type?: (typeof MESSAGE_TYPES)[number];

  @ApiPropertyOptional({
    example: '{"text":"Anh oi, bao cao 1 da duoc xem chua?","mention":[]}',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/file.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrl?: string;

  @ApiPropertyOptional({
    example: '01JPCY3000DIRECTMSG0000001',
    description:
      'Message id returned by the API for the message being replied to.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  replyTo?: string;
}

export class SendMessageRequestDto {
  @ApiPropertyOptional({
    example: 'mobile-1742205600-0002',
    description:
      'Client-generated id used for retry-safe message sending and deduplication.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMessageId?: string;

  @ApiPropertyOptional({ enum: MESSAGE_TYPES, example: 'TEXT' })
  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  type?: (typeof MESSAGE_TYPES)[number];

  @ApiPropertyOptional({
    example: '{"text":"Da tiep nhan, se cu can bo kiem tra.","mention":[]}',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/file.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrl?: string;

  @ApiPropertyOptional({
    example: '01JPCY3000GROUPMSG00000001',
    description:
      'Message id returned by the API for the message being replied to.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  replyTo?: string;
}

export class UpdateMessageRequestDto {
  @ApiPropertyOptional({
    example:
      '{"text":"Da tiep nhan, da chuyen can bo phuong xu ly.","mention":[]}',
    description:
      'Canonical structured content string. Send an empty string only when keeping an attachment.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/file-updated.jpg',
    description:
      'Updated attachment URL. Send an empty string to clear the current attachment.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrl?: string;
}

export class CreateReportRequestDto {
  @ApiProperty({ example: 'Den duong hong o Le Loi' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ example: 'Khu vuc toi om, nguy hiem vao ban dem.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: REPORT_CATEGORIES, example: 'INFRASTRUCTURE' })
  @IsIn(REPORT_CATEGORIES)
  category!: (typeof REPORT_CATEGORIES)[number];

  @ApiProperty({ enum: REPORT_PRIORITIES, example: 'HIGH' })
  @IsIn(REPORT_PRIORITIES)
  priority!: (typeof REPORT_PRIORITIES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  @IsString()
  @MaxLength(30)
  locationCode!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/report-1.jpg'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(500, { each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ example: '01JPCY1000AREAGROUP0000000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  groupId?: string;
}

export class UpdateReportRequestDto {
  @ApiPropertyOptional({ example: 'Den duong chua duoc sua o Le Loi' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: 'Tinh trang van con ton tai sau 2 ngay.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: REPORT_CATEGORIES, example: 'ENVIRONMENT' })
  @IsOptional()
  @IsIn(REPORT_CATEGORIES)
  category?: (typeof REPORT_CATEGORIES)[number];

  @ApiPropertyOptional({ enum: REPORT_PRIORITIES, example: 'URGENT' })
  @IsOptional()
  @IsIn(REPORT_PRIORITIES)
  priority?: (typeof REPORT_PRIORITIES)[number];

  @ApiPropertyOptional({ example: 'VN-HCM-BQ1-P01' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  locationCode?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/report-1-update.jpg'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(500, { each: true })
  mediaUrls?: string[];
}

export class LinkReportConversationRequestDto {
  @ApiProperty({ example: '01JPCY1000AREAGROUP0000000' })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  groupId!: string;
}

export class AssignReportRequestDto {
  @ApiProperty({ example: '01JPCY0000WARDOFFICER00000' })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  officerId!: string;
}

export class UpdateReportStatusRequestDto {
  @ApiProperty({ enum: REPORT_STATUSES, example: 'IN_PROGRESS' })
  @IsIn(REPORT_STATUSES)
  status!: (typeof REPORT_STATUSES)[number];
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: USER_ROLES })
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: 'VN-HCM-BQ1-P01' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  locationCode?: string;

  @ApiPropertyOptional({ example: 'citizen ward 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    example:
      'eyJzb3J0VmFsdWUiOiIyMDI2LTAzLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6IjAxSlBDWS4uLiJ9',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ type: Number, example: 20 })
  @IsOptional()
  @Matches(INTEGER_QUERY_PATTERN)
  limit?: string;
}

export class ListFriendsQueryDto {
  @ApiPropertyOptional({
    example:
      'eyJzb3J0VmFsdWUiOiIyMDI2LTAzLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6IjAxSlBDWS4uLiJ9',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ type: Number, example: 20 })
  @IsOptional()
  @Matches(INTEGER_QUERY_PATTERN)
  limit?: string;
}

export class FriendRequestQueryDto extends ListFriendsQueryDto {
  @ApiPropertyOptional({
    enum: FRIEND_REQUEST_DIRECTION_VALUES,
    example: 'INCOMING',
  })
  @IsOptional()
  @IsIn(FRIEND_REQUEST_DIRECTION_VALUES)
  direction?: (typeof FRIEND_REQUEST_DIRECTION_VALUES)[number];
}

export class SearchUsersForChatQueryDto extends ListFriendsQueryDto {
  @ApiPropertyOptional({
    example: 'tran van',
    description: 'Search by name, phone or email in actor communication scope.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    enum: USER_DISCOVERY_MODE_VALUES,
    example: 'all',
    description:
      '"chat" returns only users that can be messaged now. "friend" returns friendship-focused results.',
  })
  @IsOptional()
  @IsIn(USER_DISCOVERY_MODE_VALUES)
  mode?: (typeof USER_DISCOVERY_MODE_VALUES)[number];
}

export class ListGroupsQueryDto {
  @ApiPropertyOptional({ type: Boolean, example: true })
  @IsOptional()
  @IsIn(BOOLEAN_QUERY_VALUES)
  mine?: string;

  @ApiPropertyOptional({ enum: GROUP_TYPES })
  @IsOptional()
  @IsIn(GROUP_TYPES)
  groupType?: string;

  @ApiPropertyOptional({ example: 'VN-HCM-BQ1-P01' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  locationCode?: string;

  @ApiPropertyOptional({ example: 'ha tang' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    example:
      'eyJzb3J0VmFsdWUiOiIyMDI2LTAzLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6IjAxSlBDWS4uLiJ9',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ type: Number, example: 20 })
  @IsOptional()
  @Matches(INTEGER_QUERY_PATTERN)
  limit?: string;
}

export class ListConversationsQueryDto {
  @ApiPropertyOptional({ example: 'ward' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ type: Boolean, example: false })
  @IsOptional()
  @IsIn(BOOLEAN_QUERY_VALUES)
  isGroup?: string;

  @ApiPropertyOptional({ type: Boolean, example: true })
  @IsOptional()
  @IsIn(BOOLEAN_QUERY_VALUES)
  unreadOnly?: string;

  @ApiPropertyOptional({ type: Boolean, example: false })
  @IsOptional()
  @IsIn(BOOLEAN_QUERY_VALUES)
  includeArchived?: string;

  @ApiPropertyOptional({
    example:
      'eyJzb3J0VmFsdWUiOiIyMDI2LTAzLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6ImRtOnVzZXItMiJ9',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ type: Number, example: 20 })
  @IsOptional()
  @Matches(INTEGER_QUERY_PATTERN)
  limit?: string;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ example: 'Le Loi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: MESSAGE_TYPES })
  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  type?: string;

  @ApiPropertyOptional({ example: '01JPCY0000CITIZENA00000000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fromUserId?: string;

  @ApiPropertyOptional({ example: '2026-03-18T10:00:00.000Z' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  before?: string;

  @ApiPropertyOptional({ example: '2026-03-17T10:00:00.000Z' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  after?: string;

  @ApiPropertyOptional({
    example:
      'eyJzb3J0VmFsdWUiOiIyMDI2LTAzLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6IjAxSlBDWS4uLiJ9',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ type: Number, example: 50 })
  @IsOptional()
  @Matches(INTEGER_QUERY_PATTERN)
  limit?: string;
}

export class ListAuditQueryDto {
  @ApiPropertyOptional({
    example:
      'eyJzb3J0VmFsdWUiOiIyMDI2LTAzLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6IjAxSlBDWS4uLiJ9',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ type: Number, example: 20 })
  @IsOptional()
  @Matches(INTEGER_QUERY_PATTERN)
  limit?: string;
}

export class ListLinkedReportConversationsQueryDto extends ListAuditQueryDto {}

export class ListReportsQueryDto {
  @ApiPropertyOptional({ type: Boolean, example: true })
  @IsOptional()
  @IsIn(BOOLEAN_QUERY_VALUES)
  mine?: string;

  @ApiPropertyOptional({ type: Boolean, example: false })
  @IsOptional()
  @IsIn(BOOLEAN_QUERY_VALUES)
  assignedToMe?: string;

  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: string;

  @ApiPropertyOptional({ enum: REPORT_CATEGORIES })
  @IsOptional()
  @IsIn(REPORT_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({ enum: REPORT_PRIORITIES })
  @IsOptional()
  @IsIn(REPORT_PRIORITIES)
  priority?: string;

  @ApiPropertyOptional({ example: '01JPCY0000WARDOFFICER00000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  assignedOfficerId?: string;

  @ApiPropertyOptional({ example: 'VN-HCM-BQ1-P01' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  locationCode?: string;

  @ApiPropertyOptional({ example: 'den duong' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-03-31T23:59:59.999Z' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  createdTo?: string;

  @ApiPropertyOptional({
    example:
      'eyJzb3J0VmFsdWUiOiIyMDI2LTAzLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6IjAxSlBDWS4uLiJ9',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ type: Number, example: 20 })
  @IsOptional()
  @Matches(INTEGER_QUERY_PATTERN)
  limit?: string;
}

export class UploadedAssetDto {
  @ApiProperty({
    example:
      'uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-sample.jpg',
  })
  key!: string;

  @ApiProperty({
    example:
      'https://smartcity-assets.s3.ap-southeast-1.amazonaws.com/uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-sample.jpg',
  })
  url!: string;

  @ApiProperty({ example: 'smartcity-assets' })
  bucket!: string;

  @ApiProperty({ enum: UPLOAD_TARGETS, example: 'REPORT' })
  target!: (typeof UPLOAD_TARGETS)[number];

  @ApiPropertyOptional({ example: '01JPCY2000REPORTNEW00000000' })
  entityId?: string;

  @ApiProperty({ example: 'street-light.jpg' })
  originalFileName!: string;

  @ApiProperty({ example: 'street-light.jpg' })
  fileName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  contentType!: string;

  @ApiProperty({ example: 345678 })
  size!: number;

  @ApiProperty({ example: '01JPCY0000CITIZENA00000000' })
  uploadedBy!: string;

  @ApiProperty({ example: '2026-03-17T10:30:00.000Z' })
  uploadedAt!: string;
}

export class UploadMediaRequestDto {
  @ApiProperty({ enum: UPLOAD_TARGETS, example: 'REPORT' })
  @IsIn(UPLOAD_TARGETS)
  target!: (typeof UPLOAD_TARGETS)[number];

  @ApiPropertyOptional({ example: '01JPCY2000REPORTNEW00000000' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiProperty({ type: 'string', format: 'binary' })
  file!: string;
}
