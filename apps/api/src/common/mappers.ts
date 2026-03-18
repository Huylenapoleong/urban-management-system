import type {
  AuthenticatedUser,
  ConversationSummary,
  GroupMembership,
  GroupMetadata,
  MessageItem,
  ReportItem,
  UserProfile,
} from '@urban/shared-types';
import type {
  StoredConversation,
  StoredGroup,
  StoredMembership,
  StoredMessage,
  StoredReport,
  StoredUser,
} from './storage-records';

export function toUserProfile(user: StoredUser): UserProfile {
  return {
    id: user.userId,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    locationCode: user.locationCode,
    unit: user.unit,
    avatarUrl: user.avatarUrl,
    status: user.status,
    deletedAt: user.deletedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
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
    avatarUrl: user.avatarUrl,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
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
    senderAvatarUrl: message.senderAvatarUrl,
    type: message.type,
    content: message.content,
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
    mediaUrls: report.mediaUrls,
    assignedOfficerId: report.assignedOfficerId,
    deletedAt: report.deletedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}
