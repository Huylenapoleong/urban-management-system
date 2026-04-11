import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticatedUser, JwtClaims } from '@urban/shared-types';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentAuthClaims } from '../../common/decorators/current-auth-claims.decorator';
import { SkipResponseEnvelope } from '../../common/decorators/skip-response-envelope.decorator';
import { ChatbotService } from './chatbot.service';
import type { ChatbotAnswerDto } from './dto/chatbot-answer.dto';
import { ChatbotAskDto } from './dto/chatbot-ask.dto';
import { OfficerSummarizeDto } from './dto/officer-summarize.dto';
import { OfficerGenerateReportDto } from './dto/officer-report.dto';
import { GroupChatSummaryService } from './services/group-chat-summary.service';
import { ReportGeneratorService } from './services/report-generator.service';

/**
 * Chatbot Controller — Phase 2
 *
 * Endpoints:
 *   1. POST /chatbot/ask (Public) — Citizen hỏi luật (JSON response)
 *   2. POST /chatbot/ask/stream (Public) — Citizen hỏi luật (SSE streaming)
 *   3. POST /chatbot/officer/summarize-group (JWT) — Tóm tắt group chat
 *   4. POST /chatbot/officer/generate-report (JWT) — Phân tích reports
 *
 * Rate Limiting: 10 requests / 60 giây / IP (áp dụng cho /ask endpoint)
 */
@ApiTags('chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly groupChatSummaryService: GroupChatSummaryService,
    private readonly reportGeneratorService: ReportGeneratorService,
  ) {}

  // ─── Public Endpoints (Citizen) ─────────────────────────────────────────────

  @Post('ask')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Gửi câu hỏi đến AI Chatbot pháp luật đô thị',
    description:
      'Nhận câu hỏi bằng tiếng Việt, tìm kiếm điều luật liên quan từ DynamoDB (Vector Search / Keyword), ' +
      'và trả về câu trả lời được tổng hợp bởi Llama (Groq). ' +
      'Rate limited: 10 req/phút/IP. Endpoint public, không cần đăng nhập.',
  })
  async ask(@Body() dto: ChatbotAskDto): Promise<ChatbotAnswerDto> {
    return this.chatbotService.ask(dto.question);
  }

  /**
   * SSE Streaming endpoint — trả về từng chunk response qua Server-Sent Events.
   *
   * Client cần:
   *   - Set Accept: text/event-stream
   *   - Read chunks dạng: data: <text_chunk>\n\n
   *   - Kết thúc bởi: data: [DONE]\n\n
   */
  @Post('ask/stream')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @SkipResponseEnvelope()
  @ApiOperation({
    summary: 'Gửi câu hỏi và nhận phản hồi streaming (SSE)',
    description:
      'Giống /ask nhưng trả về từng chunk text qua Server-Sent Events. ' +
      'Phù hợp cho giao diện chat real-time hiển thị từng từ. ' +
      'Rate limited: 10 req/phút/IP.',
  })
  async askStream(
    @Body() dto: ChatbotAskDto,
    @Res() res: Response,
  ): Promise<void> {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const chunk of this.chatbotService.askStream(dto.question)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.end();
    }
  }

  // ─── Officer Endpoints (Require JWT) ────────────────────────────────────────

  @Post('officer/summarize-group')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tóm tắt tin nhắn nhóm (Cán bộ)',
    description:
      'Lấy N tin nhắn gần nhất của group chat, gửi AI tóm tắt. ' +
      'Yêu cầu JWT Token (Cán bộ) và phải là thành viên của group. ' +
      'Trả về Markdown tóm tắt.',
  })
  async summarizeGroup(
    @Body() dto: OfficerSummarizeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ summary: string; messagesFetched: number }> {
    return this.groupChatSummaryService.summarize(
      user.id,
      user.role,
      dto.groupId,
      dto.messageCount,
    );
  }

  @Post('officer/generate-report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Phân tích phản ánh và tạo báo cáo tổng hợp (Cán bộ)',
    description:
      'Lấy danh sách Reports theo filter, gửi AI phân tích mức độ nghiêm trọng, ' +
      'trả ra Markdown thống kê. Yêu cầu JWT Token (Cán bộ).',
  })
  async generateReport(
    @Body() dto: OfficerGenerateReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ analysis: string; reportsAnalyzed: number }> {
    return this.reportGeneratorService.generateReport(user.id, user.role, {
      status: dto.status,
      locationCode: dto.locationCode,
      category: dto.category,
      groupId: dto.groupId,
    });
  }
}
