import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../../infrastructure/dynamodb/urban-table.repository';
import { GroqClientService } from './groq-client.service';
import { ChatbotPrivacyService } from './chatbot-privacy.service';
import type { StoredMessage } from '../../../common/storage-records';
import { makeConversationPk } from '@urban/shared-utils';

/**
 * Group Chat Summary Service — Officer Assistant Feature.
 *
 * Flow:
 *   1. Kiểm tra Privacy (User có thuộc Group không)
 *   2. Kéo N tin nhắn gần nhất từ DynamoDB (Messages table)
 *   3. Ráp thành Prompt gửi lên Groq
 *   4. Trả về Markdown tóm tắt
 */
@Injectable()
export class GroupChatSummaryService {
  private readonly logger = new Logger(GroupChatSummaryService.name);

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly config: AppConfigService,
    private readonly groq: GroqClientService,
    private readonly privacy: ChatbotPrivacyService,
  ) {}

  /**
   * Tóm tắt n tin nhắn gần nhất của group chat.
   *
   * @param userId - ID của user đang yêu cầu
   * @param userRole - Role của user (WARD_OFFICER, PROVINCE_OFFICER, ADMIN)
   * @param groupId - ID của group cần tóm tắt
   * @param messageCount - Số lượng tin nhắn cần lấy (default: 50)
   */
  async summarize(
    userId: string,
    userRole: string,
    groupId: string,
    messageCount: number = 50,
  ): Promise<{ summary: string; messagesFetched: number }> {
    // Step 1: Privacy check
    this.privacy.ensureOfficerRole(userRole);
    await this.privacy.ensureUserInGroup(userId, groupId);

    // Step 2: Kéo tin nhắn từ DynamoDB
    const conversationKey = `GRP#${groupId}`;
    const messages = await this.repository.queryByPk<StoredMessage>(
      this.config.dynamodbMessagesTableName,
      makeConversationPk(conversationKey),
      { beginsWith: 'MSG#' },
    );

    // Lọc tin nhắn chưa xóa và lấy N tin gần nhất
    const activeMessages = messages
      .filter((msg) => !msg.deletedAt)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
      .slice(-messageCount);

    if (activeMessages.length === 0) {
      return {
        summary: 'Không có tin nhắn nào trong nhóm này để tóm tắt.',
        messagesFetched: 0,
      };
    }

    // Step 3: Xây dựng prompt
    const chatLog = activeMessages
      .map(
        (msg) =>
          `[${msg.sentAt}] ${msg.senderName}: ${msg.content || `[${msg.type}]`}`,
      )
      .join('\n');

    const systemPrompt =
      `Bạn là trợ lý AI cho hệ thống quản lý đô thị.\n` +
      `Nhiệm vụ: Tóm tắt cuộc trò chuyện nhóm bên dưới một cách ngắn gọn, rõ ràng.\n` +
      `Yêu cầu:\n` +
      `- Trả lời bằng tiếng Việt, định dạng Markdown.\n` +
      `- Liệt kê các chủ đề chính được thảo luận.\n` +
      `- Nêu bật các quyết định, yêu cầu hành động, hoặc vấn đề cần giải quyết.\n` +
      `- Ghi chú ai đề cập vấn đề gì (nếu rõ ràng).\n` +
      `- KHÔNG sáng tạo thêm thông tin ngoài nội dung chat.\n\n` +
      `[LỊCH SỬ TIN NHẮN]\n${chatLog}`;

    this.logger.debug(
      `Summarizing ${activeMessages.length} messages from group=${groupId}`,
    );

    // Step 4: Gọi Groq
    const summary = await this.groq.complete(
      systemPrompt,
      'Hãy tóm tắt cuộc trò chuyện trên.',
    );

    return {
      summary,
      messagesFetched: activeMessages.length,
    };
  }
}
