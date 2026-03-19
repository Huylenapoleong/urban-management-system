import type {
  AuditEventItem,
  ConversationSummary,
  GroupMembership,
  GroupMetadata,
  MessageItem,
  PushDevice,
  ReportConversationLinkItem,
  ReportItem,
  UserProfile,
} from '@urban/shared-types';

export type StorageEntityType =
  | 'USER_PROFILE'
  | 'USER_REFRESH_SESSION'
  | 'USER_REFRESH_TOKEN_REVOCATION'
  | 'USER_PUSH_DEVICE'
  | 'PUSH_OUTBOX_EVENT'
  | 'GROUP_METADATA'
  | 'GROUP_MEMBERSHIP'
  | 'MESSAGE'
  | 'MESSAGE_REF'
  | 'MESSAGE_DEDUP'
  | 'CONVERSATION'
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

export interface StoredRefreshSession extends TableItemBase {
  entityType: 'USER_REFRESH_SESSION';
  userId: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: string;
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

export interface StoredRefreshTokenRevocation extends TableItemBase {
  entityType: 'USER_REFRESH_TOKEN_REVOCATION';
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string;
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

export interface StoredMessage
  extends
    TableItemBase,
    Omit<
      MessageItem,
      | 'id'
      | 'conversationId'
      | 'deliveryState'
      | 'recipientCount'
      | 'deliveredCount'
      | 'readByCount'
      | 'lastReadAt'
    > {
  entityType: 'MESSAGE';
  messageId: string;
  conversationId: string;
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
