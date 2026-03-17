import type {
  ConversationSummary,
  GroupMembership,
  GroupMetadata,
  MessageItem,
  ReportItem,
  UserProfile,
} from '@urban/shared-types';

export type StorageEntityType =
  | 'USER_PROFILE'
  | 'USER_REFRESH_SESSION'
  | 'USER_REFRESH_TOKEN_REVOCATION'
  | 'GROUP_METADATA'
  | 'GROUP_MEMBERSHIP'
  | 'MESSAGE'
  | 'MESSAGE_REF'
  | 'MESSAGE_DEDUP'
  | 'CONVERSATION'
  | 'REPORT';

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
  extends TableItemBase, Omit<MessageItem, 'id' | 'conversationId'> {
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

export interface StoredReport extends TableItemBase, Omit<ReportItem, 'id'> {
  entityType: 'REPORT';
  reportId: string;
}
