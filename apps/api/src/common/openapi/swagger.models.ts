import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GROUP_MESSAGE_POLICIES,
  GROUP_MEMBER_ROLES,
  GROUP_TYPES,
  MESSAGE_DELIVERY_STATES,
  MESSAGE_RECALL_SCOPES,
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
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const GROUP_MEMBER_ACTIONS = ['add', 'update', 'remove'] as const;
const GROUP_MEMBER_ROLE_INPUT_VALUES = [
  ...GROUP_MEMBER_ROLES,
  'OFFICER',
] as const;
const ASSIGNABLE_GROUP_MEMBER_ROLES = ['DEPUTY', 'MEMBER'] as const;
const BOOLEAN_QUERY_VALUES = ['true', 'false'] as const;
const FRIEND_REQUEST_DIRECTION_VALUES = ['INCOMING', 'OUTGOING'] as const;
const FRIEND_ACTION_VALUES = ['REJECTED', 'CANCELED'] as const;
const DIRECT_MESSAGE_REQUEST_STATUS_VALUES = [
  'PENDING',
  'IGNORED',
  'REJECTED',
  'BLOCKED',
] as const;
const DIRECT_MESSAGE_REQUEST_DIRECTION_VALUES = [
  'INCOMING',
  'OUTGOING',
] as const;
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

export class MediaAssetDto {
  @ApiProperty({
    example:
      'uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-sample.jpg',
  })
  key!: string;

  @ApiPropertyOptional({ example: 'smartcity-assets' })
  bucket?: string;

  @ApiProperty({ enum: UPLOAD_TARGETS, example: 'REPORT' })
  target!: (typeof UPLOAD_TARGETS)[number];

  @ApiPropertyOptional({ example: '01JPCY2000REPORTNEW00000000' })
  entityId?: string;

  @ApiPropertyOptional({ example: 'street-light.jpg' })
  originalFileName?: string;

  @ApiPropertyOptional({ example: 'street-light.jpg' })
  fileName?: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  contentType?: string;

  @ApiPropertyOptional({ example: 345678 })
  size?: number;

  @ApiPropertyOptional({ example: '01JPCY0000CITIZENA00000000' })
  uploadedBy?: string;

  @ApiPropertyOptional({ example: '2026-03-17T10:30:00.000Z' })
  uploadedAt?: string;

  @ApiPropertyOptional({
    example:
      'https://smartcity-assets.s3.ap-southeast-1.amazonaws.com/uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-sample.jpg',
  })
  resolvedUrl?: string;

  @ApiPropertyOptional({ example: '2026-03-20T10:10:00.000Z' })
  expiresAt?: string;
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

  @ApiPropertyOptional({ type: () => MediaAssetDto })
  avatarAsset?: MediaAssetDto;

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

  @ApiProperty({
    example: true,
    description:
      'True when the user currently has an active chat socket or has shown recent authenticated activity within the short presence window.',
  })
  isActive!: boolean;

  @ApiProperty({
    example: 2,
    description:
      'Number of active chat sockets currently tracked for the user. `isActive` may still be true when this value is 0 if the user was recently active through authenticated requests.',
  })
  activeSocketCount!: number;

  @ApiPropertyOptional({
    example: '2026-03-18T03:10:00.000Z',
    description:
      'Best-effort last seen timestamp. This is omitted while the user is considered active.',
  })
  lastSeenAt?: string;

  @ApiProperty({ example: '2026-03-18T03:11:15.000Z' })
  occurredAt!: string;
}

export class FriendUserItemDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiProperty({ example: 'Tran Van Citizen B' })
  fullName!: string;

  @ApiProperty({
    example: 'Anh Hai',
    description:
      'Display name FE should show for this contact. Equals contactAlias when present, otherwise falls back to fullName.',
  })
  displayName!: string;

  @ApiPropertyOptional({
    example: 'Anh Hai',
    description:
      'Private alias set by the authenticated user for this contact.',
  })
  contactAlias?: string;

  @ApiProperty({ enum: USER_ROLES, example: 'CITIZEN' })
  role!: (typeof USER_ROLES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiPropertyOptional({ type: () => MediaAssetDto })
  avatarAsset?: MediaAssetDto;

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

  @ApiProperty({
    example: 'Chi Hang',
    description:
      'Display name FE should show for this contact. Equals contactAlias when present, otherwise falls back to fullName.',
  })
  displayName!: string;

  @ApiPropertyOptional({
    example: 'Chi Hang',
    description:
      'Private alias set by the authenticated user for this contact.',
  })
  contactAlias?: string;

  @ApiProperty({ enum: USER_ROLES, example: 'CITIZEN' })
  role!: (typeof USER_ROLES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiPropertyOptional({ type: () => MediaAssetDto })
  avatarAsset?: MediaAssetDto;

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

export class BlockedUserItemDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiProperty({ example: 'Tran Van Citizen B' })
  fullName!: string;

  @ApiProperty({
    example: 'Nguoi cu khu pho',
    description:
      'Display name FE should show for this contact. Equals contactAlias when present, otherwise falls back to fullName.',
  })
  displayName!: string;

  @ApiPropertyOptional({
    example: 'Nguoi cu khu pho',
    description:
      'Private alias set by the authenticated user for this contact.',
  })
  contactAlias?: string;

  @ApiProperty({ enum: USER_ROLES, example: 'CITIZEN' })
  role!: (typeof USER_ROLES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiPropertyOptional({ type: () => MediaAssetDto })
  avatarAsset?: MediaAssetDto;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-b.jpg' })
  avatarUrl?: string;

  @ApiProperty({ enum: USER_STATUSES, example: 'ACTIVE' })
  status!: (typeof USER_STATUSES)[number];

  @ApiProperty({ example: '2026-03-20T06:00:00.000Z' })
  blockedAt!: string;
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

export class BlockActionResultDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiPropertyOptional({ example: '2026-03-20T06:05:00.000Z' })
  blockedAt?: string;

  @ApiPropertyOptional({ example: '2026-03-20T06:05:00.000Z' })
  unblockedAt?: string;
}

export class UserDirectoryItemDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiProperty({ example: 'Tran Van Citizen B' })
  fullName!: string;

  @ApiProperty({
    example: 'Chi Hang',
    description:
      'Display name FE should show for this contact. Equals contactAlias when present, otherwise falls back to fullName.',
  })
  displayName!: string;

  @ApiPropertyOptional({
    example: 'Chi Hang',
    description:
      'Private alias set by the authenticated user for this contact.',
  })
  contactAlias?: string;

  @ApiProperty({ enum: USER_ROLES, example: 'CITIZEN' })
  role!: (typeof USER_ROLES)[number];

  @ApiProperty({ example: 'VN-HCM-BQ1-P01' })
  locationCode!: string;

  @ApiPropertyOptional({ example: 'Ward 1 People Committee' })
  unit?: string;

  @ApiPropertyOptional({ type: () => MediaAssetDto })
  avatarAsset?: MediaAssetDto;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-b.jpg' })
  avatarUrl?: string;

  @ApiProperty({ enum: USER_STATUSES, example: 'ACTIVE' })
  status!: (typeof USER_STATUSES)[number];

  @ApiProperty({
    enum: ['FRIEND', 'INCOMING_REQUEST', 'OUTGOING_REQUEST', 'NONE'],
    example: 'NONE',
    description:
      'Relationship state between the current user and this user in the friendship flow.',
  })
  relationState!: 'FRIEND' | 'INCOMING_REQUEST' | 'OUTGOING_REQUEST' | 'NONE';

  @ApiProperty({
    example: true,
    description: 'When true, FE can show the direct "Chat" action immediately.',
  })
  canMessage!: boolean;

  @ApiProperty({
    example: false,
    description:
      'When true, FE can show "Send friend request". Only meaningful for citizen-citizen discovery.',
  })
  canSendFriendRequest!: boolean;

  @ApiProperty({
    example: false,
    description:
      'When true, FE can create a same-scope stranger direct message request instead of a direct DM.',
  })
  canSendMessageRequest!: boolean;
}

export class SetUserContactAliasRequestDto {
  @ApiProperty({
    example: 'Anh Hai',
    description: 'Private alias for this contact. Maximum 100 characters.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  alias!: string;
}

export class UserContactAliasDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiProperty({ example: 'Anh Hai' })
  alias!: string;

  @ApiProperty({ example: '2026-03-20T06:00:00.000Z' })
  updatedAt!: string;
}

export class UserContactAliasRemovalResultDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiProperty({ example: '2026-03-20T06:05:00.000Z' })
  clearedAt!: string;
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

  @ApiProperty({
    enum: ['REPORT', 'CONVERSATION', 'GROUP'],
    example: 'REPORT',
  })
  scope!: 'REPORT' | 'CONVERSATION' | 'GROUP';

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

  @ApiProperty({
    enum: GROUP_MESSAGE_POLICIES,
    example: 'ALL_MEMBERS',
    description:
      'Controls which active group members may send new messages to the group conversation.',
  })
  messagePolicy!: (typeof GROUP_MESSAGE_POLICIES)[number];

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

export class GroupBanDto {
  @ApiProperty({ example: '01JPCY1000AREAGROUP0000000' })
  groupId!: string;

  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  userId!: string;

  @ApiProperty({ example: '01JPCY0000WARDOFFICER00000' })
  bannedByUserId!: string;

  @ApiPropertyOptional({
    example: 'Repeated spam and abusive messages in the group.',
  })
  reason?: string;

  @ApiPropertyOptional({
    example: '2026-05-01T00:00:00.000Z',
    nullable: true,
  })
  expiresAt!: string | null;

  @ApiProperty({ example: '2026-03-17T07:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-03-17T07:00:00.000Z' })
  updatedAt!: string;
}

export class GroupInviteLinkDto {
  @ApiProperty({ example: '01JPCY1000INVITELINK000000' })
  inviteId!: string;

  @ApiProperty({ example: '01JPCY1000AREAGROUP0000000' })
  groupId!: string;

  @ApiProperty({ example: '01kq2f6a6f5y3e5t5t2y93r9ax' })
  code!: string;

  @ApiProperty({ example: '01JPCY0000WARDOFFICER00000' })
  createdByUserId!: string;

  @ApiPropertyOptional({
    example: '2026-05-01T00:00:00.000Z',
    nullable: true,
  })
  expiresAt!: string | null;

  @ApiPropertyOptional({ example: 100, nullable: true })
  maxUses!: number | null;

  @ApiProperty({ example: 3 })
  usedCount!: number;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
  })
  disabledAt!: string | null;

  @ApiProperty({ example: '2026-03-17T07:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-03-17T07:00:00.000Z' })
  updatedAt!: string;
}

export class GroupOwnershipTransferResultDto {
  @ApiProperty({ example: '01JPCY1000AREAGROUP0000000' })
  groupId!: string;

  @ApiProperty({ example: '01JPCY0000WARDOFFICER00000' })
  previousOwnerUserId!: string;

  @ApiProperty({ enum: GROUP_MEMBER_ROLES, example: 'DEPUTY' })
  previousOwnerRoleInGroup!: (typeof GROUP_MEMBER_ROLES)[number];

  @ApiProperty({ example: '01JPCY0000DEPUTY0000000000000' })
  ownerUserId!: string;

  @ApiProperty({ example: '2026-03-18T10:20:00.000Z' })
  transferredAt!: string;
}

export class MessageReplyReferenceDto {
  @ApiProperty({ example: '01JPCY3000GROUPMSG00000001' })
  id!: string;

  @ApiProperty({ example: '01JPCY0000CITIZENA00000000' })
  senderId!: string;

  @ApiProperty({ example: 'Le Thi Citizen A' })
  senderName!: string;

  @ApiProperty({ enum: MESSAGE_TYPES, example: 'TEXT' })
  type!: (typeof MESSAGE_TYPES)[number];

  @ApiProperty({ example: '{"text":"O ga truoc so 123 Le Loi","mention":[]}' })
  content!: string;

  @ApiPropertyOptional({ type: () => MediaAssetDto })
  attachmentAsset?: MediaAssetDto;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/file.jpg' })
  attachmentUrl?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  recalledAt?: string | null;

  @ApiProperty({ example: '2026-03-17T08:00:00.000Z' })
  sentAt!: string;
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

  @ApiPropertyOptional({ type: () => MediaAssetDto })
  senderAvatarAsset?: MediaAssetDto;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar-a.jpg' })
  senderAvatarUrl?: string;

  @ApiProperty({ enum: MESSAGE_TYPES, example: 'TEXT' })
  type!: (typeof MESSAGE_TYPES)[number];

  @ApiProperty({ example: '{"text":"O ga truoc so 123 Le Loi","mention":[]}' })
  content!: string;

  @ApiPropertyOptional({ type: () => MediaAssetDto })
  attachmentAsset?: MediaAssetDto;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/file.jpg' })
  attachmentUrl?: string;

  @ApiPropertyOptional({ example: '01JPCY3000GROUPMSG00000001' })
  replyTo?: string;

  @ApiPropertyOptional({ type: () => MessageReplyReferenceDto })
  replyMessage?: MessageReplyReferenceDto;

  @ApiPropertyOptional({ example: null, nullable: true })
  recalledAt?: string | null;

  @ApiPropertyOptional({ example: '01JPCY0000CITIZENA00000000' })
  recalledByUserId?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedForSenderAt?: string | null;

  @ApiPropertyOptional({ example: '01JPCY3000GROUPMSG00000001' })
  forwardedFromMessageId?: string;

  @ApiPropertyOptional({ example: 'group:01JPCY1000AREAGROUP0000000' })
  forwardedFromConversationId?: string;

  @ApiPropertyOptional({ example: '01JPCY0000CITIZENA00000000' })
  forwardedFromSenderId?: string;

  @ApiPropertyOptional({ example: 'Le Thi Citizen A' })
  forwardedFromSenderName?: string;

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
    description:
      'Public route-safe conversation id. Use this value in API paths and socket payloads.',
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

  @ApiPropertyOptional({
    enum: DIRECT_MESSAGE_REQUEST_STATUS_VALUES,
    example: 'PENDING',
    nullable: true,
    description:
      'Direct message request state for stranger citizen-citizen conversations. Null for normal inbox conversations.',
  })
  requestStatus?: (typeof DIRECT_MESSAGE_REQUEST_STATUS_VALUES)[number] | null;

  @ApiPropertyOptional({
    enum: DIRECT_MESSAGE_REQUEST_DIRECTION_VALUES,
    example: 'INCOMING',
    nullable: true,
    description:
      'Whether the current user received or initiated the request. Null for normal inbox conversations.',
  })
  requestDirection?:
    | (typeof DIRECT_MESSAGE_REQUEST_DIRECTION_VALUES)[number]
    | null;

  @ApiPropertyOptional({
    example: '2026-03-17T08:25:00.000Z',
    nullable: true,
    description: 'When the direct message request was first created.',
  })
  requestRequestedAt?: string | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description:
      'When the direct message request was accepted/ignored/rejected/blocked.',
  })
  requestRespondedAt?: string | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'User id that responded to the direct message request.',
  })
  requestRespondedByUserId?: string | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description:
      'Per-user cutoff timestamp for messages hidden after a clear-history action. Older messages at or before this timestamp are not shown again to the current user.',
  })
  historyClearedAt?: string | null;

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

export class ConversationHistoryClearedResultDto {
  @ApiProperty({ example: 'group:01JPCY1000AREAGROUP0000000' })
  conversationId!: string;

  @ApiProperty({ example: '2026-03-18T09:20:00.000Z' })
  clearedAt!: string;
}

export class RecallMessageResultDto {
  @ApiProperty({ example: 'group:01JPCY1000AREAGROUP0000000' })
  conversationId!: string;

  @ApiProperty({ example: '01JPCY3000GROUPMSG00000001' })
  messageId!: string;

  @ApiProperty({
    enum: MESSAGE_RECALL_SCOPES,
    example: 'EVERYONE',
    description:
      '"EVERYONE" keeps a recalled placeholder for all participants. "SELF" hides the message only from the current actor inbox/view.',
  })
  scope!: (typeof MESSAGE_RECALL_SCOPES)[number];

  @ApiProperty({ example: '2026-03-18T09:15:00.000Z' })
  recalledAt!: string;
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
    type: [MediaAssetDto],
    example: [
      {
        key: 'uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-report-1.jpg',
        target: 'REPORT',
        entityId: '01JPCY2000REPORTNEW00000000',
        resolvedUrl: 'https://cdn.example.com/report-1.jpg',
      },
    ],
    description:
      'Preferred private-media representation. FE should prefer this field for private S3 flows.',
  })
  mediaAssets!: MediaAssetDto[];

  @ApiProperty({
    type: [String],
    example: ['https://cdn.example.com/report-1.jpg'],
    description:
      'Legacy resolved URLs kept for backward compatibility during FE migration.',
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
  @ApiPropertyOptional({
    example: '+84901234567',
    description:
      'Provide at least one of phone or email. Phone must be E.164-like after normalization.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    example: 'citizen.c@smartcity.local',
    description:
      'Provide at least one of email or phone. OTP-based registration requires email.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @ApiProperty({
    example: 'Ums@2026Secure1',
    description:
      'Standard password policy applies. Example failures: "password must include at least 3 of: uppercase, lowercase, number, special character." or "password must not contain your personal account information."',
  })
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
  @ApiProperty({
    example: 'citizen.a@smartcity.local',
    description: 'Email address or phone number.',
  })
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

  @ApiProperty({
    example: '2026-03-19T10:01:00.000Z',
    description:
      'Do not request a new OTP before this time. The OTP service may also throttle repeated requests.',
  })
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
  @ApiPropertyOptional({
    example: true,
    description:
      'Archive or unarchive the conversation for the current user only.',
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Pin or unpin the conversation for the current user only.',
  })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({
    example: '2026-03-20T00:00:00.000Z',
    nullable: true,
    description:
      'Mute notifications until a specific ISO datetime. Send null to clear the mute.',
  })
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

  @ApiPropertyOptional({
    example:
      'uploads/avatar/01JPCY0000CITIZENA00000000/01JPCYUPLOAD000000000000000-avatar-a-new.jpg',
    description:
      'Preferred private-media input. Use the S3 key returned by upload/presign or reuse a previous key from `GET /uploads/media?target=AVATAR`. If both `avatarKey` and legacy `avatarUrl` are sent, the API will prefer `avatarKey`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarKey?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatar-a-new.jpg',
    description:
      'Legacy fallback input. Ignored when `avatarKey` is also provided.',
    deprecated: true,
  })
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

  @ApiPropertyOptional({
    example:
      'uploads/avatar/01JPCY0000WARDOFFICER00000/01JPCYUPLOAD000000000000000-officer.jpg',
    description:
      'Preferred private-media input. Use the S3 key returned by upload/presign or reuse a previous key from `GET /uploads/media?target=AVATAR`. If both `avatarKey` and legacy `avatarUrl` are sent, the API will prefer `avatarKey`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarKey?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/officer.jpg',
    description:
      'Legacy fallback input. Ignored when `avatarKey` is also provided.',
    deprecated: true,
  })
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

  @ApiPropertyOptional({
    enum: GROUP_MESSAGE_POLICIES,
    example: 'ALL_MEMBERS',
    default: 'ALL_MEMBERS',
    description:
      'Optional send-message policy for the group. Defaults to ALL_MEMBERS.',
  })
  @IsOptional()
  @IsIn(GROUP_MESSAGE_POLICIES)
  messagePolicy?: (typeof GROUP_MESSAGE_POLICIES)[number];

  @ApiPropertyOptional({
    type: [String],
    example: ['01JPCY0000CITIZENA00000000'],
    description: 'Optional initial member user ids to add to the group.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];
}

export class UpdateGroupRequestDto {
  @ApiPropertyOptional({
    example: 'Phuong 1 Q1 - Moi truong',
    description: 'Only the group owner can rename the group.',
  })
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

  @ApiPropertyOptional({
    enum: GROUP_MESSAGE_POLICIES,
    example: 'OWNER_AND_DEPUTIES',
    description:
      'Only owners may change the group message policy. Deputies may update other metadata but not this field.',
  })
  @IsOptional()
  @IsIn(GROUP_MESSAGE_POLICIES)
  messagePolicy?: (typeof GROUP_MESSAGE_POLICIES)[number];
}

export class ManageGroupMemberRequestDto {
  @ApiProperty({ enum: GROUP_MEMBER_ACTIONS, example: 'update' })
  @IsIn(GROUP_MEMBER_ACTIONS)
  action!: (typeof GROUP_MEMBER_ACTIONS)[number];

  @ApiPropertyOptional({
    enum: GROUP_MEMBER_ROLES,
    example: 'DEPUTY',
    description:
      'Canonical values are OWNER, DEPUTY, MEMBER. Legacy payloads may still send OFFICER temporarily and will be normalized to DEPUTY.',
  })
  @IsOptional()
  @IsIn(GROUP_MEMBER_ROLE_INPUT_VALUES)
  roleInGroup?: (typeof GROUP_MEMBER_ROLE_INPUT_VALUES)[number];
}

export class AddGroupMemberRequestDto {
  @ApiProperty({ example: '01JPCY0000CITIZENB00000000' })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  userId!: string;

  @ApiPropertyOptional({
    enum: ASSIGNABLE_GROUP_MEMBER_ROLES,
    example: 'MEMBER',
  })
  @IsOptional()
  @IsIn(ASSIGNABLE_GROUP_MEMBER_ROLES)
  roleInGroup?: (typeof ASSIGNABLE_GROUP_MEMBER_ROLES)[number];
}

export class UpdateGroupMemberRoleRequestDto {
  @ApiProperty({ enum: ASSIGNABLE_GROUP_MEMBER_ROLES, example: 'DEPUTY' })
  @IsIn(ASSIGNABLE_GROUP_MEMBER_ROLES)
  roleInGroup!: (typeof ASSIGNABLE_GROUP_MEMBER_ROLES)[number];
}

export class BanGroupMemberRequestDto {
  @ApiPropertyOptional({
    example: 'Repeated spam and abusive messages in the group.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    example: '2026-05-01T00:00:00.000Z',
    description:
      'Optional ISO timestamp when the ban expires. Omit for an indefinite ban.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, {
    message: 'expiresAt must be a valid ISO-8601 UTC timestamp.',
  })
  expiresAt?: string;
}

export class CreateGroupInviteLinkRequestDto {
  @ApiPropertyOptional({
    example: '2026-05-01T00:00:00.000Z',
    description:
      'Optional ISO timestamp when the invite link expires. Omit for no time-based expiry.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, {
    message: 'expiresAt must be a valid ISO-8601 UTC timestamp.',
  })
  expiresAt?: string;

  @ApiPropertyOptional({
    example: 100,
    description:
      'Optional maximum number of successful joins allowed by this invite link.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUses?: number;
}

export class LeaveGroupRequestDto {
  @ApiProperty({
    example: '01JPCY0000DEPUTY0000000000000',
    description:
      'Required only when the current actor is the owner. The selected active member becomes the new owner while the current owner leaves the group in the same transaction.',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  successorUserId?: string;
}

export class TransferGroupOwnershipRequestDto {
  @ApiProperty({
    example: '01JPCY0000DEPUTY0000000000000',
    description:
      'Active member that should become the new owner. The previous owner stays in the group as deputy.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  targetUserId!: string;
}

export class SendDirectMessageRequestDto {
  @ApiProperty({
    example: '01JPCY0000WARDOFFICER00000',
    description:
      'Officer/staff/admin target in scope, or a citizen that can already be messaged directly.',
  })
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

  @ApiPropertyOptional({
    example:
      'uploads/message/01JPCY0000CITIZENA00000000/dm-01jpcy0000citizenb00000000/01JPCYUPLOAD000000000000000-file.jpg',
    description:
      'Preferred private-media input. Use the S3 key returned by upload/presign.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentKey?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/file.jpg',
    deprecated: true,
  })
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

export class CreateDirectMessageRequestDto {
  @ApiProperty({
    example: '01JPCY0000CITIZENB00000000',
    description:
      'Target citizen user id. Direct message requests are only supported between same-scope stranger citizens.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  targetUserId!: string;

  @ApiPropertyOptional({
    example: 'mobile-1742205600-0001',
    description:
      'Client-generated id used for retry-safe direct message request creation.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMessageId?: string;

  @ApiProperty({
    example:
      '{"text":"Xin chao, toi muon trao doi ve van de trong khu pho.","mention":[]}',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}

export class ListDirectRequestsQueryDto {
  @ApiPropertyOptional({
    enum: DIRECT_MESSAGE_REQUEST_DIRECTION_VALUES,
    example: 'INCOMING',
    description: 'Filter requests the current user received or sent.',
  })
  @IsOptional()
  @IsIn(DIRECT_MESSAGE_REQUEST_DIRECTION_VALUES)
  direction?: (typeof DIRECT_MESSAGE_REQUEST_DIRECTION_VALUES)[number];

  @ApiPropertyOptional({
    enum: DIRECT_MESSAGE_REQUEST_STATUS_VALUES,
    example: 'PENDING',
    description: 'Filter direct message requests by lifecycle state.',
  })
  @IsOptional()
  @IsIn(DIRECT_MESSAGE_REQUEST_STATUS_VALUES)
  status?: (typeof DIRECT_MESSAGE_REQUEST_STATUS_VALUES)[number];

  @ApiPropertyOptional({
    example:
      'eyJzb3J0VmFsdWUiOiIyMDI2LTAzLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6ImRtOjAxLi4uIn0',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Matches(INTEGER_QUERY_PATTERN)
  limit?: string;
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

  @ApiPropertyOptional({
    example:
      'uploads/message/01JPCY0000CITIZENA00000000/group-01jpcy1000areagroup0000000/01JPCYUPLOAD000000000000000-file.jpg',
    description:
      'Preferred private-media input. Use the S3 key returned by upload/presign. If both `attachmentKey` and legacy `attachmentUrl` are sent, the API will prefer `attachmentKey`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentKey?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/file.jpg',
    description:
      'Legacy fallback input. Ignored when `attachmentKey` is also provided.',
    deprecated: true,
  })
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
    example:
      'uploads/message/01JPCY0000CITIZENA00000000/group-01jpcy1000areagroup0000000/01JPCYUPLOAD000000000000000-file-updated.jpg',
    description:
      'Preferred private-media input. Send an empty string to clear the current attachment. If both `attachmentKey` and legacy `attachmentUrl` are sent, the API will prefer `attachmentKey`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentKey?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/file-updated.jpg',
    description:
      'Legacy URL input. Send an empty string to clear the current attachment. Ignored when `attachmentKey` is also provided.',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrl?: string;
}

export class RecallMessageRequestDto {
  @ApiProperty({
    enum: MESSAGE_RECALL_SCOPES,
    example: 'EVERYONE',
    description:
      '"EVERYONE" keeps a recalled placeholder for all participants. "SELF" hides the message only from the current actor inbox/view.',
  })
  @IsIn(MESSAGE_RECALL_SCOPES)
  scope!: (typeof MESSAGE_RECALL_SCOPES)[number];
}

export class ForwardMessageRequestDto {
  @ApiProperty({
    type: [String],
    example: [
      'group:01JPCY1000AREAGROUP0000000',
      'dm:01JPCY0000CITIZENB00000000',
    ],
    description:
      'Target conversations to receive the forwarded copy. Supports route-safe ids like group:<groupId> and dm:<userId>.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  conversationIds!: string[];
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
    example: [
      'uploads/report/01JPCY0000CITIZENA00000000/01JPCYUPLOAD000000000000000-report-1.jpg',
    ],
    description:
      'Preferred private-media input. Use S3 keys returned by upload/presign. If both `mediaKeys` and legacy `mediaUrls` are sent, the API will prefer `mediaKeys`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(500, { each: true })
  mediaKeys?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/report-1.jpg'],
    description:
      'Legacy fallback input. Ignored when `mediaKeys` is also provided.',
    deprecated: true,
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
    example: [
      'uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-report-1-update.jpg',
    ],
    description:
      'Preferred private-media input. Use S3 keys returned by upload/presign. If both `mediaKeys` and legacy `mediaUrls` are sent, the API will prefer `mediaKeys`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(500, { each: true })
  mediaKeys?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/report-1-update.jpg'],
    description:
      'Legacy fallback input. Ignored when `mediaKeys` is also provided.',
    deprecated: true,
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
      '"all" returns discoverable users. "chat" returns only users that can be messaged now. "friend" returns friendship-focused results.',
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
  @IsOptional()
  file!: string;
}

export class UploadLimitsDto {
  @ApiProperty({ example: 10485760 })
  maxFileSizeBytes!: number;

  @ApiProperty({
    type: [String],
    example: ['image/jpeg', 'image/png', 'application/pdf'],
  })
  allowedMimeTypes!: string[];

  @ApiProperty({
    type: [String],
    example: ['AVATAR'],
  })
  imageOnlyTargets!: (typeof UPLOAD_TARGETS)[number][];
}

export class UploadListItemDto {
  @ApiProperty({
    example:
      'uploads/avatar/01JPCY0000CITIZENA00000000/01JPCYUPLOAD000000000000000-avatar-a-new.jpg',
  })
  key!: string;

  @ApiProperty({ example: 'smartcity-assets' })
  bucket!: string;

  @ApiProperty({ enum: UPLOAD_TARGETS, example: 'AVATAR' })
  target!: (typeof UPLOAD_TARGETS)[number];

  @ApiPropertyOptional({ example: '01JPCY0000CITIZENA00000000' })
  entityId?: string;

  @ApiProperty({ example: '01jpcyupload000000000000000-avatar-a-new.jpg' })
  fileName!: string;

  @ApiPropertyOptional({ example: 153245 })
  size?: number;

  @ApiProperty({ example: '01JPCY0000CITIZENA00000000' })
  uploadedBy!: string;

  @ApiPropertyOptional({ example: '2026-04-15T09:30:00.000Z' })
  uploadedAt?: string;

  @ApiProperty({
    example:
      'https://smartcity-assets.s3.ap-southeast-1.amazonaws.com/uploads/avatar/01JPCY0000CITIZENA00000000/01JPCYUPLOAD000000000000000-avatar-a-new.jpg',
  })
  url!: string;

  @ApiPropertyOptional({ example: '2026-04-15T09:35:00.000Z' })
  expiresAt?: string;

  @ApiProperty({
    example: true,
    description:
      'True when this file is currently referenced by the active avatar/report/message for the requested target scope.',
  })
  isInUse!: boolean;
}

export class ListUploadsQueryDto {
  @ApiProperty({
    enum: UPLOAD_TARGETS,
    example: 'AVATAR',
    description:
      'Required. Use `AVATAR` to list avatar history. `REPORT` and `MESSAGE` require `entityId`.',
  })
  @IsIn(UPLOAD_TARGETS)
  target!: (typeof UPLOAD_TARGETS)[number];

  @ApiPropertyOptional({
    example: '01JPCY2000REPORTNEW00000000',
    description:
      'Required for `REPORT` and `MESSAGE`. Optional for `AVATAR` and `GENERAL`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiPropertyOptional({
    example:
      'eyJpZCI6IjAxSlBDWS4uLiIsInNvcnRWYWx1ZSI6IjIwMjYtMDQtMTVUMDk6MzA6MDAuMDAwWiJ9',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: '20' })
  @IsOptional()
  @Matches(INTEGER_QUERY_PATTERN)
  limit?: string;
}

export class DeleteUploadRequestDto {
  @ApiProperty({ enum: UPLOAD_TARGETS, example: 'REPORT' })
  @IsIn(UPLOAD_TARGETS)
  target!: (typeof UPLOAD_TARGETS)[number];

  @ApiPropertyOptional({
    example: '01JPCY2000REPORTNEW00000000',
    description:
      'Optional when the uploaded key already encodes the entity id. Still recommended for explicit FE payloads.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiProperty({
    example:
      'uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-sample.jpg',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  key!: string;
}

export class DeleteUploadResultDto {
  @ApiProperty({ example: true })
  deleted!: true;

  @ApiProperty({
    example:
      'uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-sample.jpg',
  })
  key!: string;

  @ApiProperty({ example: '2026-03-20T10:10:00.000Z' })
  removedAt!: string;
}

export class PresignUploadRequestDto {
  @ApiProperty({ enum: UPLOAD_TARGETS, example: 'REPORT' })
  @IsIn(UPLOAD_TARGETS)
  target!: (typeof UPLOAD_TARGETS)[number];

  @ApiPropertyOptional({ example: '01JPCY2000REPORTNEW00000000' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiProperty({ example: 'street-light.jpg' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  contentType!: string;

  @ApiProperty({ example: 345678 })
  @IsNumber()
  size!: number;
}

export class PresignUploadResultDto {
  @ApiProperty({ example: 'PUT' })
  method!: 'PUT';

  @ApiProperty({ example: 'https://s3.ap-southeast-1.amazonaws.com/...' })
  url!: string;

  @ApiProperty({
    example:
      'uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-street-light.jpg',
  })
  key!: string;

  @ApiProperty({ example: 'smartcity-assets' })
  bucket!: string;

  @ApiProperty({ enum: UPLOAD_TARGETS, example: 'REPORT' })
  target!: (typeof UPLOAD_TARGETS)[number];

  @ApiPropertyOptional({ example: '01JPCY2000REPORTNEW00000000' })
  entityId?: string;

  @ApiProperty({ example: 'image/jpeg' })
  contentType!: string;

  @ApiProperty({ example: '2026-03-20T10:10:00.000Z' })
  expiresAt!: string;
}

export class PresignDownloadRequestDto {
  @ApiProperty({ enum: UPLOAD_TARGETS, example: 'REPORT' })
  @IsIn(UPLOAD_TARGETS)
  target!: (typeof UPLOAD_TARGETS)[number];

  @ApiPropertyOptional({
    example: '01JPCY2000REPORTNEW00000000',
    description:
      'Optional when the uploaded key already encodes the entity id. Still recommended when FE already knows the bound entity.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiProperty({
    example:
      'uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-street-light.jpg',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  key!: string;
}

export class PresignDownloadResultDto {
  @ApiProperty({ example: 'GET' })
  method!: 'GET';

  @ApiProperty({ example: 'https://s3.ap-southeast-1.amazonaws.com/...' })
  url!: string;

  @ApiProperty({
    example:
      'uploads/report/01JPCY0000CITIZENA00000000/01JPCY2000REPORTNEW00000000/01JPCYUPLOAD000000000000000-street-light.jpg',
  })
  key!: string;

  @ApiProperty({ example: '2026-03-20T10:10:00.000Z' })
  expiresAt!: string;
}
