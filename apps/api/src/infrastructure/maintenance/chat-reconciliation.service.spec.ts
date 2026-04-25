import { ForbiddenException } from '@nestjs/common';
import { ChatReconciliationService } from './chat-reconciliation.service';
import { ConversationStateService } from '../../common/services/conversation-state.service';

describe('ChatReconciliationService', () => {
  const repository = {
    delete: jest.fn(),
    put: jest.fn(),
    scanAll: jest.fn(),
  };
  const authorizationService = {
    isAdmin: jest.fn(),
  };
  const conversationStateService = new ConversationStateService();
  const config = {
    dynamodbConversationsTableName: 'Conversations',
    dynamodbMessagesTableName: 'Messages',
  };

  let service: ChatReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    authorizationService.isAdmin.mockReturnValue(true);
    service = new ChatReconciliationService(
      repository as never,
      authorizationService as never,
      conversationStateService as never,
      config as never,
    );
  });

  it('previews orphaned and stale inbox summaries', async () => {
    repository.scanAll
      .mockResolvedValueOnce([
        {
          PK: 'USER#user-1',
          SK: 'CONV#DM#user-1#user-2#LAST#2026-03-18T09:00:00.000Z',
          entityType: 'CONVERSATION',
          GSI1PK: 'wrong-index',
          userId: 'user-1',
          conversationId: 'DM#user-1#user-2',
          groupName: 'User Two',
          lastMessagePreview: 'Old preview',
          lastSenderName: 'User One',
          unreadCount: 0,
          isGroup: true,
          isPinned: false,
          archivedAt: null,
          mutedUntil: null,
          deletedAt: null,
          updatedAt: '2026-03-18T09:00:00.000Z',
          lastReadAt: null,
        },
        {
          PK: 'USER#user-3',
          SK: 'CONV#GRP#group-1#LAST#2026-03-18T08:00:00.000Z',
          entityType: 'CONVERSATION',
          GSI1PK: 'USER#user-3#TYPE#GRP',
          userId: 'user-3',
          conversationId: 'GRP#group-1',
          groupName: 'Ward Group',
          lastMessagePreview: 'Lonely summary',
          lastSenderName: 'Officer',
          unreadCount: 0,
          isGroup: true,
          isPinned: false,
          archivedAt: null,
          mutedUntil: null,
          deletedAt: null,
          updatedAt: '2026-03-18T08:00:00.000Z',
          lastReadAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          PK: 'CONV#DM#user-1#user-2',
          SK: 'MSG#2026-03-18T10:00:00.000Z#msg-1',
          entityType: 'MESSAGE',
          messageId: 'msg-1',
          conversationId: 'DM#user-1#user-2',
          senderId: 'user-2',
          senderName: 'User Two',
          type: 'TEXT',
          content: '{"text":"Need assistance","mention":[]}',
          deletedAt: null,
          sentAt: '2026-03-18T10:00:00.000Z',
          updatedAt: '2026-03-18T10:00:00.000Z',
        },
      ]);

    const result = await service.preview(buildAdminActor());

    expect(result.totalCandidates).toBe(2);
    expect(result.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issueType: 'ORPHANED_SUMMARY', count: 1 }),
        expect.objectContaining({
          issueType: 'SUMMARY_KEY_MISMATCH',
          count: 1,
        }),
        expect.objectContaining({
          issueType: 'SUMMARY_INDEX_MISMATCH',
          count: 1,
        }),
        expect.objectContaining({
          issueType: 'SUMMARY_KIND_MISMATCH',
          count: 1,
        }),
        expect.objectContaining({
          issueType: 'SUMMARY_PREVIEW_MISMATCH',
          count: 1,
        }),
        expect.objectContaining({
          issueType: 'SUMMARY_SENDER_MISMATCH',
          count: 1,
        }),
        expect.objectContaining({
          issueType: 'SUMMARY_UNREAD_COUNT_MISMATCH',
          count: 1,
        }),
        expect.objectContaining({
          issueType: 'SUMMARY_UPDATED_AT_MISMATCH',
          count: 1,
        }),
      ]),
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: 'DM#user-1#user-2',
          expectedSk: 'CONV#DM#user-1#user-2#LAST#2026-03-18T10:00:00.000Z',
          issueTypes: expect.arrayContaining([
            'SUMMARY_KEY_MISMATCH',
            'SUMMARY_INDEX_MISMATCH',
            'SUMMARY_KIND_MISMATCH',
            'SUMMARY_PREVIEW_MISMATCH',
            'SUMMARY_SENDER_MISMATCH',
            'SUMMARY_UNREAD_COUNT_MISMATCH',
            'SUMMARY_UPDATED_AT_MISMATCH',
          ]),
          latestMessageId: 'msg-1',
          userId: 'user-1',
        }),
        expect.objectContaining({
          conversationId: 'GRP#group-1',
          issueTypes: ['ORPHANED_SUMMARY'],
          userId: 'user-3',
        }),
      ]),
    );
  });

  it('repairs stale inbox summaries and deletes orphaned ones', async () => {
    repository.scanAll
      .mockResolvedValueOnce([
        {
          PK: 'USER#user-1',
          SK: 'CONV#DM#user-1#user-2#LAST#2026-03-18T09:00:00.000Z',
          entityType: 'CONVERSATION',
          GSI1PK: 'wrong-index',
          userId: 'user-1',
          conversationId: 'DM#user-1#user-2',
          groupName: 'User Two',
          lastMessagePreview: 'Old preview',
          lastSenderName: 'User One',
          unreadCount: 0,
          isGroup: true,
          isPinned: false,
          archivedAt: null,
          mutedUntil: null,
          deletedAt: null,
          updatedAt: '2026-03-18T09:00:00.000Z',
          lastReadAt: null,
        },
        {
          PK: 'USER#user-3',
          SK: 'CONV#GRP#group-1#LAST#2026-03-18T08:00:00.000Z',
          entityType: 'CONVERSATION',
          GSI1PK: 'USER#user-3#TYPE#GRP',
          userId: 'user-3',
          conversationId: 'GRP#group-1',
          groupName: 'Ward Group',
          lastMessagePreview: 'Lonely summary',
          lastSenderName: 'Officer',
          unreadCount: 0,
          isGroup: true,
          isPinned: false,
          archivedAt: null,
          mutedUntil: null,
          deletedAt: null,
          updatedAt: '2026-03-18T08:00:00.000Z',
          lastReadAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          PK: 'CONV#DM#user-1#user-2',
          SK: 'MSG#2026-03-18T10:00:00.000Z#msg-1',
          entityType: 'MESSAGE',
          messageId: 'msg-1',
          conversationId: 'DM#user-1#user-2',
          senderId: 'user-2',
          senderName: 'User Two',
          type: 'TEXT',
          content: '{"text":"Need assistance","mention":[]}',
          deletedAt: null,
          sentAt: '2026-03-18T10:00:00.000Z',
          updatedAt: '2026-03-18T10:00:00.000Z',
        },
      ]);

    const result = await service.repair(buildAdminActor());

    expect(repository.delete).toHaveBeenCalledTimes(2);
    expect(repository.delete).toHaveBeenCalledWith(
      'Conversations',
      'USER#user-1',
      'CONV#DM#user-1#user-2#LAST#2026-03-18T09:00:00.000Z',
    );
    expect(repository.delete).toHaveBeenCalledWith(
      'Conversations',
      'USER#user-3',
      'CONV#GRP#group-1#LAST#2026-03-18T08:00:00.000Z',
    );
    expect(repository.put).toHaveBeenCalledWith(
      'Conversations',
      expect.objectContaining({
        PK: 'USER#user-1',
        SK: 'CONV#DM#user-1#user-2#LAST#2026-03-18T10:00:00.000Z',
        GSI1PK: 'USER#user-1#TYPE#DM',
        isGroup: false,
        lastMessagePreview: 'Need assistance',
        lastSenderName: 'User Two',
        unreadCount: 1,
        updatedAt: '2026-03-18T10:00:00.000Z',
      }),
    );
    expect(result.totalUpdated).toBe(1);
    expect(result.totalDeleted).toBe(1);
  });

  it('rejects non-admin access', async () => {
    authorizationService.isAdmin.mockReturnValue(false);

    await expect(service.preview(buildCitizenActor())).rejects.toThrow(
      new ForbiddenException(
        'Only administrators can access chat reconciliation maintenance.',
      ),
    );
    expect(repository.scanAll).not.toHaveBeenCalled();
  });
});

function buildAdminActor() {
  return {
    id: 'admin-1',
    fullName: 'Admin',
    locationCode: 'VN-HCM-BQ1-P01',
    role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z',
  };
}

function buildCitizenActor() {
  return {
    id: 'citizen-1',
    fullName: 'Citizen',
    locationCode: 'VN-HCM-BQ1-P01',
    role: 'CITIZEN' as const,
    status: 'ACTIVE' as const,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z',
  };
}
