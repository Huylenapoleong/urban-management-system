export const USER_ROLES: readonly [
  "CITIZEN",
  "WARD_OFFICER",
  "PROVINCE_OFFICER",
  "ADMIN",
];
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES: readonly [
  "PENDING_OTP",
  "ACTIVE",
  "LOCKED",
  "DELETED",
];
export type UserStatus = (typeof USER_STATUSES)[number];

export const GROUP_TYPES: readonly ["AREA", "TOPIC", "OFFICIAL", "PRIVATE"];
export type GroupType = (typeof GROUP_TYPES)[number];

export const GROUP_MEMBER_ROLES: readonly ["OWNER", "OFFICER", "MEMBER"];
export type GroupMemberRole = (typeof GROUP_MEMBER_ROLES)[number];

export const MESSAGE_TYPES: readonly [
  "TEXT",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "DOC",
  "EMOJI",
  "SYSTEM",
];
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const REPORT_CATEGORIES: readonly [
  "INFRASTRUCTURE",
  "ENVIRONMENT",
  "SECURITY",
  "ADMIN",
];
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_STATUSES: readonly [
  "NEW",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
  "CLOSED",
];
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_PRIORITIES: readonly ["LOW", "MEDIUM", "HIGH", "URGENT"];
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

export const CONVERSATION_KINDS: readonly ["DM", "GRP"];
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const UPLOAD_TARGETS: readonly [
  "REPORT",
  "MESSAGE",
  "AVATAR",
  "GENERAL",
];
export type UploadTarget = (typeof UPLOAD_TARGETS)[number];

export const CHAT_SOCKET_NAMESPACE: "/chat";
export const CHAT_SOCKET_EVENTS: {
  readonly READY: "chat.ready";
  readonly ERROR: "chat.error";
  readonly CONVERSATION_JOIN: "conversation.join";
  readonly CONVERSATION_LEAVE: "conversation.leave";
  readonly MESSAGE_SEND: "message.send";
  readonly MESSAGE_UPDATE: "message.update";
  readonly MESSAGE_DELETE: "message.delete";
  readonly MESSAGE_CREATED: "message.created";
  readonly MESSAGE_UPDATED: "message.updated";
  readonly MESSAGE_DELETED: "message.deleted";
  readonly CONVERSATION_READ: "conversation.read";
  readonly CONVERSATION_UPDATED: "conversation.updated";
  readonly CONVERSATION_REMOVED: "conversation.removed";
  readonly TYPING_START: "typing.start";
  readonly TYPING_STOP: "typing.stop";
  readonly TYPING_STATE: "typing.state";
};
export type ChatSocketEvent =
  (typeof CHAT_SOCKET_EVENTS)[keyof typeof CHAT_SOCKET_EVENTS];

export const PHONE_PATTERN: RegExp;
export const EMAIL_PATTERN: RegExp;
export const LOCATION_CODE_PATTERN: RegExp;
export const DEFAULT_PAGE_SIZE: number;
export const MAX_PAGE_SIZE: number;
