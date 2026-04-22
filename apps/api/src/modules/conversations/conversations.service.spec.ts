import { makeConversationPk, makeDmConversationId } from '@urban/shared-utils';
import type {
  StoredConversation,
  StoredMessage,
  StoredUser,
} from '../../common/storage-records';
import { ConversationStateService } from '../../common/services/conversation-state.service';
import { ConversationsService } from './conversations.service';
import { ConversationSummaryService } from './conversation-summary.service';

describe('ConversationsService', () => {
  const repository = {
    delete: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    queryByPk: jest.fn(),
    scanAll: jest.fn(),
    transactPut: jest.fn(),
  };
  const authorizationService = {
    canAccessDirectConversation: jest.fn(),
    canSendGroupMessage: jest.fn(),
    isAdmin: jest.fn(),
  };
  const usersService = {
    isInteractionBlocked: jest.fn(),
    canStartCitizenDm: jest.fn(),
    getActiveByIdOrThrow: jest.fn(),
    getByIdOrThrow: jest.fn(),
    resolveContactDisplayName: jest.fn(),
  };
  const groupsService = {
    getActiveBan: jest.fn(),
    getGroup: jest.fn(),
    getMembership: jest.fn(),
    listMembers: jest.fn(),
  };
  const chatRateLimitService = {
    consumeMessageSend: jest.fn(),
  };
  const chatRealtimeService = {
    emitToConversation: jest.fn(),
    emitToUser: jest.fn(),
    leaveConversationForUser: jest.fn(),
  };
  const conversationDispatchService = {
    emitConversationRead: jest.fn(),
    emitConversationRemoved: jest.fn(),
    emitConversationSummaryUpdated: jest.fn(),
    emitMessageCreated: jest.fn(),
    emitMessageDeleted: jest.fn(),
    emitMessageUpdated: jest.fn(),
  };
  const chatOutboxService = {
    buildChatOutboxEvent: jest.fn(),
    deleteChatOutboxEvent: jest.fn(),
    requestDrain: jest.fn(),
  };
  const auditTrailService = {
    buildConversationEvent: jest.fn(),
    listConversationEvents: jest.fn(),
  };
  const pushNotificationService = {
    buildPushOutboxEvent: jest.fn(),
  };
  const mediaAssetService = {
    createOwnedAssetReference: jest.fn(
      (input: {
        key: string;
        target: string;
        entityId?: string;
        ownerUserId: string;
      }) => ({
        key: input.key,
        target: input.target,
        entityId: input.entityId,
        uploadedBy: input.ownerUserId,
      }),
    ),
    resolveAssetWithLegacyUrl: jest.fn((asset: unknown, url: unknown) =>
      Promise.resolve({
        asset,
        url,
      }),
    ),
  };
  const s3StorageService = {
    copyObject: jest.fn(),
  };
  const config = {
    chatOutboxBatchSize: 10,
    chatOutboxPollIntervalMs: 1000,
    chatOutboxShardCount: 2,
    dynamodbConversationsTableName: 'Conversations',
    dynamodbMessagesTableName: 'Messages',
    dynamodbMembershipsTableName: 'Memberships',
    redisKeyPrefix: 'urban',
    s3BucketName: 'smartcity-assets',
    uploadKeyPrefix: 'uploads',
  };

  const actor = {
    id: 'user-1',
    role: 'CITIZEN' as const,
    locationCode: 'VN-79-760-26734',
    fullName: 'Citizen One',
    status: 'ACTIVE' as const,
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  };
  const adminActor = {
    ...actor,
    role: 'ADMIN' as const,
    fullName: 'Admin One',
  };
  const otherUser: StoredUser = {
    PK: 'USER#user-2',
    SK: 'PROFILE',
    entityType: 'USER_PROFILE',
    userId: 'user-2',
    email: 'officer@example.com',
    phone: undefined,
    passwordHash: 'secret',
    fullName: 'Officer Two',
    role: 'WARD_OFFICER',
    locationCode: 'VN-79-760-26734',
    unit: 'Ward Office',
    avatarUrl: undefined,
    status: 'ACTIVE',
    deletedAt: null,
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
    GSI1SK: 'USER',
  };
  const actorUser: StoredUser = {
    ...otherUser,
    PK: 'USER#user-1',
    userId: 'user-1',
    email: 'citizen@example.com',
    fullName: actor.fullName,
    role: actor.role,
    unit: undefined,
  };
  const sameScopeCitizen: StoredUser = {
    ...actorUser,
    PK: 'USER#user-3',
    userId: 'user-3',
    email: 'citizen.two@example.com',
    fullName: 'Citizen Three',
  };
  const conversationKey = makeDmConversationId(actor.id, otherUser.userId);
  const actorSummary: StoredConversation = {
    PK: 'USER#user-1',
    SK: `CONV#${conversationKey}#LAST#2026-03-18T10:05:00.000Z`,
    entityType: 'CONVERSATION',
    GSI1PK: 'USER#user-1#TYPE#DM',
    userId: actor.id,
    conversationId: conversationKey,
    groupName: otherUser.fullName,
    lastMessagePreview: 'Xin chao',
    lastSenderName: otherUser.fullName,
    unreadCount: 2,
    isGroup: false,
    deletedAt: null,
    updatedAt: '2026-03-18T10:05:00.000Z',
    lastReadAt: null,
  };
  const otherSummary: StoredConversation = {
    ...actorSummary,
    PK: 'USER#user-2',
    GSI1PK: 'USER#user-2#TYPE#DM',
    userId: otherUser.userId,
    unreadCount: 0,
    lastReadAt: '2026-03-18T10:05:00.000Z',
  };
  const latestMessage: StoredMessage = {
    PK: makeConversationPk(conversationKey),
    SK: 'MSG#2026-03-18T10:05:00.000Z#01MESSAGE0000000000000001',
    entityType: 'MESSAGE',
    messageId: '01MESSAGE0000000000000001',
    conversationId: conversationKey,
    senderId: otherUser.userId,
    senderName: otherUser.fullName,
    senderAvatarUrl: undefined,
    type: 'TEXT',
    content: '{"text":"Xin chao","mention":[]}',
    attachmentUrl: undefined,
    replyTo: undefined,
    deletedAt: null,
    sentAt: '2026-03-18T10:05:00.000Z',
    updatedAt: '2026-03-18T10:05:00.000Z',
  };

  const conversationStateService = new ConversationStateService();
  const conversationSummaryService = new ConversationSummaryService(
    repository as never,
    conversationStateService as never,
    usersService as never,
    config as never,
  );

  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService(
      repository as never,
      authorizationService as never,
      conversationStateService as never,
      conversationSummaryService as never,
      usersService as never,
      groupsService as never,
      chatRateLimitService as never,
      conversationDispatchService as never,
      chatOutboxService as never,
      chatRealtimeService as never,
      auditTrailService as never,
      pushNotificationService as never,
      mediaAssetService as never,
      s3StorageService as never,
      config as never,
    );
    authorizationService.canAccessDirectConversation.mockReturnValue(true);
    authorizationService.canSendGroupMessage.mockReturnValue(true);
    authorizationService.isAdmin.mockReturnValue(false);
    groupsService.getActiveBan.mockResolvedValue(undefined);
    usersService.getActiveByIdOrThrow.mockImplementation((userId: string) => {
      if (userId === otherUser.userId) {
        return otherUser;
      }

      if (userId === sameScopeCitizen.userId) {
        return sameScopeCitizen;
      }

      if (userId === actor.id) {
        return actorUser;
      }

      throw new Error(`Unexpected active user lookup: ${userId}`);
    });
    usersService.getByIdOrThrow.mockImplementation((userId: string) => {
      if (userId === actor.id) {
        return actorUser;
      }

      if (userId === otherUser.userId) {
        return otherUser;
      }

      if (userId === sameScopeCitizen.userId) {
        return sameScopeCitizen;
      }

      throw new Error(`Unexpected user lookup: ${userId}`);
    });
    usersService.canStartCitizenDm.mockResolvedValue(true);
    usersService.isInteractionBlocked.mockResolvedValue(false);
    usersService.resolveContactDisplayName.mockImplementation(
      (_ownerUserId: string, _targetUserId: string, fallbackFullName: string) =>
        fallbackFullName,
    );
    repository.delete.mockResolvedValue(undefined);
    repository.scanAll.mockResolvedValue([]);
    repository.put.mockResolvedValue(undefined);
    repository.transactPut.mockResolvedValue(undefined);
    chatOutboxService.buildChatOutboxEvent.mockImplementation(
      ({
        actorUserId,
        clientMessageId,
        conversationId,
        eventName,
        messageId,
        occurredAt,
      }) => ({
        PK: 'OUTBOX#CHAT#0',
        SK: 'EVENT#2026-03-18T10:05:00.000Z#01OUTBOX',
        entityType: 'CHAT_OUTBOX_EVENT',
        eventId: '01OUTBOX',
        eventName,
        conversationId,
        actorUserId,
        clientMessageId,
        messageId,
        createdAt: occurredAt ?? '2026-03-18T10:05:00.000Z',
      }),
    );
    chatOutboxService.deleteChatOutboxEvent.mockResolvedValue(undefined);
    chatOutboxService.requestDrain.mockImplementation(() => undefined);
    conversationDispatchService.emitConversationRead.mockResolvedValue(
      undefined,
    );
    auditTrailService.buildConversationEvent.mockReturnValue({
      PK: `CONV#${conversationKey}`,
      SK: 'AUDIT#2026-03-18T10:05:00.000Z#01AUDIT',
      entityType: 'CONVERSATION_AUDIT_EVENT',
      eventId: '01AUDIT',
      conversationId: conversationKey,
      action: 'MESSAGE_CREATED',
      actorUserId: actor.id,
      occurredAt: '2026-03-18T10:05:00.000Z',
      summary: 'audit',
    });
    auditTrailService.listConversationEvents.mockResolvedValue({
      success: true,
      data: [],
      meta: { count: 0 },
    });
    pushNotificationService.buildPushOutboxEvent.mockReturnValue(undefined);
    s3StorageService.copyObject.mockResolvedValue(undefined);
  });

  it('deletes only the actor inbox summary and leaves shared messages untouched', async () => {
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === actorSummary.PK &&
          options?.beginsWith === `CONV#${conversationKey}#LAST#`
        ) {
          return [actorSummary];
        }

        return [];
      },
    );

    const result = await service.deleteConversation(
      actor,
      `dm:${otherUser.userId}`,
    );

    expect(repository.delete).toHaveBeenCalledWith(
      'Conversations',
      actorSummary.PK,
      actorSummary.SK,
    );
    expect(repository.delete).not.toHaveBeenCalledWith(
      'Messages',
      expect.anything(),
      expect.anything(),
    );
    expect(chatRealtimeService.leaveConversationForUser).toHaveBeenCalledWith(
      actor.id,
      conversationKey,
    );
    expect(
      conversationDispatchService.emitConversationRemoved,
    ).toHaveBeenCalledWith(
      expect.any(String),
      actor.id,
      conversationKey,
      expect.any(String),
      'conversation.deleted',
    );
    expect(result).toEqual(
      expect.objectContaining({
        conversationId: `dm:${otherUser.userId}`,
        removedAt: expect.any(String),
      }),
    );
  });

  it('recreates a missing inbox summary when marking a deleted conversation as read', async () => {
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === actorSummary.PK &&
          options?.beginsWith === `CONV#${conversationKey}#LAST#`
        ) {
          return [];
        }

        if (
          tableName === 'Conversations' &&
          pk === otherSummary.PK &&
          options?.beginsWith === `CONV#${conversationKey}#LAST#`
        ) {
          return [otherSummary];
        }

        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          options?.beginsWith === 'MSG#'
        ) {
          return [latestMessage];
        }

        return [];
      },
    );

    const result = await service.markAsRead(actor, `dm:${otherUser.userId}`);

    expect(repository.transactPut).toHaveBeenCalledWith([
      expect.objectContaining({
        tableName: 'Conversations',
        item: expect.objectContaining({
          PK: actorSummary.PK,
          conversationId: conversationKey,
          unreadCount: 0,
          lastReadAt: latestMessage.sentAt,
          groupName: otherUser.fullName,
        }),
      }),
      expect.objectContaining({
        tableName: 'Conversations',
        item: expect.objectContaining({
          entityType: 'CHAT_OUTBOX_EVENT',
          conversationId: conversationKey,
          eventName: 'conversation.read',
        }),
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        conversationId: `dm:${otherUser.userId}`,
        unreadCount: 0,
        groupName: otherUser.fullName,
      }),
    );
  });
  it('deletes a stale group inbox summary without requiring current group access', async () => {
    const groupConversationKey = 'GRP#group-1';
    const groupSummary: StoredConversation = {
      ...actorSummary,
      SK: `CONV#${groupConversationKey}#LAST#2026-03-18T10:07:00.000Z`,
      GSI1PK: 'USER#user-1#TYPE#GRP',
      conversationId: groupConversationKey,
      groupName: 'Area Group 1',
      isGroup: true,
    };

    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === groupSummary.PK &&
          options?.beginsWith === `CONV#${groupConversationKey}#LAST#`
        ) {
          return [groupSummary];
        }

        return [];
      },
    );

    const result = await service.deleteConversation(actor, 'group:group-1');

    expect(groupsService.getGroup).not.toHaveBeenCalled();
    expect(repository.delete).toHaveBeenCalledWith(
      'Conversations',
      groupSummary.PK,
      groupSummary.SK,
    );
    expect(chatRealtimeService.leaveConversationForUser).toHaveBeenCalledWith(
      actor.id,
      groupConversationKey,
    );
    expect(result).toEqual(
      expect.objectContaining({
        conversationId: 'group:group-1',
        removedAt: expect.any(String),
      }),
    );
  });

  it('blocks public-group audit access for users who are not active members', async () => {
    groupsService.getGroup.mockResolvedValue({
      groupId: 'group-1',
      groupType: 'AREA',
      locationCode: actor.locationCode,
      deletedAt: null,
    });
    groupsService.getMembership.mockResolvedValue({
      groupId: 'group-1',
      userId: actor.id,
      deletedAt: '2026-03-18T10:08:00.000Z',
    });
    groupsService.listMembers.mockResolvedValue([
      { userId: actor.id },
      { userId: otherUser.userId },
    ]);

    await expect(
      service.listAuditEvents(actor, 'group:group-1', {}),
    ).rejects.toThrow(
      'Only active members can access this group conversation.',
    );
  });

  it('blocks public-group message history for users who are not active members', async () => {
    groupsService.getGroup.mockResolvedValue({
      groupId: 'group-1',
      groupType: 'AREA',
      messagePolicy: 'ALL_MEMBERS',
      locationCode: actor.locationCode,
      deletedAt: null,
    });
    groupsService.getMembership.mockResolvedValue({
      groupId: 'group-1',
      userId: actor.id,
      deletedAt: '2026-03-18T10:08:00.000Z',
    });

    await expect(
      service.listMessages(actor, 'group:group-1', {}),
    ).rejects.toThrow(
      'Only active members can access this group conversation.',
    );
  });

  it('blocks banned users from accessing a public group conversation even if they are in scope', async () => {
    groupsService.getGroup.mockResolvedValue({
      id: 'group-1',
      groupId: 'group-1',
      groupType: 'AREA',
      messagePolicy: 'ALL_MEMBERS',
      locationCode: actor.locationCode,
      createdBy: actor.id,
      memberCount: 2,
      isOfficial: false,
      deletedAt: null,
      createdAt: '2026-03-18T10:00:00.000Z',
      updatedAt: '2026-03-18T10:00:00.000Z',
    });
    groupsService.getActiveBan.mockResolvedValue({
      groupId: 'group-1',
      userId: actor.id,
      expiresAt: null,
    });
    groupsService.getMembership.mockResolvedValue({
      groupId: 'group-1',
      userId: actor.id,
      deletedAt: '2026-03-18T10:08:00.000Z',
    });

    await expect(
      service.listMessages(actor, 'group:group-1', {}),
    ).rejects.toThrow('You are banned from this group.');
  });

  it('blocks member message sends when the group policy only allows owners and deputies', async () => {
    authorizationService.canSendGroupMessage.mockReturnValue(false);
    groupsService.getGroup.mockResolvedValue({
      id: 'group-1',
      groupId: 'group-1',
      groupType: 'AREA',
      messagePolicy: 'OWNER_AND_DEPUTIES',
      locationCode: actor.locationCode,
      createdBy: actor.id,
      memberCount: 2,
      isOfficial: false,
      deletedAt: null,
      createdAt: '2026-03-18T10:00:00.000Z',
      updatedAt: '2026-03-18T10:00:00.000Z',
    });
    groupsService.getMembership.mockResolvedValue({
      groupId: 'group-1',
      userId: actor.id,
      roleInGroup: 'MEMBER',
      deletedAt: null,
    });

    await expect(
      service.sendMessage(actor, 'group:group-1', {
        content: '{"text":"Khong duoc gui.","mention":[]}',
        type: 'TEXT',
      }),
    ).rejects.toThrow(
      'Only owners and deputies can send messages to this group.',
    );
    expect(authorizationService.canSendGroupMessage).toHaveBeenCalledWith(
      actor,
      'MEMBER',
      'OWNER_AND_DEPUTIES',
    );
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('allows deputies to send messages when the group policy is OWNER_AND_DEPUTIES', async () => {
    authorizationService.canSendGroupMessage.mockReturnValue(true);
    groupsService.getGroup.mockResolvedValue({
      id: 'group-1',
      groupId: 'group-1',
      groupType: 'AREA',
      messagePolicy: 'OWNER_AND_DEPUTIES',
      locationCode: actor.locationCode,
      createdBy: actor.id,
      memberCount: 2,
      isOfficial: false,
      deletedAt: null,
      createdAt: '2026-03-18T10:00:00.000Z',
      updatedAt: '2026-03-18T10:00:00.000Z',
    });
    groupsService.getMembership.mockResolvedValue({
      groupId: 'group-1',
      userId: actor.id,
      roleInGroup: 'DEPUTY',
      deletedAt: null,
    });
    groupsService.listMembers.mockResolvedValue([
      { userId: actor.id },
      { userId: otherUser.userId },
    ]);

    const result = await service.sendMessage(actor, 'group:group-1', {
      content: '{"text":"Deputy van gui duoc.","mention":[]}',
      type: 'TEXT',
    });

    expect(result).toEqual(
      expect.objectContaining({
        conversationId: 'group:group-1',
        senderId: actor.id,
        type: 'TEXT',
      }),
    );
    expect(repository.transactPut).toHaveBeenCalled();
  });

  it('filters and paginates inbox conversations by keyword and unread state', async () => {
    const matchingGroupSummary: StoredConversation = {
      ...actorSummary,
      SK: 'CONV#GRP#group-1#LAST#2026-03-18T10:07:00.000Z',
      GSI1PK: 'USER#user-1#TYPE#GRP',
      conversationId: 'GRP#group-1',
      groupName: 'Ward Group 1',
      lastMessagePreview: 'Can bo da tiep nhan.',
      lastSenderName: 'Ward Officer',
      unreadCount: 3,
      isGroup: true,
      updatedAt: '2026-03-18T10:07:00.000Z',
    };
    const olderMatchingGroupSummary: StoredConversation = {
      ...matchingGroupSummary,
      SK: 'CONV#GRP#group-2#LAST#2026-03-18T09:07:00.000Z',
      conversationId: 'GRP#group-2',
      groupName: 'Ward Group 2',
      updatedAt: '2026-03-18T09:07:00.000Z',
    };

    repository.queryByPk.mockResolvedValue([
      matchingGroupSummary,
      olderMatchingGroupSummary,
      actorSummary,
    ]);

    const result = await service.listConversations(actor, {
      q: 'ward',
      isGroup: 'true',
      unreadOnly: 'true',
      limit: '1',
    });

    expect(result).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          conversationId: 'group:group-1',
          groupName: 'Ward Group 1',
        }),
      ],
      meta: {
        count: 1,
        nextCursor: expect.any(String),
      },
    });
  });

  it('blocks editing a public-group message after the actor left the group', async () => {
    groupsService.getGroup.mockResolvedValue({
      groupId: 'group-1',
    });
    groupsService.getMembership.mockResolvedValue({
      groupId: 'group-1',
      userId: actor.id,
      deletedAt: '2026-03-18T10:06:00.000Z',
    });
    groupsService.listMembers.mockResolvedValue([
      {
        userId: otherUser.userId,
      },
    ]);

    await expect(
      service.updateMessage(
        actor,
        'group:group-1',
        '01MESSAGE0000000000000001',
        {
          content: '{"text":"Noi dung moi","mention":[]}',
        },
      ),
    ).rejects.toThrow(
      'Only active members can access this group conversation.',
    );
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('blocks permanent delete for non-admin users', async () => {
    groupsService.getGroup.mockResolvedValue({
      groupId: 'group-1',
    });
    groupsService.getMembership.mockResolvedValue({
      groupId: 'group-1',
      userId: actor.id,
      deletedAt: '2026-03-18T10:06:00.000Z',
    });
    groupsService.listMembers.mockResolvedValue([
      {
        userId: otherUser.userId,
      },
    ]);

    await expect(
      service.deleteMessage(
        actor,
        'group:group-1',
        '01MESSAGE0000000000000001',
      ),
    ).rejects.toThrow('Only administrators can permanently delete messages.');
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('filters and paginates messages within a conversation', async () => {
    const matchingMessage: StoredMessage = {
      ...latestMessage,
      SK: 'MSG#2026-03-18T10:04:00.000Z#01MESSAGE0000000000000002',
      messageId: '01MESSAGE0000000000000002',
      content: '{"text":"Den duong hong tren Le Loi","mention":[]}',
      sentAt: '2026-03-18T10:04:00.000Z',
      updatedAt: '2026-03-18T10:04:00.000Z',
    };
    const olderMatchingMessage: StoredMessage = {
      ...latestMessage,
      SK: 'MSG#2026-03-18T10:03:00.000Z#01MESSAGE0000000000000003',
      messageId: '01MESSAGE0000000000000003',
      content: '{"text":"Le Loi van dang toi","mention":[]}',
      sentAt: '2026-03-18T10:03:00.000Z',
      updatedAt: '2026-03-18T10:03:00.000Z',
    };
    const ignoredImageMessage: StoredMessage = {
      ...latestMessage,
      SK: 'MSG#2026-03-18T10:02:00.000Z#01MESSAGE0000000000000004',
      messageId: '01MESSAGE0000000000000004',
      senderId: actor.id,
      senderName: actor.fullName,
      type: 'IMAGE',
      content: '',
      attachmentUrl: 'https://cdn.example.com/file.jpg',
      sentAt: '2026-03-18T10:02:00.000Z',
      updatedAt: '2026-03-18T10:02:00.000Z',
    };

    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          options?.beginsWith === 'MSG#'
        ) {
          return [matchingMessage, olderMatchingMessage, ignoredImageMessage];
        }

        return [];
      },
    );

    const result = await service.listMessages(actor, `dm:${otherUser.userId}`, {
      q: 'le loi',
      type: 'TEXT',
      fromUserId: otherUser.userId,
      before: '2026-03-18T10:05:00.000Z',
      limit: '1',
    });

    expect(result).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          id: '01MESSAGE0000000000000002',
          conversationId: `dm:${otherUser.userId}`,
        }),
      ],
      meta: {
        count: 1,
        nextCursor: expect.any(String),
      },
    });
  });

  it('hides messages recalled with SELF for the current actor', async () => {
    const hiddenForActorMessage: StoredMessage = {
      ...latestMessage,
      SK: 'MSG#2026-03-18T10:04:00.000Z#01MESSAGE0000000000000002',
      messageId: '01MESSAGE0000000000000002',
      deletedForUserAt: {
        [actor.id]: '2026-03-18T10:10:00.000Z',
      },
    };

    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          options?.beginsWith === 'MSG#'
        ) {
          return [hiddenForActorMessage, latestMessage];
        }

        return [];
      },
    );

    const result = await service.listMessages(actor, `dm:${otherUser.userId}`, {});

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: latestMessage.messageId,
      }),
    );
  });

  it('rejects direct messages when policy denies access to the target user', async () => {
    authorizationService.canAccessDirectConversation.mockReturnValueOnce(false);

    await expect(
      service.sendDirectMessage(actor, {
        targetUserId: otherUser.userId,
        content: '{"text":"Xin chao","mention":[]}',
        type: 'TEXT',
      }),
    ).rejects.toThrow('You cannot access this conversation.');
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('rejects citizen direct messages when friend gate denies send access', async () => {
    usersService.canStartCitizenDm.mockResolvedValueOnce(false);

    await expect(
      service.sendDirectMessage(actor, {
        targetUserId: sameScopeCitizen.userId,
        content: '{"text":"Xin chao","mention":[]}',
        type: 'TEXT',
      }),
    ).rejects.toThrow(
      'Citizens can only send direct messages to friends or accepted direct message requests.',
    );
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('creates a pending direct message request for a same-scope stranger citizen', async () => {
    usersService.canStartCitizenDm.mockResolvedValueOnce(false);

    const result = await service.createDirectMessageRequest(actor, {
      targetUserId: sameScopeCitizen.userId,
      content: '{"text":"Xin chao, cho toi trao doi nhe.","mention":[]}',
      clientMessageId: 'client-request-1',
    });

    expect(repository.transactPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Messages',
          item: expect.objectContaining({
            entityType: 'MESSAGE',
            conversationId: makeDmConversationId(
              actor.id,
              sameScopeCitizen.userId,
            ),
            senderId: actor.id,
          }),
        }),
        expect.objectContaining({
          tableName: 'Conversations',
          item: expect.objectContaining({
            entityType: 'DIRECT_MESSAGE_REQUEST',
            conversationId: makeDmConversationId(
              actor.id,
              sameScopeCitizen.userId,
            ),
            requesterUserId: actor.id,
            targetUserId: sameScopeCitizen.userId,
            status: 'PENDING',
          }),
        }),
      ]),
    );
    expect(result).toEqual(
      expect.objectContaining({
        conversationId: `dm:${sameScopeCitizen.userId}`,
        requestStatus: 'PENDING',
        requestDirection: 'OUTGOING',
      }),
    );
  });

  it('allows sending direct messages after a same-scope stranger request is accepted', async () => {
    usersService.canStartCitizenDm.mockResolvedValueOnce(false);
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Conversations' &&
          pk ===
            `DMREQ#${makeDmConversationId(actor.id, sameScopeCitizen.userId)}` &&
          sk === 'STATE'
        ) {
          return {
            PK: pk,
            SK: sk,
            entityType: 'DIRECT_MESSAGE_REQUEST',
            conversationId: makeDmConversationId(
              actor.id,
              sameScopeCitizen.userId,
            ),
            requesterUserId: actor.id,
            targetUserId: sameScopeCitizen.userId,
            status: 'ACCEPTED',
            createdAt: '2026-03-18T10:06:00.000Z',
            updatedAt: '2026-03-18T10:07:00.000Z',
            respondedAt: '2026-03-18T10:07:00.000Z',
            respondedByUserId: sameScopeCitizen.userId,
          };
        }

        return undefined;
      },
    );

    const result = await service.sendDirectMessage(actor, {
      targetUserId: sameScopeCitizen.userId,
      content: '{"text":"Cam on da chap nhan.","mention":[]}',
      type: 'TEXT',
    });

    expect(result).toEqual(
      expect.objectContaining({
        conversationId: `dm:${sameScopeCitizen.userId}`,
        senderId: actor.id,
        type: 'TEXT',
      }),
    );
    expect(repository.transactPut).toHaveBeenCalled();
  });

  it('allows direct messages to an accepted friend even when scope access is denied', async () => {
    const remoteFriend: StoredUser = {
      ...sameScopeCitizen,
      userId: 'user-4',
      PK: 'USER#user-4',
      email: 'citizen.remote@example.com',
      fullName: 'Citizen Remote',
      locationCode: 'VN-01-001-00001',
    };

    usersService.getActiveByIdOrThrow.mockImplementation((userId: string) => {
      if (userId === remoteFriend.userId) {
        return remoteFriend;
      }

      if (userId === otherUser.userId) {
        return otherUser;
      }

      if (userId === sameScopeCitizen.userId) {
        return sameScopeCitizen;
      }

      if (userId === actor.id) {
        return actorUser;
      }

      throw new Error(`Unexpected active user lookup: ${userId}`);
    });
    usersService.getByIdOrThrow.mockImplementation((userId: string) => {
      if (userId === actor.id) {
        return actorUser;
      }

      if (userId === otherUser.userId) {
        return otherUser;
      }

      if (userId === sameScopeCitizen.userId) {
        return sameScopeCitizen;
      }

      if (userId === remoteFriend.userId) {
        return remoteFriend;
      }

      throw new Error(`Unexpected user lookup: ${userId}`);
    });
    authorizationService.canAccessDirectConversation.mockReturnValue(false);
    usersService.canStartCitizenDm.mockResolvedValueOnce(true);

    const result = await service.sendDirectMessage(actor, {
      targetUserId: remoteFriend.userId,
      content: '{"text":"Ban o xa van chat duoc.","mention":[]}',
      type: 'TEXT',
    });

    expect(result).toEqual(
      expect.objectContaining({
        conversationId: `dm:${remoteFriend.userId}`,
        senderId: actor.id,
        type: 'TEXT',
      }),
    );
    expect(repository.transactPut).toHaveBeenCalled();
  });

  it('allows sending to an existing friend DM conversation even when scope access is denied', async () => {
    const remoteFriend: StoredUser = {
      ...sameScopeCitizen,
      userId: 'user-4',
      PK: 'USER#user-4',
      email: 'citizen.remote@example.com',
      fullName: 'Citizen Remote',
      locationCode: 'VN-01-001-00001',
    };

    usersService.getActiveByIdOrThrow.mockImplementation((userId: string) => {
      if (userId === remoteFriend.userId) {
        return remoteFriend;
      }

      if (userId === otherUser.userId) {
        return otherUser;
      }

      if (userId === sameScopeCitizen.userId) {
        return sameScopeCitizen;
      }

      if (userId === actor.id) {
        return actorUser;
      }

      throw new Error(`Unexpected active user lookup: ${userId}`);
    });
    usersService.getByIdOrThrow.mockImplementation((userId: string) => {
      if (userId === actor.id) {
        return actorUser;
      }

      if (userId === otherUser.userId) {
        return otherUser;
      }

      if (userId === sameScopeCitizen.userId) {
        return sameScopeCitizen;
      }

      if (userId === remoteFriend.userId) {
        return remoteFriend;
      }

      throw new Error(`Unexpected user lookup: ${userId}`);
    });
    authorizationService.canAccessDirectConversation.mockReturnValue(false);
    usersService.canStartCitizenDm.mockResolvedValue(true);

    const result = await service.sendMessage(
      actor,
      `dm:${remoteFriend.userId}`,
      {
        content: '{"text":"Van gui qua route conversation duoc.","mention":[]}',
        type: 'TEXT',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        conversationId: `dm:${remoteFriend.userId}`,
        senderId: actor.id,
        type: 'TEXT',
      }),
    );
    expect(repository.transactPut).toHaveBeenCalled();
  });

  it('allows continuing an existing DM after unfriend when the inbox summary still exists', async () => {
    const remoteCitizen: StoredUser = {
      ...sameScopeCitizen,
      userId: 'user-9',
      PK: 'USER#user-9',
      email: 'citizen.remote@example.com',
      fullName: 'Citizen Remote',
      locationCode: 'VN-01-001-00001',
    };
    const remoteConversationKey = makeDmConversationId(
      actor.id,
      remoteCitizen.userId,
    );
    const remoteSummary: StoredConversation = {
      ...actorSummary,
      SK: `CONV#${remoteConversationKey}#LAST#2026-03-18T10:05:00.000Z`,
      conversationId: remoteConversationKey,
      groupName: remoteCitizen.fullName,
    };

    usersService.getActiveByIdOrThrow.mockImplementation((userId: string) => {
      if (userId === remoteCitizen.userId) {
        return remoteCitizen;
      }

      if (userId === otherUser.userId) {
        return otherUser;
      }

      if (userId === sameScopeCitizen.userId) {
        return sameScopeCitizen;
      }

      if (userId === actor.id) {
        return actorUser;
      }

      throw new Error(`Unexpected active user lookup: ${userId}`);
    });
    usersService.getByIdOrThrow.mockImplementation((userId: string) => {
      if (userId === actor.id) {
        return actorUser;
      }

      if (userId === otherUser.userId) {
        return otherUser;
      }

      if (userId === sameScopeCitizen.userId) {
        return sameScopeCitizen;
      }

      if (userId === remoteCitizen.userId) {
        return remoteCitizen;
      }

      throw new Error(`Unexpected user lookup: ${userId}`);
    });
    authorizationService.canAccessDirectConversation.mockReturnValue(false);
    usersService.canStartCitizenDm.mockResolvedValue(false);
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === actorSummary.PK &&
          options?.beginsWith === `CONV#${remoteConversationKey}#LAST#`
        ) {
          return [remoteSummary];
        }

        return [];
      },
    );

    const result = await service.sendMessage(
      actor,
      `dm:${remoteCitizen.userId}`,
      {
        content: '{"text":"Van tiep tuc inbox cu.","mention":[]}',
        type: 'TEXT',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        conversationId: `dm:${remoteCitizen.userId}`,
        senderId: actor.id,
        type: 'TEXT',
      }),
    );
    expect(repository.transactPut).toHaveBeenCalled();
  });

  it('requests an eager outbox drain when direct dispatch fails after persisting a new message', async () => {
    conversationDispatchService.emitMessageCreated.mockRejectedValueOnce(
      new Error('socket dispatch failed'),
    );

    const result = await service.sendMessage(actor, `dm:${otherUser.userId}`, {
      content: '{"text":"Fallback qua outbox ngay.","mention":[]}',
      type: 'TEXT',
    });

    expect(result).toEqual(
      expect.objectContaining({
        conversationId: `dm:${otherUser.userId}`,
        senderId: actor.id,
        type: 'TEXT',
      }),
    );
    expect(chatOutboxService.requestDrain).toHaveBeenCalledWith(
      'message.created',
    );
  });

  it('blocks direct messages when the user pair is blocked', async () => {
    usersService.isInteractionBlocked.mockResolvedValueOnce(true);

    await expect(
      service.sendDirectMessage(actor, {
        targetUserId: sameScopeCitizen.userId,
        content: '{"text":"Khong gui duoc nua.","mention":[]}',
        type: 'TEXT',
      }),
    ).rejects.toThrow('Direct messaging is blocked between these users.');
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('blocks direct message requests when the user pair is blocked', async () => {
    usersService.isInteractionBlocked.mockResolvedValueOnce(true);
    usersService.canStartCitizenDm.mockResolvedValueOnce(false);

    await expect(
      service.createDirectMessageRequest(actor, {
        targetUserId: sameScopeCitizen.userId,
        content: '{"text":"Xin cho phep nhan tin.","mention":[]}',
        type: 'TEXT',
      }),
    ).rejects.toThrow('Direct messaging is blocked between these users.');
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('prevents non-senders from editing another user message', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          sk === `MSGREF#${latestMessage.messageId}`
        ) {
          return {
            PK: latestMessage.PK,
            SK: sk,
            entityType: 'MESSAGE_REF',
            conversationId: conversationKey,
            messageId: latestMessage.messageId,
            messageSk: latestMessage.SK,
            senderId: latestMessage.senderId,
            sentAt: latestMessage.sentAt,
            updatedAt: latestMessage.updatedAt,
          };
        }

        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          sk === latestMessage.SK
        ) {
          return latestMessage;
        }

        return undefined;
      },
    );

    await expect(
      service.updateMessage(
        actor,
        `dm:${otherUser.userId}`,
        latestMessage.messageId,
        {
          content: '{"text":"Sua trai phep","mention":[]}',
        },
      ),
    ).rejects.toThrow('You cannot edit this message.');
  });

  it('stores reply preview metadata when sending a reply', async () => {
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          sk === `MSGREF#${latestMessage.messageId}`
        ) {
          return {
            PK: latestMessage.PK,
            SK: sk,
            entityType: 'MESSAGE_REF',
            conversationId: conversationKey,
            messageId: latestMessage.messageId,
            messageSk: latestMessage.SK,
            senderId: latestMessage.senderId,
            sentAt: latestMessage.sentAt,
            updatedAt: latestMessage.updatedAt,
          };
        }

        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          sk === latestMessage.SK
        ) {
          return latestMessage;
        }

        return undefined;
      },
    );

    const result = await service.sendDirectMessage(actor, {
      targetUserId: otherUser.userId,
      content: '{"text":"Da tiep nhan.","mention":[]}',
      replyTo: latestMessage.messageId,
      type: 'TEXT',
    });

    expect(result.replyMessage).toEqual(
      expect.objectContaining({
        id: latestMessage.messageId,
        senderId: latestMessage.senderId,
        senderName: latestMessage.senderName,
      }),
    );
    expect(repository.transactPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Messages',
          item: expect.objectContaining({
            replyTo: latestMessage.messageId,
            replyMessage: expect.objectContaining({
              id: latestMessage.messageId,
              senderId: latestMessage.senderId,
            }),
          }),
        }),
      ]),
    );
  });

  it('prefers attachmentKey over legacy attachmentUrl when sending a message', async () => {
    const result = await service.sendDirectMessage(actor, {
      targetUserId: otherUser.userId,
      content: '{"text":"Gui file moi.","mention":[]}',
      type: 'TEXT',
      attachmentKey: 'uploads/message/user-1/dm-user-1-user-2/file.jpg',
      attachmentUrl: 'https://cdn.example.com/legacy-file.jpg',
    });

    expect(result).toEqual(
      expect.objectContaining({
        attachmentAsset: expect.objectContaining({
          key: 'uploads/message/user-1/dm-user-1-user-2/file.jpg',
        }),
        attachmentUrl: undefined,
      }),
    );
    expect(repository.transactPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Messages',
          item: expect.objectContaining({
            attachmentAsset: expect.objectContaining({
              key: 'uploads/message/user-1/dm-user-1-user-2/file.jpg',
            }),
            attachmentUrl: undefined,
          }),
        }),
      ]),
    );
  });

  it('recalls a message for everyone by updating the stored message state', async () => {
    const actorMessage: StoredMessage = {
      ...latestMessage,
      senderId: actor.id,
      senderName: actor.fullName,
    };

    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Messages' &&
          pk === actorMessage.PK &&
          sk === `MSGREF#${actorMessage.messageId}`
        ) {
          return {
            PK: actorMessage.PK,
            SK: sk,
            entityType: 'MESSAGE_REF',
            conversationId: conversationKey,
            messageId: actorMessage.messageId,
            messageSk: actorMessage.SK,
            senderId: actorMessage.senderId,
            sentAt: actorMessage.sentAt,
            updatedAt: actorMessage.updatedAt,
          };
        }

        if (
          tableName === 'Messages' &&
          pk === actorMessage.PK &&
          sk === actorMessage.SK
        ) {
          return actorMessage;
        }

        return undefined;
      },
    );
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Messages' &&
          pk === actorMessage.PK &&
          options?.beginsWith === 'MSG#'
        ) {
          return [
            {
              ...actorMessage,
              recalledAt: '2026-03-18T10:06:00.000Z',
              recalledByUserId: actor.id,
            },
          ];
        }

        if (
          tableName === 'Conversations' &&
          (pk === actorSummary.PK || pk === otherSummary.PK) &&
          options?.beginsWith === `CONV#${conversationKey}#LAST#`
        ) {
          return pk === actorSummary.PK ? [actorSummary] : [otherSummary];
        }

        return [];
      },
    );

    const result = await service.recallMessage(
      actor,
      `dm:${otherUser.userId}`,
      actorMessage.messageId,
      { scope: 'EVERYONE' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        conversationId: `dm:${otherUser.userId}`,
        messageId: actorMessage.messageId,
        scope: 'EVERYONE',
      }),
    );
    expect(repository.transactPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Messages',
          item: expect.objectContaining({
            recalledByUserId: actor.id,
            messageId: actorMessage.messageId,
          }),
        }),
      ]),
    );
  });

  it('recalls a message for SELF even when the message was sent by another participant', async () => {
    const actorMessage: StoredMessage = {
      ...latestMessage,
    };

    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Messages' &&
          pk === actorMessage.PK &&
          sk === `MSGREF#${actorMessage.messageId}`
        ) {
          return {
            PK: actorMessage.PK,
            SK: sk,
            entityType: 'MESSAGE_REF',
            conversationId: conversationKey,
            messageId: actorMessage.messageId,
            messageSk: actorMessage.SK,
            senderId: actorMessage.senderId,
            sentAt: actorMessage.sentAt,
            updatedAt: actorMessage.updatedAt,
          };
        }

        if (
          tableName === 'Messages' &&
          pk === actorMessage.PK &&
          sk === actorMessage.SK
        ) {
          return actorMessage;
        }

        return undefined;
      },
    );
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Conversations' &&
          pk === actorSummary.PK &&
          options?.beginsWith === `CONV#${conversationKey}#LAST#`
        ) {
          return [actorSummary];
        }

        if (
          tableName === 'Messages' &&
          pk === actorMessage.PK &&
          options?.beginsWith === 'MSG#'
        ) {
          return [];
        }

        return [];
      },
    );

    const result = await service.recallMessage(
      actor,
      `dm:${otherUser.userId}`,
      actorMessage.messageId,
      { scope: 'SELF' },
    );

    expect(result.scope).toBe('SELF');
    expect(repository.transactPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Messages',
          item: expect.objectContaining({
            messageId: actorMessage.messageId,
            deletedForUserAt: expect.objectContaining({
              [actor.id]: expect.any(String),
            }),
          }),
        }),
      ]),
    );
    expect(chatRealtimeService.emitToUser).toHaveBeenCalledWith(
      actor.id,
      'message.deleted',
      expect.objectContaining({
        messageId: actorMessage.messageId,
      }),
    );
  });

  it('allows administrators to permanently delete a message', async () => {
    const actorMessage: StoredMessage = {
      ...latestMessage,
      senderId: actor.id,
      senderName: actor.fullName,
    };

    authorizationService.isAdmin.mockReturnValue(true);
    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Messages' &&
          pk === actorMessage.PK &&
          sk === `MSGREF#${actorMessage.messageId}`
        ) {
          return {
            PK: actorMessage.PK,
            SK: sk,
            entityType: 'MESSAGE_REF',
            conversationId: conversationKey,
            messageId: actorMessage.messageId,
            messageSk: actorMessage.SK,
            senderId: actorMessage.senderId,
            sentAt: actorMessage.sentAt,
            updatedAt: actorMessage.updatedAt,
          };
        }

        if (
          tableName === 'Messages' &&
          pk === actorMessage.PK &&
          sk === actorMessage.SK
        ) {
          return actorMessage;
        }

        return undefined;
      },
    );
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Messages' &&
          pk === actorMessage.PK &&
          options?.beginsWith === 'MSG#'
        ) {
          return [];
        }

        if (
          tableName === 'Conversations' &&
          (pk === actorSummary.PK || pk === otherSummary.PK) &&
          options?.beginsWith === `CONV#${conversationKey}#LAST#`
        ) {
          return pk === actorSummary.PK ? [actorSummary] : [otherSummary];
        }

        return [];
      },
    );

    const result = await service.deleteMessage(
      adminActor,
      `dm:${otherUser.userId}`,
      actorMessage.messageId,
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: actorMessage.messageId,
        deletedAt: expect.any(String),
      }),
    );
    expect(repository.transactPut).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'Messages',
          item: expect.objectContaining({
            messageId: actorMessage.messageId,
            deletedAt: expect.any(String),
          }),
        }),
      ]),
    );
  });

  it('forwards a message copy into another conversation', async () => {
    const groupMembers = [{ userId: actor.id }, { userId: otherUser.userId }];

    repository.get.mockImplementation(
      (tableName: string, pk: string, sk: string) => {
        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          sk === `MSGREF#${latestMessage.messageId}`
        ) {
          return {
            PK: latestMessage.PK,
            SK: sk,
            entityType: 'MESSAGE_REF',
            conversationId: conversationKey,
            messageId: latestMessage.messageId,
            messageSk: latestMessage.SK,
            senderId: latestMessage.senderId,
            sentAt: latestMessage.sentAt,
            updatedAt: latestMessage.updatedAt,
          };
        }

        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          sk === latestMessage.SK
        ) {
          return latestMessage;
        }

        return undefined;
      },
    );
    groupsService.getGroup.mockResolvedValue({
      groupId: 'group-1',
    });
    groupsService.getMembership.mockResolvedValue({
      groupId: 'group-1',
      userId: actor.id,
      deletedAt: null,
    });
    groupsService.listMembers.mockResolvedValue(groupMembers);

    const result = await service.forwardMessage(
      actor,
      `dm:${otherUser.userId}`,
      latestMessage.messageId,
      { conversationIds: ['group:group-1'] },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        conversationId: 'group:group-1',
        forwardedFromMessageId: latestMessage.messageId,
        forwardedFromConversationId: latestMessage.conversationId,
      }),
    );
  });

  it('rejects direct messages to inactive targets before writing a message', async () => {
    usersService.getActiveByIdOrThrow.mockRejectedValueOnce(
      new Error('User account is not active.'),
    );

    await expect(
      service.sendDirectMessage(actor, {
        targetUserId: otherUser.userId,
        content: '{"text":"Xin chao","mention":[]}',
        type: 'TEXT',
      }),
    ).rejects.toThrow('User account is not active.');
    expect(repository.transactPut).not.toHaveBeenCalled();
  });

  it('blocks access when actor is not a participant of raw DM conversation id', async () => {
    await expect(
      service.listMessages(actor, 'DM#user-2#user-3', {}),
    ).rejects.toThrow('You cannot access this conversation.');
  });
});
