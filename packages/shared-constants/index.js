const USER_ROLES = Object.freeze([
  "CITIZEN",
  "WARD_OFFICER",
  "PROVINCE_OFFICER",
  "ADMIN",
]);

const USER_STATUSES = Object.freeze([
  "PENDING_OTP",
  "ACTIVE",
  "DEACTIVATED",
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

const MESSAGE_DELIVERY_STATES = Object.freeze(["SENT", "DELIVERED", "READ"]);
const MESSAGE_RECALL_SCOPES = Object.freeze(["SELF", "EVERYONE"]);

const PUSH_DEVICE_PROVIDERS = Object.freeze(["FCM", "APNS", "WEB", "WEBHOOK"]);
const SESSION_SCOPES = Object.freeze([
  "MOBILE_APP",
  "WEB_DESKTOP",
  "WEB_MOBILE",
  "UNKNOWN",
]);
const OTP_PURPOSES = Object.freeze([
  "REGISTER",
  "LOGIN",
  "FORGOT_PASSWORD",
  "CHANGE_PASSWORD",
  "DEACTIVATE_ACCOUNT",
  "REACTIVATE_ACCOUNT",
  "DELETE_ACCOUNT",
  "UNLOCK_ACCOUNT",
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
  CONVERSATION_DELETE: "conversation.delete",
  MESSAGE_SEND: "message.send",
  MESSAGE_UPDATE: "message.update",
  MESSAGE_DELETE: "message.delete",
  MESSAGE_RECALL: "message.recall",
  MESSAGE_CREATED: "message.created",
  MESSAGE_UPDATED: "message.updated",
  MESSAGE_DELETED: "message.deleted",
  CONVERSATION_READ: "conversation.read",
  CONVERSATION_UPDATED: "conversation.updated",
  CONVERSATION_REMOVED: "conversation.removed",
  TYPING_START: "typing.start",
  TYPING_STOP: "typing.stop",
  TYPING_STATE: "typing.state",
  PRESENCE_SNAPSHOT: "presence.snapshot",
  PRESENCE_UPDATED: "presence.updated",
  CALL_INIT: "call.init",
  CALL_ACCEPT: "call.accept",
  CALL_REJECT: "call.reject",
  CALL_END: "call.end",
  WEBRTC_OFFER: "webrtc.offer",
  WEBRTC_ANSWER: "webrtc.answer",
  WEBRTC_ICE_CANDIDATE: "webrtc.ice-candidate",
});

const PHONE_PATTERN = /^0\d{9,10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const LOCATION_CODE_PATTERN = /^VN(?:-[A-Z0-9]+){1,3}$/;

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
  MESSAGE_DELIVERY_STATES,
  MESSAGE_RECALL_SCOPES,
  MESSAGE_TYPES,
  PUSH_DEVICE_PROVIDERS,
  PHONE_PATTERN,
  OTP_PURPOSES,
  REPORT_CATEGORIES,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
  SESSION_SCOPES,
  UPLOAD_TARGETS,
  USER_ROLES,
  USER_STATUSES,
};
