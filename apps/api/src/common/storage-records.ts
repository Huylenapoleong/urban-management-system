import type {
  AuditEventItem,
  ConversationSummary,
  GroupMembership,
  GroupMetadata,
  MessageItem,
  MessageReplyReference,
  PushDevice,
  ReportConversationLinkItem,
  ReportItem,
  UserProfile,
} from '@urban/shared-types';
import type { SessionScope } from '@urban/shared-constants';
import type { OtpPurpose } from '@urban/shared-constants';

export type StorageEntityType =
  | 'USER_PROFILE'
  | 'USER_IDENTITY_CLAIM'
  | 'USER_FRIEND_EDGE'
  | 'USER_FRIEND_REQUEST'
  | 'USER_BLOCK_EDGE'
  | 'USER_REFRESH_SESSION'
  | 'USER_SESSION_SLOT'
  | 'USER_REFRESH_TOKEN_REVOCATION'
  | 'AUTH_IDENTITY_ATTEMPT'
  | 'AUTH_EMAIL_OTP'
  | 'AUTH_REGISTER_DRAFT'
  | 'USER_PUSH_DEVICE'
  | 'PUSH_OUTBOX_EVENT'
  | 'GROUP_METADATA'
  | 'GROUP_MEMBERSHIP'
  | 'GROUP_DELETE_CLEANUP_TASK'
  | 'MESSAGE'
  | 'MESSAGE_REF'
  | 'MESSAGE_DEDUP'
  | 'CONVERSATION'
  | 'DIRECT_MESSAGE_REQUEST'
  | 'CHAT_OUTBOX_EVENT'
  | 'CONVERSATION_AUDIT_EVENT'
  | 'REPORT'
  | 'REPORT_AUDIT_EVENT'
  | 'REPORT_CONVERSATION_LINK';

export interface TableItemBase {
  PK: string;
  SK: string;
  entityType: StorageEntityType;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
}

export interface StoredUser extends TableItemBase, Omit<UserProfile, 'id'> {
  entityType: 'USER_PROFILE';
  userId: string;
  passwordHash: string;
}

export interface StoredUserIdentityClaim extends TableItemBase {
  entityType: 'USER_IDENTITY_CLAIM';
  userId: string;
  identityType: 'PHONE' | 'EMAIL';
  identityValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredUserFriendEdge extends TableItemBase {
  entityType: 'USER_FRIEND_EDGE';
  userId: string;
  friendUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredUserFriendRequest extends TableItemBase {
  entityType: 'USER_FRIEND_REQUEST';
  requesterUserId: string;
  targetUserId: string;
  direction: 'INCOMING' | 'OUTGOING';
  createdAt: string;
  updatedAt: string;
}

export interface StoredUserBlockEdge extends TableItemBase {
  entityType: 'USER_BLOCK_EDGE';
  blockerUserId: string;
  blockedUserId: string;
  direction: 'OUTGOING' | 'INCOMING';
  createdAt: string;
  updatedAt: string;
}

export interface StoredRefreshSession extends TableItemBase {
  entityType: 'USER_REFRESH_SESSION';
  userId: string;
  sessionId: string;
  sessionScope: SessionScope;
  tokenHash: string;
  expiresAt: string;
  dismissedAt?: string | null;
  revokedAt: string | null;
  replacedBySessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  deviceId?: string;
  appVariant?: string;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredUserSessionSlot extends TableItemBase {
  entityType: 'USER_SESSION_SLOT';
  userId: string;
  sessionScope: SessionScope;
  currentSessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredRefreshTokenRevocation extends TableItemBase {
  entityType: 'USER_REFRESH_TOKEN_REVOCATION';
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAuthIdentityAttempt extends TableItemBase {
  entityType: 'AUTH_IDENTITY_ATTEMPT';
  purpose: 'LOGIN' | 'REGISTER';
  identityType: 'EMAIL' | 'PHONE';
  identityValue: string;
  attemptCount: number;
  firstAttemptAt: string;
  lastAttemptAt: string;
  lockedUntil: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAuthEmailOtp extends TableItemBase {
  entityType: 'AUTH_EMAIL_OTP';
  otpId: string;
  purpose: OtpPurpose;
  email: string;
  userId?: string;
  codeHash: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptCount: number;
  maxAttempts: number;
  consumedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAuthRegisterDraft extends TableItemBase {
  entityType: 'AUTH_REGISTER_DRAFT';
  email: string;
  phone?: string;
  passwordHash: string;
  fullName: string;
  locationCode: string;
  avatarUrl?: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPushDevice
  extends TableItemBase, Omit<PushDevice, 'deviceId' | 'tokenPreview'> {
  entityType: 'USER_PUSH_DEVICE';
  userId: string;
  deviceId: string;
  pushToken: string;
}

export interface StoredPushOutboxEvent extends TableItemBase {
  entityType: 'PUSH_OUTBOX_EVENT';
  eventId: string;
  eventName:
    | 'chat.message.created'
    | 'report.assigned'
    | 'report.status.updated';
  actorUserId: string;
  recipientUserIds: string[];
  title: string;
  body: string;
  conversationId?: string;
  messageId?: string;
  reportId?: string;
  skipIfActive: boolean;
  data?: Record<string, string>;
  createdAt: string;
}

export interface StoredGroup extends TableItemBase, Omit<GroupMetadata, 'id'> {
  entityType: 'GROUP_METADATA';
  groupId: string;
}

export interface StoredMembership
  extends TableItemBase, Omit<GroupMembership, 'groupId' | 'userId'> {
  entityType: 'GROUP_MEMBERSHIP';
  groupId: string;
  userId: string;
}

export interface StoredGroupDeleteCleanupTask extends TableItemBase {
  entityType: 'GROUP_DELETE_CLEANUP_TASK';
  groupId: string;
  deletedAt: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface StoredMessage
  extends
    TableItemBase,
    Omit<
      MessageItem,
      | 'id'
      | 'conversationId'
      | 'replyMessage'
      | 'deliveryState'
      | 'recipientCount'
      | 'deliveredCount'
      | 'readByCount'
      | 'lastReadAt'
    > {
  entityType: 'MESSAGE';
  messageId: string;
  conversationId: string;
  replyMessage?: MessageReplyReference;
  deletedForUserAt?: Record<string, string>;
}

export interface StoredMessageRef extends TableItemBase {
  entityType: 'MESSAGE_REF';
  conversationId: string;
  messageId: string;
  messageSk: string;
  senderId: string;
  sentAt: string;
  updatedAt: string;
}

export interface StoredMessageDedup extends TableItemBase {
  entityType: 'MESSAGE_DEDUP';
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  messageId: string;
  messageSk: string;
  sentAt: string;
  updatedAt: string;
}

export interface StoredConversation
  extends TableItemBase, Omit<ConversationSummary, 'conversationId'> {
  entityType: 'CONVERSATION';
  userId: string;
  conversationId: string;
  lastReadAt?: string | null;
}

export interface StoredDirectMessageRequest extends TableItemBase {
  entityType: 'DIRECT_MESSAGE_REQUEST';
  conversationId: string;
  requesterUserId: string;
  targetUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'IGNORED' | 'REJECTED' | 'BLOCKED';
  createdAt: string;
  updatedAt: string;
  respondedAt?: string | null;
  respondedByUserId?: string | null;
}

export interface StoredChatOutboxEvent extends TableItemBase {
  entityType: 'CHAT_OUTBOX_EVENT';
  eventId: string;
  eventName:
    | 'message.created'
    | 'message.updated'
    | 'message.deleted'
    | 'conversation.read';
  conversationId: string;
  actorUserId: string;
  messageId?: string;
  clientMessageId?: string;
  createdAt: string;
}

export interface StoredConversationAuditEvent
  extends TableItemBase, Omit<AuditEventItem, 'id' | 'scope'> {
  entityType: 'CONVERSATION_AUDIT_EVENT';
  eventId: string;
  conversationId: string;
  messageId?: string;
}

export interface StoredReport extends TableItemBase, Omit<ReportItem, 'id'> {
  entityType: 'REPORT';
  reportId: string;
}

export interface StoredReportAuditEvent
  extends TableItemBase, Omit<AuditEventItem, 'id' | 'scope'> {
  entityType: 'REPORT_AUDIT_EVENT';
  eventId: string;
  reportId: string;
}

export interface StoredReportConversationLink
  extends TableItemBase, Omit<ReportConversationLinkItem, 'conversationId'> {
  entityType: 'REPORT_CONVERSATION_LINK';
  conversationId: string;
}
