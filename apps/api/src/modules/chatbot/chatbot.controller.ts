import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ChatbotService } from './chatbot.service';
import type { ChatbotAnswerDto } from './dto/chatbot-answer.dto';
import { ChatbotAskDto } from './dto/chatbot-ask.dto';

/**
 * Endpoint public — không yêu cầu JWT.
 * @Public() bypass JwtAuthGuard global (theo cơ chế IS_PUBLIC_KEY trong hệ thống).
 */
@ApiTags('chatbot')
@Controller('chatbot')
@Public()
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gửi câu hỏi đến AI Chatbot pháp luật đô thị',
    description:
      'Nhận câu hỏi bằng tiếng Việt, tìm kiếm điều luật liên quan từ DynamoDB, ' +
      'và trả về câu trả lời được tổng hợp bởi Llama (Groq). Endpoint public, không cần đăng nhập.',
  })
  async ask(@Body() dto: ChatbotAskDto): Promise<ChatbotAnswerDto> {
    return this.chatbotService.ask(dto.question);
  }
}
