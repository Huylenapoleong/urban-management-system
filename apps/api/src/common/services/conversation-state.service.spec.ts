import type { StoredMessage } from '../storage-records';
import { ConversationStateService } from './conversation-state.service';

describe('ConversationStateService', () => {
  const service = new ConversationStateService();

  const baseMessage: StoredMessage = {
    PK: 'CONV#DM#user-1#user-2',
    SK: 'MSG#2026-04-22T08:00:00.000Z#msg-1',
    entityType: 'MESSAGE',
    messageId: 'msg-1',
    conversationId: 'DM#user-1#user-2',
    senderId: 'user-2',
    senderName: 'Citizen Two',
    type: 'TEXT',
    content: '{"text":"Xin chao","mention":[]}',
    deletedAt: null,
    sentAt: '2026-04-22T08:00:00.000Z',
    updatedAt: '2026-04-22T08:00:00.000Z',
  };

  it('treats empty structured messages without attachments as non-renderable', () => {
    const ghostMessage: StoredMessage = {
      ...baseMessage,
      messageId: 'ghost-1',
      content: '{"text":"","mention":[]}',
    };

    expect(service.isRenderableMessage(ghostMessage)).toBe(false);
    expect(service.isMessageVisibleToUser(ghostMessage, 'user-1')).toBe(false);
  });

  it('ignores ghost messages when computing unread counts', () => {
    const ghostMessage: StoredMessage = {
      ...baseMessage,
      messageId: 'ghost-2',
      sentAt: '2026-04-22T08:01:00.000Z',
      updatedAt: '2026-04-22T08:01:00.000Z',
      content: '{"text":"","mention":[]}',
    };

    expect(
      service.computeUnreadCount('user-1', [baseMessage, ghostMessage], null),
    ).toBe(1);
  });

  it('ignores ghost messages when grouping active messages for summary rebuilds', () => {
    const ghostMessage: StoredMessage = {
      ...baseMessage,
      messageId: 'ghost-3',
      sentAt: '2026-04-22T08:02:00.000Z',
      updatedAt: '2026-04-22T08:02:00.000Z',
      content: '{"text":"","mention":[]}',
    };

    const grouped = service.groupActiveMessagesByConversation([
      baseMessage,
      ghostMessage,
    ]);

    expect(grouped.get(baseMessage.conversationId)).toEqual([baseMessage]);
  });
});
