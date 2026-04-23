
const { monotonicFactory } = require("ulid");

let createMonotonicUlid;

function getCreateMonotonicUlid() {
  if (createMonotonicUlid) {
    return createMonotonicUlid;
  }

  try {
    createMonotonicUlid = monotonicFactory();
  } catch {
    // Fallback for runtimes without secure PRNG (for example some RN builds).
    createMonotonicUlid = monotonicFactory(Math.random);
  }

  return createMonotonicUlid;
}

function createUlid(date = new Date()) {
  return getCreateMonotonicUlid()(date.getTime());
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePhone(value) {
  const compact = value.trim().replace(/[^\d+]/g, "");

  if (compact.startsWith("+84")) {
    return `0${compact.slice(3)}`;
  }

  if (compact.startsWith("84") && compact.length >= 11) {
    return `0${compact.slice(2)}`;
  }

  return compact;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function parseLocationCode(locationCode) {
  const [country, province, district, ward] = locationCode.split("-");

  return {
    country,
    district,
    province,
    ward,
  };
}

function isSameProvince(left, right) {
  return parseLocationCode(left).province === parseLocationCode(right).province;
}

function isSameWard(left, right) {
  return left === right;
}

function makeUserPk(userId) {
  return `USER#${userId}`;
}

function makeUserProfileSk() {
  return "PROFILE";
}

function makeUserRefreshSessionSk(sessionId) {
  return `SESSION#${sessionId}`;
}

function makeUserSessionSlotSk(sessionScope) {
  return `SESSION_SLOT#${sessionScope}`;
}

function makeUserPushDeviceSk(deviceId) {
  return `PUSH_DEVICE#${deviceId}`;
}

function makeUserContactAliasSk(targetUserId) {
  return `CONTACT_ALIAS#${targetUserId}`;
}



function makeAuthEmailOtpPk(email) {
  return `AUTH#EMAIL#${email}`;
}

function makeAuthEmailOtpSk(purpose) {
  return `OTP#${purpose}`;
}

function makeAuthRegisterDraftPk(email) {
  return `AUTH#REGISTER#${email}`;
}

function makeAuthRegisterDraftSk() {
  return "DRAFT";
}

function makePhoneLookupKey(phone) {
  return `PHONE#${phone}`;
}

function makeEmailLookupKey(email) {
  return `EMAIL#${email}`;
}

function makeGroupPk(groupId) {
  return `GROUP#${groupId}`;
}

function makeGroupMetadataSk() {
  return "METADATA";
}

function makeGroupTypeLocationKey(groupType, locationCode) {
  return `TYPE#${groupType}#LOC#${locationCode}`;
}

function makeMembershipSk(userId) {
  return `MEMBER#${userId}`;
}

function makeGroupBanSk(userId) {
  return `BAN#${userId}`;
}

function makeGroupInviteLinkSk(inviteId) {
  return `INVITE#${inviteId}`;
}

function makeGroupInviteCodeLookupPk(code) {
  return `GROUP_INVITE_CODE#${code}`;
}

function makeGroupInviteCodeLookupSk() {
  return "LOOKUP";
}

function makeUserGroupsKey(userId) {
  return `USER#${userId}`;
}

function makeUserGroupsSk(groupId, joinedAt) {
  return `GRP#${groupId}#${joinedAt}`;
}

function makeConversationPk(conversationId) {
  return `CONV#${conversationId}`;
}

function makeConversationAuditSk(createdAt, eventId) {
  return `AUDIT#${createdAt}#${eventId}`;
}

function makeGroupAuditSk(createdAt, eventId) {
  return `AUDIT#${createdAt}#${eventId}`;
}

function makeConversationReportLinkSk(reportId) {
  return `LINK#REPORT#${reportId}`;
}

function makeMessageSk(sentAt, messageId) {
  return `MSG#${sentAt}#${messageId}`;
}

function makeInboxPk(userId) {
  return `USER#${userId}`;
}

function makeConversationSummarySk(conversationId, sentAt) {
  return `CONV#${conversationId}#LAST#${sentAt}`;
}

function makeInboxStatsKey(userId, kind) {
  return `USER#${userId}#TYPE#${kind}`;
}

function makeReportPk(reportId) {
  return `REPORT#${reportId}`;
}

function makeReportMetadataSk() {
  return "METADATA";
}

function makeReportAuditSk(createdAt, eventId) {
  return `AUDIT#${createdAt}#${eventId}`;
}

function makeReportConversationLinkSk(groupId) {
  return `LINK#GRP#${groupId}`;
}

function makeReportCategoryLocationKey(category, locationCode) {
  return `CAT#${category}#LOC#${locationCode}`;
}

function makeReportStatusLocationKey(status, locationCode) {
  return `STATUS#${status}#LOC#${locationCode}`;
}

function makePushOutboxPk(shard) {
  return `OUTBOX#PUSH#${shard}`;
}

function makePushOutboxSk(createdAt, eventId) {
  return `EVENT#${createdAt}#${eventId}`;
}

function makeDmConversationId(leftUserId, rightUserId) {
  const [first, second] = [leftUserId, rightUserId].sort();
  return `DM#${first}#${second}`;
}

function isDmConversationId(conversationId) {
  return conversationId.startsWith("DM#");
}

function isGroupConversationId(conversationId) {
  return conversationId.startsWith("GRP#");
}

function getConversationKind(conversationId) {
  return isGroupConversationId(conversationId) ? "GRP" : "DM";
}

module.exports = {
  createUlid,
  getConversationKind,
  isDmConversationId,
  isGroupConversationId,
  isSameProvince,
  isSameWard,
  makeConversationAuditSk,
  makeConversationPk,
  makeGroupAuditSk,
  makeConversationReportLinkSk,
  makeConversationSummarySk,
  makeDmConversationId,
  makeEmailLookupKey,
  makeAuthEmailOtpPk,
  makeAuthEmailOtpSk,
  makeAuthRegisterDraftPk,
  makeAuthRegisterDraftSk,
  makeGroupMetadataSk,
  makeGroupBanSk,
  makeGroupInviteCodeLookupPk,
  makeGroupInviteCodeLookupSk,
  makeGroupInviteLinkSk,
  makeGroupPk,
  makeGroupTypeLocationKey,
  makeInboxPk,
  makeInboxStatsKey,
  makeMembershipSk,
  makeMessageSk,
  makePhoneLookupKey,

  makePushOutboxPk,
  makePushOutboxSk,
  makeReportAuditSk,
  makeReportCategoryLocationKey,
  makeReportConversationLinkSk,
  makeReportMetadataSk,
  makeReportPk,
  makeReportStatusLocationKey,
  makeUserGroupsKey,
  makeUserGroupsSk,
  makeUserPk,
  makeUserProfileSk,
  makeUserContactAliasSk,
  makeUserPushDeviceSk,
  makeUserRefreshSessionSk,
  makeUserSessionSlotSk,
  normalizeEmail,
  normalizePhone,
  nowIso,
  parseLocationCode,
};
