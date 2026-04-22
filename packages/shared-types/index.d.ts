import type {
  GroupMemberRole,
  GroupMessagePolicy,
  GroupType,
  MessageDeliveryState,
  MessageRecallScope,
  MessageType,
  PushDeviceProvider,
  ReportCategory,
  ReportPriority,
  ReportStatus,
  SessionScope,
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

export interface AuthSessionInfo {
  sessionId: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  expiresAt: string;
  dismissedAt?: string | null;
  revokedAt: string | null;
  sessionScope: SessionScope;
  userAgent?: string;
  ipAddress?: string;
  deviceId?: string;
  appVariant?: string;
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

export interface MediaAsset {
  key: string;
  bucket?: string;
  target: UploadTarget;
  entityId?: string;
  originalFileName?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  uploadedBy?: string;
  uploadedAt?: string;
  resolvedUrl?: string;
  expiresAt?: string;
}

export interface UserProfile {
  id: string;
  phone?: string;
  email?: string;
  fullName: string;
  role: UserRole;
  locationCode: string;
  unit?: string;
  avatarAsset?: MediaAsset;
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
  avatarAsset?: MediaAsset;
  avatarUrl?: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserFriendItem {
  userId: string;
  fullName: string;
  role: UserRole;
  locationCode: string;
  avatarAsset?: MediaAsset;
  avatarUrl?: string;
  status: UserStatus;
  friendsSince: string;
}

export interface UserFriendRequestItem {
  userId: string;
  fullName: string;
  role: UserRole;
  locationCode: string;
  avatarAsset?: MediaAsset;
  avatarUrl?: string;
  status: UserStatus;
  direction: "INCOMING" | "OUTGOING";
  requestedAt: string;
}

export interface UserBlockedItem {
  userId: string;
  fullName: string;
  role: UserRole;
  locationCode: string;
  avatarAsset?: MediaAsset;
  avatarUrl?: string;
  status: UserStatus;
  blockedAt: string;
}

export interface UserDirectoryItem {
  userId: string;
  fullName: string;
  role: UserRole;
  locationCode: string;
  avatarAsset?: MediaAsset;
  avatarUrl?: string;
  status: UserStatus;
  relationState: "FRIEND" | "INCOMING_REQUEST" | "OUTGOING_REQUEST" | "NONE";
  canMessage: boolean;
  canSendFriendRequest: boolean;
  canSendMessageRequest: boolean;
}

export interface GroupMetadata {
  id: string;
  groupName: string;
  groupType: GroupType;
  messagePolicy: GroupMessagePolicy;
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

export interface GroupBan {
  groupId: string;
  userId: string;
  bannedByUserId: string;
  reason?: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupInviteLink {
  inviteId: string;
  groupId: string;
  code: string;
  createdByUserId: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageReplyReference {
  id: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  content: string;
  attachmentAsset?: MediaAsset;
  attachmentUrl?: string;
  deletedAt: string | null;
  recalledAt?: string | null;
  sentAt: string;
}

export interface MessageItem {
  conversationId: string;
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarAsset?: MediaAsset;
  senderAvatarUrl?: string;
  type: MessageType;
  content: string;
  attachmentAsset?: MediaAsset;
  attachmentUrl?: string;
  replyTo?: string;
  replyMessage?: MessageReplyReference;
  recalledAt?: string | null;
  recalledByUserId?: string | null;
  deletedForSenderAt?: string | null;
  forwardedFromMessageId?: string;
  forwardedFromConversationId?: string;
  forwardedFromSenderId?: string;
  forwardedFromSenderName?: string;
  deletedAt: string | null;
  sentAt: string;
  updatedAt: string;
  deliveryState?: MessageDeliveryState;
  recipientCount?: number;
  deliveredCount?: number;
  readByCount?: number;
  lastReadAt?: string;
}

export interface ConversationSummary {
  conversationId: string;
  groupName: string;
  lastMessagePreview: string;
  lastSenderName: string;
  unreadCount: number;
  isGroup: boolean;
  isPinned?: boolean;
  archivedAt?: string | null;
  mutedUntil?: string | null;
  requestStatus?: "PENDING" | "IGNORED" | "REJECTED" | "BLOCKED" | null;
  requestDirection?: "INCOMING" | "OUTGOING" | null;
  requestRequestedAt?: string | null;
  requestRespondedAt?: string | null;
  requestRespondedByUserId?: string | null;
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
  mediaAssets: MediaAsset[];
  mediaUrls: string[];
  assignedOfficerId?: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponseMeta {
  count: number;
  nextCursor?: string;
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
  requestId?: string;
}

export type ApiResponse<TData, TMeta = undefined> =
  | ApiSuccessResponse<TData, TMeta>
  | ApiErrorResponse;

export interface PushDevice {
  deviceId: string;
  provider: PushDeviceProvider;
  platform: string;
  appVariant?: string;
  tokenPreview: string;
  disabledAt: string | null;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventItem {
  id: string;
  scope: "REPORT" | "CONVERSATION" | "GROUP";
  action: string;
  actorUserId: string;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface ReportConversationLinkItem {
  reportId: string;
  groupId: string;
  conversationId: string;
  linkedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface ChatCallInitPayload extends ChatConversationCommandPayload {
  callerId: string;
  callerName: string;
  isVideo: boolean;
}

export interface ChatCallAcceptPayload extends ChatConversationCommandPayload {
  calleeId: string;
}

export interface ChatCallRejectPayload extends ChatConversationCommandPayload {
  calleeId: string;
}

export interface ChatCallEndPayload extends ChatConversationCommandPayload {
  userId: string;
  endedByUserId?: string;
}

export interface ChatWebRTCOfferPayload extends ChatConversationCommandPayload {
  offer: any;
}

export interface ChatWebRTCAnswerPayload extends ChatConversationCommandPayload {
  answer: any;
}

export interface ChatWebRTCIceCandidatePayload extends ChatConversationCommandPayload {
  candidate: any;
}

export interface ChatMessageSendPayload extends ChatConversationCommandPayload {
  clientMessageId?: string;
  type?: MessageType;
  content?: string;
  attachmentKey?: string;
  attachmentUrl?: string;
  replyTo?: string;
}

export interface ChatMessageUpdatePayload extends ChatConversationCommandPayload {
  messageId: string;
  content?: string;
  attachmentKey?: string;
  attachmentUrl?: string;
}

export interface ChatMessageDeletePayload extends ChatConversationCommandPayload {
  messageId: string;
}

export interface ChatMessageRecallPayload extends ChatConversationCommandPayload {
  messageId: string;
  scope: MessageRecallScope;
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

export interface ChatConversationDeletedAccepted {
  conversationId: string;
  removedAt: string;
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

export interface RecallMessageResult {
  conversationId: string;
  messageId: string;
  scope: MessageRecallScope;
  recalledAt: string;
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
  eventId: string;
  conversationId: string;
  conversationKey: string;
  message: MessageItem;
  summary: ConversationSummary;
  sentByUserId: string;
  clientMessageId?: string;
  occurredAt: string;
}

export interface ChatMessageUpdatedEvent {
  eventId: string;
  conversationId: string;
  conversationKey: string;
  message: MessageItem;
  updatedByUserId: string;
  occurredAt: string;
}

export interface ChatMessageDeletedEvent {
  eventId: string;
  conversationId: string;
  conversationKey: string;
  messageId: string;
  deletedByUserId: string;
  occurredAt: string;
}

export interface ChatConversationUpdatedEvent {
  eventId: string;
  conversationId: string;
  conversationKey: string;
  summary: ConversationSummary;
  reason:
    | "message.created"
    | "message.updated"
    | "message.deleted"
    | "conversation.read"
    | "conversation.preferences.updated"
    | "conversation.request.updated";
  occurredAt: string;
}

export interface ChatConversationRemovedEvent {
  eventId: string;
  conversationId: string;
  conversationKey: string;
  reason: "message.deleted" | "conversation.deleted";
  occurredAt: string;
}

export interface ChatConversationReadEvent {
  eventId: string;
  conversationId: string;
  conversationKey: string;
  readByUserId: string;
  readAt: string;
}

export interface ChatTypingStateEvent {
  conversationKey: string;
  userId: string;
  fullName: string;
  avatarAsset?: MediaAsset;
  avatarUrl?: string;
  isTyping: boolean;
  occurredAt: string;
  clientTimestamp?: string;
}
export interface ChatPresenceState {
  userId: string;
  isActive: boolean;
  activeSocketCount: number;
  lastSeenAt?: string;
  occurredAt: string;
}

export interface ChatPresenceSnapshotEvent {
  conversationKey: string;
  participants: ChatPresenceState[];
  occurredAt: string;
}

export interface ChatPresenceUpdatedEvent {
  conversationKey: string;
  presence: ChatPresenceState;
  occurredAt: string;
}
