import type {
  GroupMemberRole,
  GroupType,
  MessageType,
  ReportCategory,
  ReportPriority,
  ReportStatus,
  UploadTarget,
  UserRole,
  UserStatus,
} from "@urban/shared-constants";

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  tokenType: "Bearer";
}

export interface JwtClaims {
  sub: string;
  role: UserRole;
  locationCode: string;
  tokenType: "access" | "refresh";
  sid?: string;
  iss: string;
  iat: number;
  exp: number;
}

export interface LocationSegments {
  country: string;
  province: string;
  district: string;
  ward: string;
}

export interface UserProfile {
  id: string;
  phone?: string;
  email?: string;
  fullName: string;
  role: UserRole;
  locationCode: string;
  unit?: string;
  avatarUrl?: string;
  status: UserStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedUser {
  id: string;
  phone?: string;
  email?: string;
  fullName: string;
  role: UserRole;
  locationCode: string;
  unit?: string;
  avatarUrl?: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMetadata {
  id: string;
  groupName: string;
  groupType: GroupType;
  locationCode: string;
  createdBy: string;
  description?: string;
  memberCount: number;
  isOfficial: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMembership {
  groupId: string;
  userId: string;
  roleInGroup: GroupMemberRole;
  joinedAt: string;
  deletedAt: string | null;
  updatedAt: string;
}

export interface MessageItem {
  conversationId: string;
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  type: MessageType;
  content: string;
  attachmentUrl?: string;
  replyTo?: string;
  deletedAt: string | null;
  sentAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  conversationId: string;
  groupName: string;
  lastMessagePreview: string;
  lastSenderName: string;
  unreadCount: number;
  isGroup: boolean;
  deletedAt: string | null;
  updatedAt: string;
}

export interface ReportItem {
  id: string;
  userId: string;
  groupId?: string;
  title: string;
  description?: string;
  category: ReportCategory;
  locationCode: string;
  status: ReportStatus;
  priority: ReportPriority;
  mediaUrls: string[];
  assignedOfficerId?: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponseMeta {
  count: number;
}

export interface ApiSuccessResponse<TData, TMeta = undefined> {
  success: true;
  data: TData;
  meta?: TMeta;
}

export interface ApiErrorPayload {
  statusCode: number;
  message: string | string[];
  error: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
  path: string;
  timestamp: string;
}

export type ApiResponse<TData, TMeta = undefined> =
  | ApiSuccessResponse<TData, TMeta>
  | ApiErrorResponse;

export interface UploadedAsset {
  key: string;
  url: string;
  bucket: string;
  target: UploadTarget;
  entityId?: string;
  originalFileName: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ChatSocketError {
  code: string;
  message: string;
  statusCode?: number;
}

export type ChatSocketAck<TData> =
  | {
      success: true;
      data: TData;
    }
  | {
      success: false;
      error: ChatSocketError;
    };

export interface ChatSocketReadyPayload {
  user: AuthenticatedUser;
  connectedAt: string;
  namespace: string;
}

export interface ChatConversationCommandPayload {
  conversationId: string;
}

export interface ChatTypingCommandPayload {
  conversationId: string;
  clientTimestamp?: string;
}

export interface ChatMessageSendPayload extends ChatConversationCommandPayload {
  clientMessageId?: string;
  type?: MessageType;
  content?: string;
  attachmentUrl?: string;
  replyTo?: string;
}

export interface ChatMessageUpdatePayload
  extends ChatConversationCommandPayload {
  messageId: string;
  content?: string;
  attachmentUrl?: string;
}

export interface ChatMessageDeletePayload
  extends ChatConversationCommandPayload {
  messageId: string;
}

export interface ChatConversationSubscription {
  conversationId: string;
  conversationKey: string;
  isGroup: boolean;
  participantCount: number;
  joinedAt: string;
}

export interface ChatConversationUnsubscription {
  conversationId: string;
  conversationKey: string;
  leftAt: string;
}

export interface ChatMessageAccepted {
  conversationId: string;
  conversationKey: string;
  messageId: string;
  clientMessageId?: string;
  acceptedAt: string;
}

export interface ChatMessageUpdatedAccepted {
  conversationId: string;
  conversationKey: string;
  messageId: string;
  updatedAt: string;
}

export interface ChatMessageDeletedAccepted {
  conversationId: string;
  conversationKey: string;
  messageId: string;
  deletedAt: string;
}

export interface ChatReadAccepted {
  conversationId: string;
  conversationKey: string;
  readAt: string;
}

export interface ChatTypingAccepted {
  conversationId: string;
  conversationKey: string;
  isTyping: boolean;
  acceptedAt: string;
}

export interface ChatMessageCreatedEvent {
  conversationId: string;
  conversationKey: string;
  message: MessageItem;
  summary: ConversationSummary;
  sentByUserId: string;
  clientMessageId?: string;
  occurredAt: string;
}

export interface ChatMessageUpdatedEvent {
  conversationId: string;
  conversationKey: string;
  message: MessageItem;
  updatedByUserId: string;
  occurredAt: string;
}

export interface ChatMessageDeletedEvent {
  conversationId: string;
  conversationKey: string;
  messageId: string;
  deletedByUserId: string;
  occurredAt: string;
}

export interface ChatConversationUpdatedEvent {
  conversationId: string;
  conversationKey: string;
  summary: ConversationSummary;
  reason:
    | "message.created"
    | "message.updated"
    | "message.deleted"
    | "conversation.read";
  occurredAt: string;
}

export interface ChatConversationRemovedEvent {
  conversationId: string;
  conversationKey: string;
  reason: "message.deleted";
  occurredAt: string;
}

export interface ChatConversationReadEvent {
  conversationId: string;
  conversationKey: string;
  readByUserId: string;
  readAt: string;
}

export interface ChatTypingStateEvent {
  conversationKey: string;
  userId: string;
  fullName: string;
  avatarUrl?: string;
  isTyping: boolean;
  occurredAt: string;
  clientTimestamp?: string;
}
