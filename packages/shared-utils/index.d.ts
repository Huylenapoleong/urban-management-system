import type {
  ConversationKind,
  GroupType,
  ReportCategory,
  ReportStatus,
} from "@urban/shared-constants";
import type { LocationSegments } from "@urban/shared-types";

export function createUlid(date?: Date): string;
export function nowIso(): string;
export function normalizePhone(value: string): string;
export function normalizeEmail(value: string): string;
export function parseLocationCode(locationCode: string): LocationSegments;
export function isSameProvince(left: string, right: string): boolean;
export function isSameWard(left: string, right: string): boolean;
export function makeUserPk(userId: string): string;
export function makeUserProfileSk(): string;
export function makeUserRefreshSessionSk(sessionId: string): string;
export function makeUserSessionSlotSk(sessionScope: string): string;
export function makeUserPushDeviceSk(deviceId: string): string;
export function makePushTokenLookupPk(pushToken: string): string;
export function makePushTokenLookupSk(): string;
export function makeAuthEmailOtpPk(email: string): string;
export function makeAuthEmailOtpSk(purpose: string): string;
export function makeAuthRegisterDraftPk(email: string): string;
export function makeAuthRegisterDraftSk(): string;
export function makePhoneLookupKey(phone: string): string;
export function makeEmailLookupKey(email: string): string;
export function makeGroupPk(groupId: string): string;
export function makeGroupMetadataSk(): string;
export function makeGroupTypeLocationKey(
  groupType: GroupType,
  locationCode: string,
): string;
export function makeMembershipSk(userId: string): string;
export function makeGroupBanSk(userId: string): string;
export function makeGroupInviteLinkSk(inviteId: string): string;
export function makeGroupInviteCodeLookupPk(code: string): string;
export function makeGroupInviteCodeLookupSk(): string;
export function makeUserGroupsKey(userId: string): string;
export function makeUserGroupsSk(groupId: string, joinedAt: string): string;
export function makeConversationPk(conversationId: string): string;
export function makeConversationAuditSk(
  createdAt: string,
  eventId: string,
): string;
export function makeGroupAuditSk(createdAt: string, eventId: string): string;
export function makeConversationReportLinkSk(reportId: string): string;
export function makeMessageSk(sentAt: string, messageId: string): string;
export function makeInboxPk(userId: string): string;
export function makeConversationSummarySk(
  conversationId: string,
  sentAt: string,
): string;
export function makeInboxStatsKey(
  userId: string,
  kind: ConversationKind,
): string;
export function makeReportPk(reportId: string): string;
export function makeReportMetadataSk(): string;
export function makeReportAuditSk(createdAt: string, eventId: string): string;
export function makeReportConversationLinkSk(groupId: string): string;
export function makeReportCategoryLocationKey(
  category: ReportCategory,
  locationCode: string,
): string;
export function makeReportStatusLocationKey(
  status: ReportStatus,
  locationCode: string,
): string;
export function makePushOutboxPk(shard: number): string;
export function makePushOutboxSk(createdAt: string, eventId: string): string;
export function makeDmConversationId(
  leftUserId: string,
  rightUserId: string,
): string;
export function isDmConversationId(conversationId: string): boolean;
export function isGroupConversationId(conversationId: string): boolean;
export function getConversationKind(conversationId: string): ConversationKind;
