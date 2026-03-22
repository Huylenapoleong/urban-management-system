import { Injectable, Logger } from '@nestjs/common';
import type { ChatbotAnswerDto } from './dto/chatbot-answer.dto';
import { KnowledgeRepository } from './repositories/knowledge.repository';
import { GroqClientService } from './services/groq-client.service';

/**
 * Map keyword → category cho bước Retrieval.
 * Mở rộng bằng cách thêm entry mới — không cần thay đổi logic khác.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  land: [
    'đất', 'đất đai', 'thửa đất', 'quyền sử dụng đất',
    'giấy chứng nhận', 'sổ đỏ', 'sổ hồng', 'địa chính',
    'chuyển nhượng đất', 'thuê đất',
  ],
  construction: [
    'xây dựng', 'giấy phép xây dựng', 'công trình', 'nhà ở',
    'cải tạo', 'sửa chữa nhà', 'phá dỡ', 'thiết kế',
  ],
  environment: [
    'môi trường', 'ô nhiễm', 'rác thải', 'nước thải',
    'khí thải', 'tiếng ồn', 'đánh giá tác động môi trường', 'EIA',
  ],
  urban: [
    'đô thị', 'quy hoạch', 'hạ tầng', 'khu đô thị', 'vỉa hè',
    'lòng đường', 'chiếu sáng', 'cây xanh đô thị',
  ],
  administrative: [
    'hành chính', 'thủ tục', 'hộ khẩu', 'khai sinh', 'đăng ký',
    'chứng thực', 'công chứng', 'ủy quyền',
  ],
};

const NO_DATA_FALLBACK =
  'Hiện tại chưa có thông tin pháp lý phù hợp với câu hỏi của bạn trong hệ thống. ' +
  'Vui lòng liên hệ trực tiếp cơ quan quản lý đô thị hoặc tổ chức tư vấn pháp luật để được hỗ trợ.';

/**
 * Điều phối toàn bộ luồng RAG:
 *   1. Retrieve — query DynamoDB theo category (hoặc scan nếu không detect được)
 *   2. Augment — xây dựng system prompt từ danh sách điều luật tìm được
 *   3. Generate — gửi đến Groq Llama để tổng hợp câu trả lời
 */
@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    private readonly knowledge: KnowledgeRepository,
    private readonly groq: GroqClientService,
  ) {}

  async ask(question: string): Promise<ChatbotAnswerDto> {
    // === Step 1: Retrieve ===
    const category = this.detectCategory(question);
    this.logger.debug(`Question: "${question}" → category: ${category ?? 'none (fallback scan)'}`);

    const docs = category
      ? await this.knowledge.findByCategory(category)
      : await this.knowledge.scanAll();

    // Nếu DB chưa có dữ liệu hoặc không tìm thấy gì
    if (docs.length === 0) {
      this.logger.warn(`No knowledge documents found for question: "${question}"`);
      return { answer: NO_DATA_FALLBACK, sources: [] };
    }

    // === Step 2: Augment — xây context từ các điều luật ===
    const context = docs
      .map((d, i) => `[${i + 1}] ${d.title}:\n${d.content}`)
      .join('\n\n---\n\n');

    const systemPrompt =
      `Bạn là trợ lý AI tư vấn pháp luật đô thị của hệ thống Urban Management System.\n` +
      `Nhiệm vụ: Dựa HOÀN TOÀN vào thông tin pháp lý sau đây để trả lời câu hỏi của người dùng.\n` +
      `Quy tắc quan trọng:\n` +
      `- Chỉ sử dụng thông tin trong phần [NGỮ CẢNH PHÁP LÝ] bên dưới.\n` +
      `- Nếu thông tin không đủ, hãy nói rõ và đề nghị người dùng liên hệ cơ quan có thẩm quyền.\n` +
      `- KHÔNG sáng tạo hoặc thêm thông tin ngoài ngữ cảnh.\n` +
      `- Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng, dễ hiểu.\n\n` +
      `[NGỮ CẢNH PHÁP LÝ]\n${context}`;

    // === Step 3: Generate ===
    const answer = await this.groq.complete(systemPrompt, question);

    return {
      answer,
      sources: docs.map((d) => ({ title: d.title, source: d.source })),
    };
  }

  /**
   * Detect category từ câu hỏi bằng keyword matching.
   * Returns null nếu không match được category nào.
   */
  private detectCategory(question: string): string | null {
    const lower = question.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return category;
      }
    }

    return null;
  }
}
