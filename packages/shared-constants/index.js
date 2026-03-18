const USER_ROLES = Object.freeze([
  "CITIZEN",
  "WARD_OFFICER",
  "PROVINCE_OFFICER",
  "ADMIN",
]);

const USER_STATUSES = Object.freeze([
  "PENDING_OTP",
  "ACTIVE",
  "LOCKED",
  "DELETED",
]);

const GROUP_TYPES = Object.freeze(["AREA", "TOPIC", "OFFICIAL", "PRIVATE"]);

const GROUP_MEMBER_ROLES = Object.freeze(["OWNER", "OFFICER", "MEMBER"]);

const MESSAGE_TYPES = Object.freeze([
  "TEXT",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "DOC",
  "EMOJI",
  "SYSTEM",
]);

const REPORT_CATEGORIES = Object.freeze([
  "INFRASTRUCTURE",
  "ENVIRONMENT",
  "SECURITY",
  "ADMIN",
]);

const REPORT_STATUSES = Object.freeze([
  "NEW",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
  "CLOSED",
]);

const REPORT_PRIORITIES = Object.freeze(["LOW", "MEDIUM", "HIGH", "URGENT"]);

const CONVERSATION_KINDS = Object.freeze(["DM", "GRP"]);
const UPLOAD_TARGETS = Object.freeze([
  "REPORT",
  "MESSAGE",
  "AVATAR",
  "GENERAL",
]);
const CHAT_SOCKET_NAMESPACE = "/chat";
const CHAT_SOCKET_EVENTS = Object.freeze({
  READY: "chat.ready",
  ERROR: "chat.error",
  CONVERSATION_JOIN: "conversation.join",
  CONVERSATION_LEAVE: "conversation.leave",
  MESSAGE_SEND: "message.send",
  MESSAGE_UPDATE: "message.update",
  MESSAGE_DELETE: "message.delete",
  MESSAGE_CREATED: "message.created",
  MESSAGE_UPDATED: "message.updated",
  MESSAGE_DELETED: "message.deleted",
  CONVERSATION_READ: "conversation.read",
  CONVERSATION_UPDATED: "conversation.updated",
  CONVERSATION_REMOVED: "conversation.removed",
  TYPING_START: "typing.start",
  TYPING_STOP: "typing.stop",
  TYPING_STATE: "typing.state",
});

const PHONE_PATTERN = /^0\d{9,10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const LOCATION_CODE_PATTERN = /^VN-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

module.exports = {
  CHAT_SOCKET_EVENTS,
  CHAT_SOCKET_NAMESPACE,
  CONVERSATION_KINDS,
  DEFAULT_PAGE_SIZE,
  EMAIL_PATTERN,
  GROUP_MEMBER_ROLES,
  GROUP_TYPES,
  LOCATION_CODE_PATTERN,
  MAX_PAGE_SIZE,
  MESSAGE_TYPES,
  PHONE_PATTERN,
  REPORT_CATEGORIES,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
  UPLOAD_TARGETS,
  USER_ROLES,
  USER_STATUSES,
};
