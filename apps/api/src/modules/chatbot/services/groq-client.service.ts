import { Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';
import { AppConfigService } from '../../../infrastructure/config/app-config.service';
import { CircuitBreakerService } from '../../../infrastructure/resilience/circuit-breaker.service';

/**
 * Wrapper quanh Groq SDK chính thức.
 * Được bảo vệ bởi CircuitBreakerService với key riêng 'groq' (tách biệt DynamoDB).
 *
 * Khi Groq API liên tục lỗi/timeout, circuit sẽ mở và ném ServiceUnavailableException
 * ngay lập tức mà không cần chờ timeout, giúp bảo vệ server.
 */
@Injectable()
export class GroqClientService {
  private readonly client: Groq;
  private readonly logger = new Logger(GroqClientService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {
    this.client = new Groq({
      apiKey: this.config.groqApiKey,
      timeout: this.config.groqTimeoutMs,
    });
  }

  /**
   * Gọi Groq Llama API với system prompt (context RAG) và user message.
   *
   * temperature=0.3: thấp hơn mặc định → trả lời xác định hơn, ít "ảo giác" —
   * phù hợp cho lĩnh vực pháp luật, tránh sáng tạo sai sự thật.
   */
  async complete(systemPrompt: string, userMessage: string): Promise<string> {
    return this.circuitBreaker.execute('groq', 'Groq AI', async () => {
      this.logger.debug(
        `Calling Groq (model=${this.config.groqModel}, promptLen=${systemPrompt.length})`,
      );

      const response = await this.client.chat.completions.create({
        model: this.config.groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content ?? '';

      if (!content.trim()) {
        this.logger.warn(
          'Groq returned an empty response — using fallback message',
        );
        return 'Xin lỗi, tôi không thể tạo câu trả lời vào lúc này. Vui lòng thử lại sau.';
      }

      return content;
    });
  }

  /**
   * Streaming variant — trả về AsyncGenerator yield từng chunk text.
   * Dùng cho SSE (Server-Sent Events) endpoint.
   *
   * Circuit breaker bảo vệ bước khởi tạo stream.
   * Khi stream đã bắt đầu, các chunk sẽ được yield trực tiếp.
   */
  async *streamRAGResponse(
    systemPrompt: string,
    userMessage: string,
  ): AsyncGenerator<string, void, unknown> {
    const stream = await this.circuitBreaker.execute(
      'groq',
      'Groq AI (stream)',
      async () => {
        this.logger.debug(
          `Streaming Groq (model=${this.config.groqModel}, promptLen=${systemPrompt.length})`,
        );

        return this.client.chat.completions.create({
          model: this.config.groqModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 1024,
          temperature: 0.3,
          stream: true,
        });
      },
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }
}
