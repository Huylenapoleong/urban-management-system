import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoClients } from './lib/dynamodb-client';
import type {
  StoredConversation,
  StoredUserFriendEdge,
  StoredUserFriendRequest,
  StoredGroup,
  StoredMembership,
  StoredMessage,
  StoredMessageRef,
  StoredReport,
  StoredUserIdentityClaim,
  StoredUser,
} from '../src/common/storage-records';
import {
  makeConversationPk,
  makeConversationSummarySk,
  makeDmConversationId,
  makeGroupMetadataSk,
  makeGroupPk,
  makeGroupTypeLocationKey,
  makeInboxPk,
  makeInboxStatsKey,
  makeMembershipSk,
  makeMessageSk,
  makeReportCategoryLocationKey,
  makeReportMetadataSk,
  makeReportPk,
  makeReportStatusLocationKey,
  makeUserGroupsKey,
  makeUserGroupsSk,
  makeUserPk,
  makeUserProfileSk,
} from '@urban/shared-utils';

const PASSWORD = 'Ums@2026Secure1';
const FIXTURE_IDS = {
  admin: '01JPCY0000ADMIN00000000000',
  provinceOfficer: '01JPCY0000PROVINCE00000000',
  wardOfficer: '01JPCY0000WARDOFFICER00000',
  citizenA: '01JPCY0000CITIZENA00000000',
  citizenB: '01JPCY0000CITIZENB00000000',
  citizenC: '01JPCY0000CITIZENC00000000',
  areaGroup: '01JPCY1000AREAGROUP0000000',
  officialGroup: '01JPCY1000OFFICIAL00000000',
  privateGroup: '01JPCY1000PRIVATE000000000',
  reportNew: '01JPCY2000REPORTNEW00000000',
  reportInProgress: '01JPCY2000REPORTWORK0000000',
  reportResolved: '01JPCY2000REPORTDONE0000000',
  groupMessage1: '01JPCY3000GROUPMSG00000001',
  groupMessage2: '01JPCY3000GROUPMSG00000002',
  groupMessage3: '01JPCY3000GROUPMSG00000003',
  dmMessage1: '01JPCY3000DIRECTMSG0000001',
  dmMessage2: '01JPCY3000DIRECTMSG0000002',
  friendDmMessage1: '01JPCY3000FRIENDDM0000001',
  friendDmMessage2: '01JPCY3000FRIENDDM0000002',
} as const;

const LOCATIONS = {
  ward1: 'VN-HCM-BQ1-P01',
  ward2: 'VN-HCM-BQ1-P02',
};

let bcryptModulePromise: Promise<typeof import('bcryptjs')> | undefined;

async function loadBcrypt(): Promise<typeof import('bcryptjs')> {
  bcryptModulePromise ??= import('bcryptjs');
  return bcryptModulePromise;
}

function makeUser(input: {
  id: string;
  phone: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'PROVINCE_OFFICER' | 'WARD_OFFICER' | 'CITIZEN';
  locationCode: string;
  unit?: string;
  avatarUrl?: string;
  createdAt: string;
  passwordHash: string;
}): StoredUser {
  return {
    PK: makeUserPk(input.id),
    SK: makeUserProfileSk(),
    entityType: 'USER_PROFILE',
    GSI1SK: 'USER',
    userId: input.id,
    phone: input.phone,
    email: input.email,
    passwordHash: input.passwordHash,
    fullName: input.fullName,
    role: input.role,
    locationCode: input.locationCode,
    unit: input.unit,
    avatarUrl: input.avatarUrl,
    status: 'ACTIVE',
    deletedAt: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function makeIdentityClaim(input: {
  userId: string;
  identityType: 'PHONE' | 'EMAIL';
  identityValue: string;
  createdAt: string;
}): StoredUserIdentityClaim {
  return {
    PK: `IDENTITY#${input.identityType}#${input.identityValue}`,
    SK: 'CLAIM',
    entityType: 'USER_IDENTITY_CLAIM',
    userId: input.userId,
    identityType: input.identityType,
    identityValue: input.identityValue,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function makeFriendEdge(input: {
  userId: string;
  friendUserId: string;
  createdAt: string;
}): StoredUserFriendEdge {
  return {
    PK: makeUserPk(input.userId),
    SK: `FRIEND#${input.friendUserId}`,
    entityType: 'USER_FRIEND_EDGE',
    userId: input.userId,
    friendUserId: input.friendUserId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function makeFriendRequest(input: {
  ownerUserId: string;
  requesterUserId: string;
  targetUserId: string;
  direction: 'INCOMING' | 'OUTGOING';
  createdAt: string;
}): StoredUserFriendRequest {
  const sk =
    input.direction === 'INCOMING'
      ? `FRIEND_REQUEST#FROM#${input.requesterUserId}`
      : `FRIEND_REQUEST#TO#${input.targetUserId}`;

  return {
    PK: makeUserPk(input.ownerUserId),
    SK: sk,
    entityType: 'USER_FRIEND_REQUEST',
    requesterUserId: input.requesterUserId,
    targetUserId: input.targetUserId,
    direction: input.direction,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function makeGroup(input: {
  id: string;
  groupName: string;
  groupType: 'AREA' | 'TOPIC' | 'OFFICIAL' | 'PRIVATE';
  messagePolicy?: 'ALL_MEMBERS' | 'OWNER_AND_DEPUTIES' | 'OWNER_ONLY';
  locationCode: string;
  createdBy: string;
  description?: string;
  memberCount: number;
  isOfficial: boolean;
  createdAt: string;
}): StoredGroup {
  return {
    PK: makeGroupPk(input.id),
    SK: makeGroupMetadataSk(),
    entityType: 'GROUP_METADATA',
    GSI1PK: makeGroupTypeLocationKey(input.groupType, input.locationCode),
    groupId: input.id,
    groupName: input.groupName,
    groupType: input.groupType,
    messagePolicy: input.messagePolicy ?? 'ALL_MEMBERS',
    locationCode: input.locationCode,
    createdBy: input.createdBy,
    description: input.description,
    memberCount: input.memberCount,
    isOfficial: input.isOfficial,
    deletedAt: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function makeMembership(input: {
  groupId: string;
  userId: string;
  roleInGroup: 'OWNER' | 'DEPUTY' | 'MEMBER';
  joinedAt: string;
}): StoredMembership {
  return {
    PK: makeGroupPk(input.groupId),
    SK: makeMembershipSk(input.userId),
    entityType: 'GROUP_MEMBERSHIP',
    GSI1PK: makeUserGroupsKey(input.userId),
    GSI1SK: makeUserGroupsSk(input.groupId, input.joinedAt),
    groupId: input.groupId,
    userId: input.userId,
    roleInGroup: input.roleInGroup,
    joinedAt: input.joinedAt,
    deletedAt: null,
    updatedAt: input.joinedAt,
  };
}

function makeReport(input: {
  id: string;
  userId: string;
  groupId?: string;
  title: string;
  description: string;
  category: 'INFRASTRUCTURE' | 'ENVIRONMENT' | 'SECURITY' | 'ADMIN';
  locationCode: string;
  status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  mediaUrls: string[];
  assignedOfficerId?: string;
  createdAt: string;
  updatedAt: string;
}): StoredReport {
  return {
    PK: makeReportPk(input.id),
    SK: makeReportMetadataSk(),
    entityType: 'REPORT',
    GSI1PK: makeReportCategoryLocationKey(input.category, input.locationCode),
    GSI2PK: makeReportStatusLocationKey(input.status, input.locationCode),
    reportId: input.id,
    userId: input.userId,
    groupId: input.groupId,
    title: input.title,
    description: input.description,
    category: input.category,
    locationCode: input.locationCode,
    status: input.status,
    priority: input.priority,
    mediaAssets: [],
    mediaUrls: input.mediaUrls,
    assignedOfficerId: input.assignedOfficerId,
    deletedAt: null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function makeMessage(input: {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOC' | 'EMOJI' | 'SYSTEM';
  content: string;
  attachmentUrl?: string;
  replyTo?: string;
  sentAt: string;
}): StoredMessage {
  return {
    PK: makeConversationPk(input.conversationId),
    SK: makeMessageSk(input.sentAt, input.id),
    entityType: 'MESSAGE',
    messageId: input.id,
    conversationId: input.conversationId,
    senderId: input.senderId,
    senderName: input.senderName,
    senderAvatarUrl: input.senderAvatarUrl,
    type: input.type,
    content: input.content,
    attachmentUrl: input.attachmentUrl,
    replyTo: input.replyTo,
    deletedAt: null,
    sentAt: input.sentAt,
    updatedAt: input.sentAt,
  };
}

function makeMessageRef(message: StoredMessage): StoredMessageRef {
  return {
    PK: message.PK,
    SK: `MSGREF#${message.messageId}`,
    entityType: 'MESSAGE_REF',
    conversationId: message.conversationId,
    messageId: message.messageId,
    messageSk: message.SK,
    senderId: message.senderId,
    sentAt: message.sentAt,
    updatedAt: message.updatedAt,
  };
}

function makeConversationSummary(input: {
  userId: string;
  conversationId: string;
  groupName: string;
  lastMessagePreview: string;
  lastSenderName: string;
  unreadCount: number;
  isGroup: boolean;
  updatedAt: string;
}): StoredConversation {
  const kind = input.isGroup ? 'GRP' : 'DM';

  return {
    PK: makeInboxPk(input.userId),
    SK: makeConversationSummarySk(input.conversationId, input.updatedAt),
    entityType: 'CONVERSATION',
    GSI1PK: makeInboxStatsKey(input.userId, kind),
    userId: input.userId,
    conversationId: input.conversationId,
    groupName: input.groupName,
    lastMessagePreview: input.lastMessagePreview,
    lastSenderName: input.lastSenderName,
    unreadCount: input.unreadCount,
    isGroup: input.isGroup,
    deletedAt: null,
    updatedAt: input.updatedAt,
  };
}

async function batchWriteAll<T extends object>(
  tableName: string,
  items: T[],
): Promise<void> {
  const { documentClient } = createDynamoClients();

  for (let index = 0; index < items.length; index += 25) {
    let unprocessed: Array<{ PutRequest: { Item: Record<string, unknown> } }> =
      items.slice(index, index + 25).map((item) => ({
        PutRequest: {
          Item: item as Record<string, unknown>,
        },
      }));

    do {
      const response = await documentClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: unprocessed,
          },
        }),
      );

      unprocessed = (response.UnprocessedItems?.[tableName] ?? []) as Array<{
        PutRequest: { Item: Record<string, unknown> };
      }>;
    } while (unprocessed.length > 0);
  }
}

async function main(): Promise<void> {
  const { config } = createDynamoClients();
  const bcrypt = await loadBcrypt();
  const passwordHash = await bcrypt.hash(PASSWORD, config.bcryptRounds);

  const users: StoredUser[] = [
    makeUser({
      id: FIXTURE_IDS.admin,
      phone: '0901000001',
      email: 'admin@smartcity.local',
      fullName: 'System Admin',
      role: 'ADMIN',
      locationCode: LOCATIONS.ward1,
      unit: 'Smart City Platform',
      createdAt: '2026-03-17T06:00:00.000Z',
      passwordHash,
    }),
    makeUser({
      id: FIXTURE_IDS.provinceOfficer,
      phone: '0901000002',
      email: 'province.officer@smartcity.local',
      fullName: 'Nguyen Thi Province',
      role: 'PROVINCE_OFFICER',
      locationCode: LOCATIONS.ward1,
      unit: 'So Xay dung TP.HCM',
      createdAt: '2026-03-17T06:05:00.000Z',
      passwordHash,
    }),
    makeUser({
      id: FIXTURE_IDS.wardOfficer,
      phone: '0901000003',
      email: 'ward.officer@smartcity.local',
      fullName: 'Tran Van Ward',
      role: 'WARD_OFFICER',
      locationCode: LOCATIONS.ward1,
      unit: 'UBND Phuong 1 Quan 1',
      createdAt: '2026-03-17T06:10:00.000Z',
      passwordHash,
    }),
    makeUser({
      id: FIXTURE_IDS.citizenA,
      phone: '0901000004',
      email: 'citizen.a@smartcity.local',
      fullName: 'Le Thi Citizen A',
      role: 'CITIZEN',
      locationCode: LOCATIONS.ward1,
      createdAt: '2026-03-17T06:15:00.000Z',
      passwordHash,
    }),
    makeUser({
      id: FIXTURE_IDS.citizenB,
      phone: '0901000005',
      email: 'citizen.b@smartcity.local',
      fullName: 'Pham Van Citizen B',
      role: 'CITIZEN',
      locationCode: LOCATIONS.ward1,
      createdAt: '2026-03-17T06:20:00.000Z',
      passwordHash,
    }),
    makeUser({
      id: FIXTURE_IDS.citizenC,
      phone: '0901000006',
      email: 'citizen.c@smartcity.local',
      fullName: 'Vo Thi Citizen C',
      role: 'CITIZEN',
      locationCode: LOCATIONS.ward2,
      createdAt: '2026-03-17T06:22:00.000Z',
      passwordHash,
    }),
  ];

  const identityClaims: StoredUserIdentityClaim[] = users.flatMap((user) => {
    const claims: StoredUserIdentityClaim[] = [];

    if (user.phone) {
      claims.push(
        makeIdentityClaim({
          userId: user.userId,
          identityType: 'PHONE',
          identityValue: user.phone,
          createdAt: user.createdAt,
        }),
      );
    }

    if (user.email) {
      claims.push(
        makeIdentityClaim({
          userId: user.userId,
          identityType: 'EMAIL',
          identityValue: user.email,
          createdAt: user.createdAt,
        }),
      );
    }

    return claims;
  });

  const friendEdges: StoredUserFriendEdge[] = [
    makeFriendEdge({
      userId: FIXTURE_IDS.citizenA,
      friendUserId: FIXTURE_IDS.citizenB,
      createdAt: '2026-03-17T07:30:00.000Z',
    }),
    makeFriendEdge({
      userId: FIXTURE_IDS.citizenB,
      friendUserId: FIXTURE_IDS.citizenA,
      createdAt: '2026-03-17T07:30:00.000Z',
    }),
  ];

  const friendRequests: StoredUserFriendRequest[] = [
    makeFriendRequest({
      ownerUserId: FIXTURE_IDS.citizenA,
      requesterUserId: FIXTURE_IDS.citizenC,
      targetUserId: FIXTURE_IDS.citizenA,
      direction: 'INCOMING',
      createdAt: '2026-03-17T07:35:00.000Z',
    }),
    makeFriendRequest({
      ownerUserId: FIXTURE_IDS.citizenC,
      requesterUserId: FIXTURE_IDS.citizenC,
      targetUserId: FIXTURE_IDS.citizenA,
      direction: 'OUTGOING',
      createdAt: '2026-03-17T07:35:00.000Z',
    }),
  ];

  const groups: StoredGroup[] = [
    makeGroup({
      id: FIXTURE_IDS.areaGroup,
      groupName: 'Phuong 1 Q1 - Ha tang',
      groupType: 'AREA',
      locationCode: LOCATIONS.ward1,
      createdBy: FIXTURE_IDS.wardOfficer,
      description: 'Nhom trao doi cac van de ha tang do thi tai Phuong 1.',
      memberCount: 3,
      isOfficial: true,
      createdAt: '2026-03-17T07:00:00.000Z',
    }),
    makeGroup({
      id: FIXTURE_IDS.officialGroup,
      groupName: 'To xu ly moi truong Quan 1',
      groupType: 'OFFICIAL',
      locationCode: LOCATIONS.ward1,
      createdBy: FIXTURE_IDS.provinceOfficer,
      description: 'Nhom dieu phoi can bo xu ly phan anh.',
      memberCount: 3,
      isOfficial: true,
      createdAt: '2026-03-17T07:05:00.000Z',
    }),
    makeGroup({
      id: FIXTURE_IDS.privateGroup,
      groupName: 'Dan pho Nguyen Hue',
      groupType: 'PRIVATE',
      locationCode: LOCATIONS.ward1,
      createdBy: FIXTURE_IDS.citizenA,
      description: 'Nhom nho cua cu dan khu pho.',
      memberCount: 2,
      isOfficial: false,
      createdAt: '2026-03-17T07:10:00.000Z',
    }),
  ];

  const memberships: StoredMembership[] = [
    makeMembership({
      groupId: FIXTURE_IDS.areaGroup,
      userId: FIXTURE_IDS.wardOfficer,
      roleInGroup: 'OWNER',
      joinedAt: '2026-03-17T07:00:00.000Z',
    }),
    makeMembership({
      groupId: FIXTURE_IDS.areaGroup,
      userId: FIXTURE_IDS.citizenA,
      roleInGroup: 'MEMBER',
      joinedAt: '2026-03-17T07:02:00.000Z',
    }),
    makeMembership({
      groupId: FIXTURE_IDS.areaGroup,
      userId: FIXTURE_IDS.citizenB,
      roleInGroup: 'MEMBER',
      joinedAt: '2026-03-17T07:03:00.000Z',
    }),
    makeMembership({
      groupId: FIXTURE_IDS.officialGroup,
      userId: FIXTURE_IDS.provinceOfficer,
      roleInGroup: 'OWNER',
      joinedAt: '2026-03-17T07:05:00.000Z',
    }),
    makeMembership({
      groupId: FIXTURE_IDS.officialGroup,
      userId: FIXTURE_IDS.wardOfficer,
      roleInGroup: 'DEPUTY',
      joinedAt: '2026-03-17T07:06:00.000Z',
    }),
    makeMembership({
      groupId: FIXTURE_IDS.officialGroup,
      userId: FIXTURE_IDS.admin,
      roleInGroup: 'DEPUTY',
      joinedAt: '2026-03-17T07:07:00.000Z',
    }),
    makeMembership({
      groupId: FIXTURE_IDS.privateGroup,
      userId: FIXTURE_IDS.citizenA,
      roleInGroup: 'OWNER',
      joinedAt: '2026-03-17T07:10:00.000Z',
    }),
    makeMembership({
      groupId: FIXTURE_IDS.privateGroup,
      userId: FIXTURE_IDS.citizenB,
      roleInGroup: 'MEMBER',
      joinedAt: '2026-03-17T07:12:00.000Z',
    }),
  ];

  const reports: StoredReport[] = [
    makeReport({
      id: FIXTURE_IDS.reportNew,
      userId: FIXTURE_IDS.citizenA,
      groupId: FIXTURE_IDS.areaGroup,
      title: 'O ga truoc so 123 Le Loi',
      description: 'Mat duong hu hong, anh huong xe may vao gio cao diem.',
      category: 'INFRASTRUCTURE',
      locationCode: LOCATIONS.ward1,
      status: 'NEW',
      priority: 'HIGH',
      mediaUrls: ['https://example.local/report-1.jpg'],
      createdAt: '2026-03-17T08:15:00.000Z',
      updatedAt: '2026-03-17T08:15:00.000Z',
    }),
    makeReport({
      id: FIXTURE_IDS.reportInProgress,
      userId: FIXTURE_IDS.citizenB,
      groupId: FIXTURE_IDS.areaGroup,
      title: 'Rac thai ton dong tai hem 12',
      description: 'Rac sinh hoat bi un lai tu toi hom qua.',
      category: 'ENVIRONMENT',
      locationCode: LOCATIONS.ward1,
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      mediaUrls: ['https://example.local/report-2.jpg'],
      assignedOfficerId: FIXTURE_IDS.wardOfficer,
      createdAt: '2026-03-17T08:20:00.000Z',
      updatedAt: '2026-03-17T08:40:00.000Z',
    }),
    makeReport({
      id: FIXTURE_IDS.reportResolved,
      userId: FIXTURE_IDS.citizenA,
      title: 'Den duong hong tren duong Nguyen Hue',
      description: 'Cot den truoc nha van hoa khong sang.',
      category: 'SECURITY',
      locationCode: LOCATIONS.ward1,
      status: 'RESOLVED',
      priority: 'HIGH',
      mediaUrls: ['https://example.local/report-3.jpg'],
      assignedOfficerId: FIXTURE_IDS.wardOfficer,
      createdAt: '2026-03-17T08:25:00.000Z',
      updatedAt: '2026-03-17T09:05:00.000Z',
    }),
  ];

  const areaConversationId = `GRP#${FIXTURE_IDS.areaGroup}`;
  const dmConversationId = makeDmConversationId(
    FIXTURE_IDS.citizenA,
    FIXTURE_IDS.wardOfficer,
  );
  const friendDmConversationId = makeDmConversationId(
    FIXTURE_IDS.citizenA,
    FIXTURE_IDS.citizenB,
  );
  const messages: StoredMessage[] = [
    makeMessage({
      id: FIXTURE_IDS.groupMessage1,
      conversationId: areaConversationId,
      senderId: FIXTURE_IDS.citizenA,
      senderName: 'Le Thi Citizen A',
      type: 'TEXT',
      content: JSON.stringify({
        text: 'O ga truoc so 123 Le Loi',
        mention: [],
      }),
      sentAt: '2026-03-17T08:00:00.000Z',
    }),
    makeMessage({
      id: FIXTURE_IDS.groupMessage2,
      conversationId: areaConversationId,
      senderId: FIXTURE_IDS.wardOfficer,
      senderName: 'Tran Van Ward',
      type: 'TEXT',
      content: JSON.stringify({
        text: 'Da tiep nhan, se cu can bo kiem tra.',
        mention: [],
      }),
      replyTo: FIXTURE_IDS.groupMessage1,
      sentAt: '2026-03-17T08:05:00.000Z',
    }),
    makeMessage({
      id: FIXTURE_IDS.groupMessage3,
      conversationId: areaConversationId,
      senderId: FIXTURE_IDS.citizenB,
      senderName: 'Pham Van Citizen B',
      type: 'TEXT',
      content: JSON.stringify({
        text: 'Toi xac nhan khu vuc nay nguy hiem vao ban dem.',
        mention: [],
      }),
      sentAt: '2026-03-17T08:10:00.000Z',
    }),
    makeMessage({
      id: FIXTURE_IDS.dmMessage1,
      conversationId: dmConversationId,
      senderId: FIXTURE_IDS.citizenA,
      senderName: 'Le Thi Citizen A',
      type: 'TEXT',
      content: JSON.stringify({
        text: 'Anh oi, bao cao 1 da duoc xem chua?',
        mention: [],
      }),
      sentAt: '2026-03-17T08:22:00.000Z',
    }),
    makeMessage({
      id: FIXTURE_IDS.dmMessage2,
      conversationId: dmConversationId,
      senderId: FIXTURE_IDS.wardOfficer,
      senderName: 'Tran Van Ward',
      type: 'TEXT',
      content: JSON.stringify({
        text: 'Da xem, dang cho doi thi cong den xu ly.',
        mention: [],
      }),
      replyTo: FIXTURE_IDS.dmMessage1,
      sentAt: '2026-03-17T08:25:00.000Z',
    }),
    makeMessage({
      id: FIXTURE_IDS.friendDmMessage1,
      conversationId: friendDmConversationId,
      senderId: FIXTURE_IDS.citizenA,
      senderName: 'Le Thi Citizen A',
      type: 'TEXT',
      content: JSON.stringify({
        text: 'Chao ban, minh vua gui loi moi ket ban.',
        mention: [],
      }),
      sentAt: '2026-03-17T08:26:00.000Z',
    }),
    makeMessage({
      id: FIXTURE_IDS.friendDmMessage2,
      conversationId: friendDmConversationId,
      senderId: FIXTURE_IDS.citizenB,
      senderName: 'Pham Van Citizen B',
      type: 'TEXT',
      content: JSON.stringify({
        text: 'Da nhan, minh thay thong bao su co ben phuong 1.',
        mention: [],
      }),
      replyTo: FIXTURE_IDS.friendDmMessage1,
      sentAt: '2026-03-17T08:28:00.000Z',
    }),
  ];

  const messageRefs: StoredMessageRef[] = messages.map((message) =>
    makeMessageRef(message),
  );

  const conversations: StoredConversation[] = [
    makeConversationSummary({
      userId: FIXTURE_IDS.wardOfficer,
      conversationId: areaConversationId,
      groupName: 'Phuong 1 Q1 - Ha tang',
      lastMessagePreview: 'Toi xac nhan khu vuc nay nguy hiem vao ban dem.',
      lastSenderName: 'Pham Van Citizen B',
      unreadCount: 1,
      isGroup: true,
      updatedAt: '2026-03-17T08:10:00.000Z',
    }),
    makeConversationSummary({
      userId: FIXTURE_IDS.citizenA,
      conversationId: areaConversationId,
      groupName: 'Phuong 1 Q1 - Ha tang',
      lastMessagePreview: 'Toi xac nhan khu vuc nay nguy hiem vao ban dem.',
      lastSenderName: 'Pham Van Citizen B',
      unreadCount: 1,
      isGroup: true,
      updatedAt: '2026-03-17T08:10:00.000Z',
    }),
    makeConversationSummary({
      userId: FIXTURE_IDS.citizenB,
      conversationId: areaConversationId,
      groupName: 'Phuong 1 Q1 - Ha tang',
      lastMessagePreview: 'Toi xac nhan khu vuc nay nguy hiem vao ban dem.',
      lastSenderName: 'Pham Van Citizen B',
      unreadCount: 0,
      isGroup: true,
      updatedAt: '2026-03-17T08:10:00.000Z',
    }),
    makeConversationSummary({
      userId: FIXTURE_IDS.citizenA,
      conversationId: dmConversationId,
      groupName: 'Tran Van Ward',
      lastMessagePreview: 'Da xem, dang cho doi thi cong den xu ly.',
      lastSenderName: 'Tran Van Ward',
      unreadCount: 1,
      isGroup: false,
      updatedAt: '2026-03-17T08:25:00.000Z',
    }),
    makeConversationSummary({
      userId: FIXTURE_IDS.wardOfficer,
      conversationId: dmConversationId,
      groupName: 'Le Thi Citizen A',
      lastMessagePreview: 'Da xem, dang cho doi thi cong den xu ly.',
      lastSenderName: 'Tran Van Ward',
      unreadCount: 0,
      isGroup: false,
      updatedAt: '2026-03-17T08:25:00.000Z',
    }),
    makeConversationSummary({
      userId: FIXTURE_IDS.citizenA,
      conversationId: friendDmConversationId,
      groupName: 'Pham Van Citizen B',
      lastMessagePreview: 'Da nhan, minh thay thong bao su co ben phuong 1.',
      lastSenderName: 'Pham Van Citizen B',
      unreadCount: 1,
      isGroup: false,
      updatedAt: '2026-03-17T08:28:00.000Z',
    }),
    makeConversationSummary({
      userId: FIXTURE_IDS.citizenB,
      conversationId: friendDmConversationId,
      groupName: 'Le Thi Citizen A',
      lastMessagePreview: 'Da nhan, minh thay thong bao su co ben phuong 1.',
      lastSenderName: 'Pham Van Citizen B',
      unreadCount: 0,
      isGroup: false,
      updatedAt: '2026-03-17T08:28:00.000Z',
    }),
  ];

  await batchWriteAll(config.dynamodbUsersTableName, [
    ...users,
    ...identityClaims,
    ...friendEdges,
    ...friendRequests,
  ]);
  await batchWriteAll(config.dynamodbGroupsTableName, groups);
  await batchWriteAll(config.dynamodbMembershipsTableName, memberships);
  await batchWriteAll(config.dynamodbReportsTableName, reports);
  await batchWriteAll(config.dynamodbMessagesTableName, [
    ...messages,
    ...messageRefs,
  ]);
  await batchWriteAll(config.dynamodbConversationsTableName, conversations);

  console.log('Seed complete:');
  console.log(
    `  Users: ${users.length} + claims ${identityClaims.length} + friends ${friendEdges.length} + requests ${friendRequests.length} -> ${config.dynamodbUsersTableName}`,
  );
  console.log(
    `  Groups: ${groups.length} -> ${config.dynamodbGroupsTableName}`,
  );
  console.log(
    `  Memberships: ${memberships.length} -> ${config.dynamodbMembershipsTableName}`,
  );
  console.log(
    `  Reports: ${reports.length} -> ${config.dynamodbReportsTableName}`,
  );
  console.log(
    `  Messages: ${messages.length} + refs ${messageRefs.length} -> ${config.dynamodbMessagesTableName}`,
  );
  console.log(
    `  Conversations: ${conversations.length} -> ${config.dynamodbConversationsTableName}`,
  );
  console.log('Seeded accounts:');
  console.log('  admin@smartcity.local / Ums@2026Secure1');
  console.log('  province.officer@smartcity.local / Ums@2026Secure1');
  console.log('  ward.officer@smartcity.local / Ums@2026Secure1');
  console.log('  citizen.a@smartcity.local / Ums@2026Secure1');
  console.log('  citizen.b@smartcity.local / Ums@2026Secure1');
  console.log('  citizen.c@smartcity.local / Ums@2026Secure1');
}

void main();
