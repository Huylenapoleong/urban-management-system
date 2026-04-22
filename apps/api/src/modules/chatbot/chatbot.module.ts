import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { KnowledgeRepository } from './repositories/knowledge.repository';
import { GroqClientService } from './services/groq-client.service';
import { ChatbotPrivacyService } from './services/chatbot-privacy.service';
import { GroupChatSummaryService } from './services/group-chat-summary.service';
import { ReportGeneratorService } from './services/report-generator.service';

/**
 * ChatbotModule — Phase 2
 *
 * Dependencies (global từ InfrastructureModule):
 *   - UrbanTableRepository, AppConfigService, CircuitBreakerService
 *
 * Rate Limiting:
 *   - ThrottlerModule cấu hình default 70 requests / phút
 *   - Controller override được qua @Throttle()
 *
 * New services:
 *   - ChatbotPrivacyService: kiểm tra RBAC + Group membership
 *   - GroupChatSummaryService: tóm tắt group chat cho Officer
 *   - ReportGeneratorService: phân tích reports cho Officer
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,  // 60 giây
        limit: 70,   // 70 requests per window
      },
    ]),
  ],
  controllers: [ChatbotController],
  providers: [
    ChatbotService,
    GroqClientService,
    KnowledgeRepository,
    ChatbotPrivacyService,
    GroupChatSummaryService,
    ReportGeneratorService,
  ],
})
export class ChatbotModule {}
