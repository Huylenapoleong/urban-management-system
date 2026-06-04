import { Injectable, Logger } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ConversationSummary,
  MessageItem,
} from '@urban/shared-types';
import { ConversationsService } from '../../conversations/conversations.service';
import { ChatbotService } from '../chatbot.service';
import type {
  AuthenticatedChatbotResultDto,
  ChatbotConversationTargetDto,
  ChatbotConversationTargetType,
  ChatbotSelectedTargetDto,
} from '../dto/authenticated-chatbot.dto';
import { GroqClientService } from './groq-client.service';

const DEFAULT_SUMMARY_MESSAGE_COUNT = 50;
const MAX_CONVERSATION_CANDIDATES = 200;

interface MatchedConversationTarget extends ChatbotConversationTargetDto {
  conversation: ConversationSummary;
}

@Injectable()
export class AuthenticatedChatbotService {
  private readonly logger = new Logger(AuthenticatedChatbotService.name);

  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly conversationsService: ConversationsService,
    private readonly groq: GroqClientService,
  ) {}

  async ask(
    actor: AuthenticatedUser,
    question: string,
    selectedTarget?: ChatbotSelectedTargetDto,
    matchIds?: string[],
  ): Promise<AuthenticatedChatbotResultDto> {
    const trimmedQuestion = question.trim();

    if (selectedTarget) {
      return this.summarizeSelectedTarget(actor, selectedTarget);
    }

    const wantsSummary = this.isSummaryRequest(trimmedQuestion);
    const targetQuery = wantsSummary
      ? this.extractSummaryTargetQuery(trimmedQuestion)
      : trimmedQuestion;
    const matches = targetQuery
      ? await this.findConversationTargets(actor, targetQuery, matchIds)
      : [];

    if (matches.length === 1) {
      return this.summarizeConversation(actor, matches[0]);
    }

    if (matches.length > 1) {
      return {
        status: 'candidates',
        answer:
          'Tôi tìm thấy nhiều cuộc trò chuyện phù hợp. Vui lòng chọn một mục để tóm tắt.',
        candidates: matches.map(({ id, type, name }) => ({ id, type, name })),
      };
    }

    if (wantsSummary) {
      return {
        status: 'not_found',
        answer:
          'Tôi không tìm thấy group hoặc cuộc trò chuyện trực tiếp phù hợp trong danh sách chat của bạn.',
      };
    }

    const lawAnswer = await this.chatbotService.ask(
      trimmedQuestion,
      actor.role,
    );

    return {
      status: 'law',
      answer: lawAnswer.answer,
      sources: lawAnswer.sources,
    };
  }

  private async summarizeSelectedTarget(
    actor: AuthenticatedUser,
    selectedTarget: ChatbotSelectedTargetDto,
  ): Promise<AuthenticatedChatbotResultDto> {
    const conversations = await this.listVisibleConversations(actor);
    const conversation = conversations.find(
      (item) =>
        item.conversationId === selectedTarget.id &&
        this.toTargetType(item) === selectedTarget.type,
    );
    const target: ChatbotConversationTargetDto = conversation
      ? this.toTarget(conversation)
      : {
          id: selectedTarget.id,
          type: selectedTarget.type,
          name:
            selectedTarget.type === 'GROUP' ? 'Nhóm đã chọn' : 'Người đã chọn',
        };

    return this.summarizeConversation(actor, {
      ...target,
      conversation: conversation ?? this.toMinimalConversation(target),
    });
  }

  private async summarizeConversation(
    actor: AuthenticatedUser,
    target: MatchedConversationTarget,
  ): Promise<AuthenticatedChatbotResultDto> {
    const response = await this.conversationsService.listMessages(
      actor,
      target.id,
      { limit: String(DEFAULT_SUMMARY_MESSAGE_COUNT) },
    );
    const messages = response.data
      .filter((message) => !message.deletedAt)
      .sort((left, right) => left.sentAt.localeCompare(right.sentAt));

    if (messages.length === 0) {
      return {
        status: 'summary',
        answer: 'Không có tin nhắn nào trong cuộc trò chuyện này để tóm tắt.',
        summary: 'Không có tin nhắn nào trong cuộc trò chuyện này để tóm tắt.',
        messagesFetched: 0,
        target: this.toTarget(target.conversation),
      };
    }

    const chatLog = messages
      .map((message) => this.formatMessage(message))
      .join('\n');
    const systemPrompt =
      `Bạn là trợ lý AI cho hệ thống quản lý đô thị.\n` +
      `Nhiệm vụ: Tóm tắt cuộc trò chuyện bên dưới thật ngắn gọn.\n` +
      `Yêu cầu:\n` +
      `- Trả lời bằng tiếng Việt, định dạng Markdown.\n` +
      `- Tối đa 4 gạch đầu dòng, mỗi dòng không quá 20 từ.\n` +
      `- Không viết đoạn mở đầu hoặc tiêu đề dài.\n` +
      `- Chỉ nêu chủ đề chính, quyết định, việc cần làm nếu có thật.\n` +
      `- Không liệt kê người liên quan nếu không cần thiết.\n` +
      `- KHÔNG sáng tạo thêm thông tin ngoài nội dung chat.\n\n` +
      `[THÔNG TIN CUỘC TRÒ CHUYỆN]\n` +
      `Tên: ${target.name}\n` +
      `Loại: ${target.type === 'GROUP' ? 'Nhóm' : 'Trực tiếp'}\n\n` +
      `[LỊCH SỬ TIN NHẮN]\n${chatLog}`;

    this.logger.debug(
      `Summarizing ${messages.length} messages from conversation=${target.id}`,
    );

    const summary = await this.groq.complete(
      systemPrompt,
      'Tóm tắt thật ngắn cuộc trò chuyện trên.',
    );

    return {
      status: 'summary',
      answer: summary,
      summary,
      messagesFetched: messages.length,
      target: this.toTarget(target.conversation),
    };
  }

  private async findConversationTargets(
    actor: AuthenticatedUser,
    targetQuery: string,
    matchIds?: string[],
  ): Promise<MatchedConversationTarget[]> {
    const normalizedQuery = this.normalizeText(targetQuery);

    if (!normalizedQuery) {
      return [];
    }

    const response = await this.conversationsService.listConversations(actor, {
      q: targetQuery,
      matchIds: matchIds?.join(','),
      limit: String(MAX_CONVERSATION_CANDIDATES),
      includeArchived: 'true',
    });

    const matches = response.data.filter(
      (conversation) => !conversation.deletedAt,
    );

    return matches.map((conversation) => ({
      ...this.toTarget(conversation),
      conversation,
    }));
  }

  private async listVisibleConversations(
    actor: AuthenticatedUser,
  ): Promise<ConversationSummary[]> {
    const response = await this.conversationsService.listConversations(actor, {
      limit: String(MAX_CONVERSATION_CANDIDATES),
      includeArchived: 'true',
    });

    return response.data.filter((conversation) => !conversation.deletedAt);
  }

  private isSummaryRequest(question: string): boolean {
    const normalized = this.normalizeText(question);

    return ['tom tat', 'tong ket', 'summary', 'summarize', 'recap'].some(
      (keyword) => normalized.includes(keyword),
    );
  }

  private extractSummaryTargetQuery(question: string): string {
    const normalized = this.normalizeText(question);
    let result = normalized;

    for (const phrase of [
      'hay tom tat',
      'vui long tom tat',
      'tom tat noi dung cua',
      'tom tat noi dung',
      'tom tat cuoc tro chuyen voi',
      'tom tat cuoc tro chuyen',
      'tom tat chat voi',
      'tom tat chat',
      'tom tat nhom',
      'tom tat group',
      'tom tat',
      'tong ket',
      'summary',
      'summarize',
      'recap',
      'chat voi',
      'cuoc tro chuyen voi',
      'nhom',
      'group',
      'voi',
    ]) {
      result = result.replaceAll(phrase, ' ');
    }

    return result.replace(/\s+/g, ' ').trim();
  }

  private formatMessage(message: MessageItem): string {
    const content = this.extractMessageContent(message);

    return `[${message.sentAt}] ${message.senderName}: ${content}`;
  }

  private extractMessageContent(message: MessageItem): string {
    if (message.recalledAt) {
      return '[Tin nhắn đã thu hồi]';
    }

    const rawContent = message.content?.trim();

    if (!rawContent) {
      return `[${message.type}]`;
    }

    try {
      const parsed: unknown = JSON.parse(rawContent);

      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as { text?: unknown }).text === 'string' &&
        (parsed as { text: string }).text.trim()
      ) {
        return (parsed as { text: string }).text.trim();
      }
    } catch {
      // Plain text messages are not JSON.
    }

    return rawContent;
  }

  private toTarget(
    conversation: Pick<
      ConversationSummary,
      'conversationId' | 'groupName' | 'isGroup'
    >,
  ): ChatbotConversationTargetDto {
    return {
      id: conversation.conversationId,
      type: this.toTargetType(conversation),
      name: conversation.groupName,
    };
  }

  private toTargetType(
    conversation: Pick<ConversationSummary, 'isGroup'>,
  ): ChatbotConversationTargetType {
    return conversation.isGroup ? 'GROUP' : 'USER';
  }

  private toMinimalConversation(
    target: ChatbotConversationTargetDto,
  ): ConversationSummary {
    return {
      conversationId: target.id,
      groupName: target.name,
      lastMessagePreview: '',
      lastSenderName: '',
      unreadCount: 0,
      isGroup: target.type === 'GROUP',
      deletedAt: null,
      updatedAt: '',
    };
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
