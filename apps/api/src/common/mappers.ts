import type {
  AuditEventItem,
  AuthSessionInfo,
  AuthenticatedUser,
  ConversationSummary,
  GroupMembership,
  GroupMetadata,
  MessageItem,
  PushDevice,
  ReportConversationLinkItem,
  ReportItem,
  UserFriendItem,
  UserFriendRequestItem,
  UserProfile,
} from '@urban/shared-types';
import type {
  StoredConversation,
  StoredConversationAuditEvent,
  StoredRefreshSession,
  StoredGroup,
  StoredMembership,
  StoredMessage,
  StoredPushDevice,
  StoredReport,
  StoredReportAuditEvent,
  StoredReportConversationLink,
  StoredUser,
} from './storage-records';

function maskPushToken(pushToken: string): string {
  if (pushToken.length <= 10) {
    return pushToken;
  }

  return `${pushToken.slice(0, 6)}...${pushToken.slice(-4)}`;
}

export function toUserProfile(user: StoredUser): UserProfile {
  return {
    id: user.userId,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    locationCode: user.locationCode,
    unit: user.unit,
    avatarAsset: user.avatarAsset,
    avatarUrl: user.avatarUrl,
    status: user.status,
    deletedAt: user.deletedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toUserFriendItem(
  user: StoredUser,
  friendsSince: string,
): UserFriendItem {
  return {
    userId: user.userId,
    fullName: user.fullName,
    role: user.role,
    locationCode: user.locationCode,
    avatarAsset: user.avatarAsset,
    avatarUrl: user.avatarUrl,
    status: user.status,
    friendsSince,
  };
}

export function toUserFriendRequestItem(
  user: StoredUser,
  direction: 'INCOMING' | 'OUTGOING',
  requestedAt: string,
): UserFriendRequestItem {
  return {
    userId: user.userId,
    fullName: user.fullName,
    role: user.role,
    locationCode: user.locationCode,
    avatarAsset: user.avatarAsset,
    avatarUrl: user.avatarUrl,
    status: user.status,
    direction,
    requestedAt,
  };
}

export function toAuthenticatedUser(user: StoredUser): AuthenticatedUser {
  return {
    id: user.userId,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    locationCode: user.locationCode,
    unit: user.unit,
    avatarAsset: user.avatarAsset,
    avatarUrl: user.avatarUrl,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toAuthSessionInfo(
  session: StoredRefreshSession,
  currentSessionId?: string,
): AuthSessionInfo {
  return {
    sessionId: session.sessionId,
    isCurrent: session.sessionId === currentSessionId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastUsedAt: session.lastUsedAt ?? session.updatedAt ?? session.createdAt,
    expiresAt: session.expiresAt,
    dismissedAt: session.dismissedAt ?? null,
    revokedAt: session.revokedAt,
    sessionScope: session.sessionScope,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    deviceId: session.deviceId,
    appVariant: session.appVariant,
  };
}

export function toPushDevice(device: StoredPushDevice): PushDevice {
  return {
    deviceId: device.deviceId,
    provider: device.provider,
    platform: device.platform,
    appVariant: device.appVariant,
    tokenPreview: maskPushToken(device.pushToken),
    disabledAt: device.disabledAt,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}

export function toGroupMetadata(group: StoredGroup): GroupMetadata {
  return {
    id: group.groupId,
    groupName: group.groupName,
    groupType: group.groupType,
    locationCode: group.locationCode,
    createdBy: group.createdBy,
    description: group.description,
    memberCount: group.memberCount,
    isOfficial: group.isOfficial,
    deletedAt: group.deletedAt,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

export function toMembership(membership: StoredMembership): GroupMembership {
  return {
    groupId: membership.groupId,
    userId: membership.userId,
    roleInGroup: membership.roleInGroup,
    joinedAt: membership.joinedAt,
    deletedAt: membership.deletedAt,
    updatedAt: membership.updatedAt,
  };
}

export function toMessage(message: StoredMessage): MessageItem {
  return {
    conversationId: message.conversationId,
    id: message.messageId,
    senderId: message.senderId,
    senderName: message.senderName,
    senderAvatarAsset: message.senderAvatarAsset,
    senderAvatarUrl: message.senderAvatarUrl,
    type: message.type,
    content: message.content,
    attachmentAsset: message.attachmentAsset,
    attachmentUrl: message.attachmentUrl,
    replyTo: message.replyTo,
    deletedAt: message.deletedAt,
    sentAt: message.sentAt,
    updatedAt: message.updatedAt,
  };
}

export function toConversationSummary(
  conversation: StoredConversation,
): ConversationSummary {
  return {
    conversationId: conversation.conversationId,
    groupName: conversation.groupName,
    lastMessagePreview: conversation.lastMessagePreview,
    lastSenderName: conversation.lastSenderName,
    unreadCount: conversation.unreadCount,
    isGroup: conversation.isGroup,
    isPinned: conversation.isPinned ?? false,
    archivedAt: conversation.archivedAt ?? null,
    mutedUntil: conversation.mutedUntil ?? null,
    deletedAt: conversation.deletedAt,
    updatedAt: conversation.updatedAt,
  };
}

export function toReport(report: StoredReport): ReportItem {
  return {
    id: report.reportId,
    userId: report.userId,
    groupId: report.groupId,
    title: report.title,
    description: report.description,
    category: report.category,
    locationCode: report.locationCode,
    status: report.status,
    priority: report.priority,
    mediaAssets: report.mediaAssets ?? [],
    mediaUrls: report.mediaUrls,
    assignedOfficerId: report.assignedOfficerId,
    deletedAt: report.deletedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

export function toAuditEvent(
  event: StoredConversationAuditEvent | StoredReportAuditEvent,
  scope: AuditEventItem['scope'],
): AuditEventItem {
  return {
    id: event.eventId,
    scope,
    action: event.action,
    actorUserId: event.actorUserId,
    occurredAt: event.occurredAt,
    summary: event.summary,
    metadata: event.metadata,
  };
}

export function toReportConversationLink(
  link: StoredReportConversationLink,
): ReportConversationLinkItem {
  return {
    reportId: link.reportId,
    groupId: link.groupId,
    conversationId: link.conversationId,
    linkedByUserId: link.linkedByUserId,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}
