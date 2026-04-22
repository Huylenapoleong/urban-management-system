import {
  makeConversationPk,
  makeConversationSummarySk,
  makeInboxPk,
} from '@urban/shared-utils';
import type {
  StoredConversation,
  StoredMessage,
} from '../../common/storage-records';
import { ConversationStateService } from '../../common/services/conversation-state.service';
import { ConversationSummaryService } from './conversation-summary.service';

describe('ConversationSummaryService', () => {
  const repository = {
    delete: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    queryByPk: jest.fn(),
    scanAll: jest.fn(),
  };
  const usersService = {
    getByIdOrThrow: jest.fn(),
  };
  const config = {
    dynamodbConversationsTableName: 'Conversations',
    dynamodbGroupsTableName: 'Groups',
    dynamodbMessagesTableName: 'Messages',
  };

  let service: ConversationSummaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationSummaryService(
      repository as never,
      new ConversationStateService(),
      usersService as never,
      config as never,
    );
    repository.delete.mockResolvedValue(undefined);
    repository.get.mockResolvedValue(undefined);
    repository.put.mockResolvedValue(undefined);
    repository.queryByPk.mockResolvedValue([]);
    repository.scanAll.mockResolvedValue([]);
  });

  it('reuses one group lookup for all participant labels in group conversations', async () => {
    repository.get.mockResolvedValue({
      groupId: 'group-1',
      groupName: 'Area Group 1',
      deletedAt: null,
    });

    const result = await service.getConversationLabelMap('GRP#group-1', [
      'user-1',
      'user-2',
      'user-3',
    ]);

    expect(repository.get).toHaveBeenCalledWith(
      'Groups',
      'GROUP#group-1',
      'METADATA',
    );
    expect(usersService.getByIdOrThrow).not.toHaveBeenCalled();
    expect(Array.from(result.entries())).toEqual([
      ['user-1', 'Area Group 1'],
      ['user-2', 'Area Group 1'],
      ['user-3', 'Area Group 1'],
    ]);
  });

  it('does not scan all conversation summaries when syncing a DM mutation', async () => {
    const conversationId = 'DM#user-1#user-2';
    const latestMessage: StoredMessage = {
      PK: makeConversationPk(conversationId),
      SK: 'MSG#2026-03-18T10:05:00.000Z#01MESSAGE',
      entityType: 'MESSAGE',
      messageId: '01MESSAGE',
      conversationId,
      senderId: 'user-2',
      senderName: 'Citizen Two',
      type: 'TEXT',
      content: '{"text":"Xin chao","mention":[]}',
      deletedAt: null,
      sentAt: '2026-03-18T10:05:00.000Z',
      updatedAt: '2026-03-18T10:05:00.000Z',
    };
    const summaryOne: StoredConversation = {
      PK: makeInboxPk('user-1'),
      SK: makeConversationSummarySk(conversationId, latestMessage.sentAt),
      entityType: 'CONVERSATION',
      GSI1PK: 'USER#user-1#TYPE#DM',
      userId: 'user-1',
      conversationId,
      groupName: 'Citizen Two',
      lastMessagePreview: 'Xin chao',
      lastSenderName: 'Citizen Two',
      unreadCount: 1,
      isGroup: false,
      deletedAt: null,
      updatedAt: latestMessage.sentAt,
      lastReadAt: null,
    };
    const summaryTwo: StoredConversation = {
      ...summaryOne,
      PK: makeInboxPk('user-2'),
      GSI1PK: 'USER#user-2#TYPE#DM',
      userId: 'user-2',
      groupName: 'Citizen One',
      unreadCount: 0,
    };

    usersService.getByIdOrThrow.mockImplementation((userId: string) => {
      if (userId === 'user-1') {
        return {
          userId,
          fullName: 'Citizen One',
        };
      }

      if (userId === 'user-2') {
        return {
          userId,
          fullName: 'Citizen Two',
        };
      }

      throw new Error(`Unexpected user lookup: ${userId}`);
    });
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          options?.beginsWith === 'MSG#'
        ) {
          return [latestMessage];
        }

        if (
          tableName === 'Conversations' &&
          pk === summaryOne.PK &&
          options?.beginsWith === `CONV#${conversationId}#LAST#`
        ) {
          return [summaryOne];
        }

        if (
          tableName === 'Conversations' &&
          pk === summaryTwo.PK &&
          options?.beginsWith === `CONV#${conversationId}#LAST#`
        ) {
          return [summaryTwo];
        }

        return [];
      },
    );

    await service.syncConversationSummariesAfterMessageMutation({
      conversationKey: conversationId,
      participants: ['user-1', 'user-2'],
    });

    expect(repository.scanAll).not.toHaveBeenCalled();
  });

  it('does not scan all conversation summaries when syncing a group mutation', async () => {
    const conversationId = 'GRP#group-1';
    const latestMessage: StoredMessage = {
      PK: makeConversationPk(conversationId),
      SK: 'MSG#2026-03-18T10:05:00.000Z#01MESSAGE',
      entityType: 'MESSAGE',
      messageId: '01MESSAGE',
      conversationId,
      senderId: 'user-2',
      senderName: 'Citizen Two',
      type: 'TEXT',
      content: '{"text":"Xin chao ca nhom","mention":[]}',
      deletedAt: null,
      sentAt: '2026-03-18T10:05:00.000Z',
      updatedAt: '2026-03-18T10:05:00.000Z',
    };
    const summaryOne: StoredConversation = {
      PK: makeInboxPk('user-1'),
      SK: makeConversationSummarySk(conversationId, latestMessage.sentAt),
      entityType: 'CONVERSATION',
      GSI1PK: 'USER#user-1#TYPE#GRP',
      userId: 'user-1',
      conversationId,
      groupName: 'Area Group 1',
      lastMessagePreview: 'Xin chao ca nhom',
      lastSenderName: 'Citizen Two',
      unreadCount: 1,
      isGroup: true,
      deletedAt: null,
      updatedAt: latestMessage.sentAt,
      lastReadAt: null,
    };
    const summaryTwo: StoredConversation = {
      ...summaryOne,
      PK: makeInboxPk('user-2'),
      GSI1PK: 'USER#user-2#TYPE#GRP',
      userId: 'user-2',
      unreadCount: 0,
    };

    repository.get.mockResolvedValue({
      groupId: 'group-1',
      groupName: 'Area Group 1',
      deletedAt: null,
    });
    repository.queryByPk.mockImplementation(
      (tableName: string, pk: string, options?: { beginsWith?: string }) => {
        if (
          tableName === 'Messages' &&
          pk === latestMessage.PK &&
          options?.beginsWith === 'MSG#'
        ) {
          return [latestMessage];
        }

        if (
          tableName === 'Conversations' &&
          pk === summaryOne.PK &&
          options?.beginsWith === `CONV#${conversationId}#LAST#`
        ) {
          return [summaryOne];
        }

        if (
          tableName === 'Conversations' &&
          pk === summaryTwo.PK &&
          options?.beginsWith === `CONV#${conversationId}#LAST#`
        ) {
          return [summaryTwo];
        }

        return [];
      },
    );

    await service.syncConversationSummariesAfterMessageMutation({
      conversationKey: conversationId,
      participants: ['user-1', 'user-2'],
    });

    expect(repository.scanAll).not.toHaveBeenCalled();
  });
});
