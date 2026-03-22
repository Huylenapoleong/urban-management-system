import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { KnowledgeRepository } from './repositories/knowledge.repository';
import { GroqClientService } from './services/groq-client.service';

/**
 * ChatbotModule — độc lập, không cần import thêm gì từ InfrastructureModule
 * vì các dependency (UrbanTableRepository, AppConfigService, CircuitBreakerService)
 * đã được khai báo là global provider trong InfrastructureModule.
 */
@Module({
  controllers: [ChatbotController],
  providers: [ChatbotService, GroqClientService, KnowledgeRepository],
})
export class ChatbotModule {}
