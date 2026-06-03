import { ForbiddenException } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ConversationSummary,
  MessageItem,
} from '@urban/shared-types';
import type { ConversationsService } from '../../conversations/conversations.service';
import type { ChatbotService } from '../chatbot.service';
import { AuthenticatedChatbotService } from './authenticated-chatbot.service';
import type { GroqClientService } from './groq-client.service';

type MockedChatbotService = {
  ask: jest.Mock;
};

type MockedConversationsService = {
  listConversations: jest.Mock;
  listMessages: jest.Mock;
};

type MockedGroqClientService = {
  complete: jest.Mock;
};

const actor: AuthenticatedUser = {
  id: 'user-1',
  fullName: 'Nguyen Van User',
  role: 'CITIZEN',
  locationCode: 'P001',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeConversation(
  overrides: Partial<ConversationSummary>,
): ConversationSummary {
  return {
    conversationId: 'DM#user-1#user-2',
    groupName: 'Nguyen Van A',
    lastMessagePreview: '',
    lastSenderName: '',
    unreadCount: 0,
    isGroup: false,
    deletedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<MessageItem>): MessageItem {
  return {
    conversationId: 'DM#user-1#user-2',
    id: 'msg-1',
    senderId: 'user-1',
    senderName: 'Nguyen Van User',
    type: 'TEXT',
    content: 'Xin chao',
    deletedAt: null,
    sentAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createService() {
  const chatbot: MockedChatbotService = {
    ask: jest.fn(),
  };
  const conversations: MockedConversationsService = {
    listConversations: jest.fn(),
    listMessages: jest.fn(),
  };
  const groq: MockedGroqClientService = {
    complete: jest.fn(),
  };
  const service = new AuthenticatedChatbotService(
    chatbot as unknown as ChatbotService,
    conversations as unknown as ConversationsService,
    groq as unknown as GroqClientService,
  );

  return { service, chatbot, conversations, groq };
}

describe('AuthenticatedChatbotService', () => {
  it('summarizes a unique group match from a natural keyword request', async () => {
    const { service, conversations, groq } = createService();
    conversations.listConversations.mockResolvedValue({
      success: true,
      data: [
        makeConversation({
          conversationId: 'GRP#group-1',
          groupName: 'Dan pho 1',
          isGroup: true,
        }),
      ],
    });
    conversations.listMessages.mockResolvedValue({
      success: true,
      data: [
        makeMessage({
          conversationId: 'GRP#group-1',
          content: 'Can xu ly rac thai',
        }),
      ],
    });
    groq.complete.mockResolvedValue('## Tom tat\n- Can xu ly rac thai');

    const result = await service.ask(actor, 'tóm tắt nhóm Dân phố 1');

    expect(result.status).toBe('summary');
    expect(result.answer).toContain('Tom tat');
    expect(conversations.listMessages).toHaveBeenCalledWith(
      actor,
      'GRP#group-1',
      { limit: '50' },
    );
    expect(groq.complete).toHaveBeenCalledWith(
      expect.stringContaining('Dan pho 1'),
      'Tóm tắt thật ngắn cuộc trò chuyện trên.',
    );
  });

  it('summarizes a unique direct chat match from a bare user name', async () => {
    const { service, conversations, groq } = createService();
    conversations.listConversations.mockResolvedValue({
      success: true,
      data: [
        makeConversation({
          conversationId: 'DM#user-1#user-2',
          groupName: 'Nguyen Van A',
          isGroup: false,
        }),
      ],
    });
    conversations.listMessages.mockResolvedValue({
      success: true,
      data: [makeMessage({ content: '{"text":"Can ho tro"}' })],
    });
    groq.complete.mockResolvedValue('Summary text');

    const result = await service.ask(actor, 'Nguyễn Văn A');

    expect(result.status).toBe('summary');
    if (result.status !== 'summary') {
      throw new Error('Expected summary result');
    }
    expect(result.target).toEqual({
      id: 'DM#user-1#user-2',
      type: 'USER',
      name: 'Nguyen Van A',
    });
    expect(groq.complete).toHaveBeenCalledWith(
      expect.stringContaining('Can ho tro'),
      'Tóm tắt thật ngắn cuộc trò chuyện trên.',
    );
  });

  it('returns candidates when multiple conversations match', async () => {
    const { service, conversations } = createService();
    conversations.listConversations.mockResolvedValue({
      success: true,
      data: [
        makeConversation({
          conversationId: 'GRP#group-1',
          groupName: 'Nguyen Van A Team',
          isGroup: true,
        }),
        makeConversation({
          conversationId: 'DM#user-1#user-2',
          groupName: 'Nguyen Van A',
          isGroup: false,
        }),
      ],
    });

    const result = await service.ask(actor, 'tóm tắt Nguyễn Văn A');

    expect(result.status).toBe('candidates');
    if (result.status !== 'candidates') {
      throw new Error('Expected candidates result');
    }
    expect(result.candidates).toEqual([
      { id: 'GRP#group-1', type: 'GROUP', name: 'Nguyen Van A Team' },
      { id: 'DM#user-1#user-2', type: 'USER', name: 'Nguyen Van A' },
    ]);
  });

  it('summarizes a selected candidate by conversation id and type', async () => {
    const { service, conversations, groq } = createService();
    conversations.listConversations.mockResolvedValue({
      success: true,
      data: [
        makeConversation({
          conversationId: 'DM#user-1#user-2',
          groupName: 'Nguyen Van A',
          isGroup: false,
        }),
      ],
    });
    conversations.listMessages.mockResolvedValue({
      success: true,
      data: [makeMessage({ content: 'Tin nhan can tom tat' })],
    });
    groq.complete.mockResolvedValue('Selected summary');

    const result = await service.ask(actor, 'tóm tắt', {
      id: 'DM#user-1#user-2',
      type: 'USER',
    });

    expect(result.status).toBe('summary');
    expect(conversations.listMessages).toHaveBeenCalledWith(
      actor,
      'DM#user-1#user-2',
      { limit: '50' },
    );
  });

  it('returns not_found when a summary target is missing', async () => {
    const { service, conversations, groq } = createService();
    conversations.listConversations.mockResolvedValue({
      success: true,
      data: [],
    });

    const result = await service.ask(actor, 'tóm tắt chat với Tran Van B');

    expect(result.status).toBe('not_found');
    expect(groq.complete).not.toHaveBeenCalled();
  });

  it('falls back to law chatbot for non-summary text with no conversation match', async () => {
    const { service, chatbot, conversations } = createService();
    conversations.listConversations.mockResolvedValue({
      success: true,
      data: [],
    });
    chatbot.ask.mockResolvedValue({
      answer: 'Legal answer',
      sources: [{ title: 'Doc', source: 'Law' }],
    });

    const result = await service.ask(actor, 'xin giấy phép xây dựng cần gì');

    expect(result).toEqual({
      status: 'law',
      answer: 'Legal answer',
      sources: [{ title: 'Doc', source: 'Law' }],
    });
    expect(chatbot.ask).toHaveBeenCalledWith(
      'xin giấy phép xây dựng cần gì',
      'CITIZEN',
    );
  });

  it('propagates access errors for a selected target outside the user inbox', async () => {
    const { service, conversations } = createService();
    conversations.listConversations.mockResolvedValue({
      success: true,
      data: [],
    });
    conversations.listMessages.mockRejectedValue(
      new ForbiddenException('Bạn không có quyền xem cuộc trò chuyện này.'),
    );

    await expect(
      service.ask(actor, 'tóm tắt', {
        id: 'DM#user-1#user-999',
        type: 'USER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
