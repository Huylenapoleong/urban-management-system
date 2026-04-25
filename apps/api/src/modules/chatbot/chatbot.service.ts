import { Injectable, Logger } from '@nestjs/common';
import type { UserRole } from '@urban/shared-constants';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import type { ChatbotAnswerDto } from './dto/chatbot-answer.dto';
import { KnowledgeRepository } from './repositories/knowledge.repository';
import { GroqClientService } from './services/groq-client.service';
import type { KnowledgeDocument } from './types/knowledge-document.types';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Ý định (intent) được phân loại từ câu hỏi user.
 */
type ChatIntent = 'LAW_QUERY' | 'SUMMARIZE' | 'REPORT' | 'GENERAL';

interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
}

// ─── Keyword Constants ────────────────────────────────────────────────────────

/**
 * Map keyword → category cho bước Retrieval (fallback khi không có embedding).
 * Mở rộng bằng cách thêm entry mới — không cần thay đổi logic khác.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  land: [
    'đất',
    'đất đai',
    'thửa đất',
    'quyền sử dụng đất',
    'giấy chứng nhận',
    'sổ đỏ',
    'sổ hồng',
    'địa chính',
    'chuyển nhượng đất',
    'thuê đất',
  ],
  construction: [
    'xây dựng',
    'giấy phép xây dựng',
    'công trình',
    'nhà ở',
    'cải tạo',
    'sửa chữa nhà',
    'phá dỡ',
    'thiết kế',
  ],
  environment: [
    'môi trường',
    'ô nhiễm',
    'rác thải',
    'nước thải',
    'khí thải',
    'tiếng ồn',
    'đánh giá tác động môi trường',
    'EIA',
  ],
  urban: [
    'đô thị',
    'quy hoạch',
    'hạ tầng',
    'khu đô thị',
    'vỉa hè',
    'lòng đường',
    'chiếu sáng',
    'cây xanh đô thị',
  ],
  administrative: [
    'hành chính',
    'thủ tục',
    'hộ khẩu',
    'khai sinh',
    'đăng ký',
    'chứng thực',
    'công chứng',
    'ủy quyền',
  ],
};

const NO_DATA_FALLBACK =
  'Hiện tại chưa có thông tin pháp lý phù hợp với câu hỏi của bạn trong hệ thống. ' +
  'Vui lòng liên hệ trực tiếp cơ quan quản lý đô thị hoặc tổ chức tư vấn pháp luật để được hỗ trợ.';

/**
 * Guardrails — siết System Prompt để AI chỉ trả lời câu hỏi liên quan đô thị.
 */
const GUARDRAILS_RULE =
  'QUAN TRỌNG: Bạn chỉ được phép trả lời các câu hỏi liên quan đến quy định, thủ tục quản lý đô thị, ' +
  'xây dựng, đất đai, môi trường, hạ tầng. ' +
  'Nếu câu hỏi không liên quan (ví dụ: công thức nấu ăn, chính trị, code lập trình...), ' +
  'hãy từ chối trả lời lịch sự và hướng dẫn người dùng đặt câu hỏi đúng chủ đề.';

/**
 * Điều phối toàn bộ luồng RAG nâng cấp Phase 2:
 *   1. Intent Classification — xác định ý định user
 *   2. Dynamic System Prompting — tạo prompt phù hợp theo role + intent
 *   3. Vector Search (khi có embedding) hoặc Keyword Match
 *   4. Smart Routing — gợi ý bộ phận hỗ trợ khi không tìm thấy luật
 *   5. Guardrails — siết prompt chống sáng tạo ngoài phạm vi
 */
@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private embeddingService: EmbeddingService | null = null;

  constructor(
    private readonly knowledge: KnowledgeRepository,
    private readonly groq: GroqClientService,
    private readonly config: AppConfigService,
    private readonly repository: UrbanTableRepository,
  ) {}

  private embeddingInitAttempted = false;

  /**
   * Lazy-initialize embedding service từ @xenova/transformers.
   * Chỉ gọi 1 lần duy nhất khi có request đầu tiên cần vector search.
   * Không bắt buộc — nếu không load được thì fallback về keyword match.
   */
  private async ensureEmbeddingService(): Promise<void> {
    if (this.embeddingInitAttempted) return;
    this.embeddingInitAttempted = true;

    try {
      const { pipeline } = await import('@xenova/transformers');
      const extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
      );

      this.embeddingService = {
        generateEmbedding: async (text: string): Promise<number[]> => {
          const output = await extractor(text, {
            pooling: 'mean',
            normalize: true,
          });
          return Array.from(output.data as Float32Array);
        },
      };

      this.logger.log('Embedding service initialized (all-MiniLM-L6-v2)');
    } catch (error) {
      this.logger.warn(
        'Failed to initialize embedding service — will use keyword matching: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  // ─── Main Entry Point ───────────────────────────────────────────────────────

  /**
   * Xử lý câu hỏi với Dynamic Prompting dựa trên role.
   *
   * @param question - Câu hỏi user
   * @param userRole - Role (nếu đã đăng nhập): CITIZEN | WARD_OFFICER | PROVINCE_OFFICER | ADMIN
   */
  async ask(question: string, userRole?: UserRole): Promise<ChatbotAnswerDto> {
    const intent = this.classifyIntent(question);
    this.logger.debug(
      `Question: "${question}" → intent: ${intent}, role: ${userRole ?? 'anonymous'}`,
    );

    // Intent: SUMMARIZE hoặc REPORT → cần Officer, xử lý ở controller/service riêng
    // Ở đây chỉ xử lý LAW_QUERY và GENERAL
    return this.handleLawQuery(question, userRole);
  }

  /**
   * Streaming variant — trả về AsyncGenerator cho SSE.
   */
  async *askStream(
    question: string,
    userRole?: UserRole,
  ): AsyncGenerator<string, void, unknown> {
    const intent = this.classifyIntent(question);
    this.logger.debug(
      `[Stream] Question: "${question}" → intent: ${intent}, role: ${userRole ?? 'anonymous'}`,
    );

    // Retrieve documents
    const docs = await this.retrieveDocuments(question);

    if (docs.length === 0) {
      // Smart Routing — try to route user
      const routingResponse = await this.generateSmartRouting(question);
      yield routingResponse;
      return;
    }

    // Build prompt
    const systemPrompt = this.buildSystemPrompt(docs, userRole);

    // Stream response
    yield* this.groq.streamRAGResponse(systemPrompt, question);
  }

  // ─── Core RAG Logic ─────────────────────────────────────────────────────────

  /**
   * Xử lý câu hỏi về điều luật — luồng chính cho cả Dân và Cán bộ.
   */
  private async handleLawQuery(
    question: string,
    userRole?: UserRole,
  ): Promise<ChatbotAnswerDto> {
    // === Step 1: Retrieve ===
    const docs = await this.retrieveDocuments(question);

    // Nếu không tìm thấy → Smart Routing
    if (docs.length === 0) {
      this.logger.warn(`No relevant documents for: "${question}"`);
      const routingAnswer = await this.generateSmartRouting(question);
      return { answer: routingAnswer, sources: [] };
    }

    // === Step 2: Augment — Dynamic System Prompt ===
    const systemPrompt = this.buildSystemPrompt(docs, userRole);

    // === Step 3: Generate ===
    let answer: string;

    try {
      answer = await this.groq.complete(systemPrompt, question);
    } catch (error) {
      this.logger.error(
        `Groq completion failed, using fallback summary for question: "${question}"`,
        error instanceof Error ? error.stack : String(error),
      );
      answer = this.buildLocalFallbackAnswer(question, docs);
    }

    return {
      answer,
      sources: docs.map((d) => ({ title: d.title, source: d.source })),
    };
  }

  /**
   * Fallback local response used when external LLM provider is unavailable.
   * Keeps API response successful so client chat UX does not break.
   */
  private buildLocalFallbackAnswer(
    question: string,
    docs: KnowledgeDocument[],
  ): string {
    const topDocs = docs.slice(0, 3);

    if (topDocs.length === 0) {
      return NO_DATA_FALLBACK;
    }

    const highlights = topDocs
      .map((doc, index) => {
        const normalized = String(doc.content || '')
          .replace(/\s+/g, ' ')
          .trim();
        const preview = normalized.slice(0, 180);
        const suffix = normalized.length > 180 ? '...' : '';
        return `${index + 1}. ${doc.title}: ${preview}${suffix}`;
      })
      .join('\n');

    return (
      'He thong AI dang tam thoi qua tai hoac chua cau hinh key hop le. ' +
      'Duoi day la thong tin tham khao tu co so tri thuc de ban xem nhanh:\n\n' +
      highlights +
      '\n\nBan co the gui lai cau hoi sau it phut de nhan cau tra loi chi tiet hon.'
    );
  }

  // ─── Document Retrieval ─────────────────────────────────────────────────────

  /**
   * Retrieve documents ưu tiên Vector Search, fallback về Keyword Match.
   */
  private async retrieveDocuments(
    question: string,
  ): Promise<KnowledgeDocument[]> {
    // Lazy init embedding service (chỉ lần đầu)
    await this.ensureEmbeddingService();

    // Thử Vector Search trước (nếu embedding service available)
    if (this.embeddingService) {
      try {
        const queryEmbedding =
          await this.embeddingService.generateEmbedding(question);
        const results = await this.knowledge.findBySimilarity(queryEmbedding);

        if (results.length > 0) {
          this.logger.debug(
            `Vector search found ${results.length} docs (top score: ${results[0].score.toFixed(3)})`,
          );
          return results;
        }
      } catch (error) {
        this.logger.warn(
          'Vector search failed, falling back to keyword: ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    // Fallback: Keyword-based category match
    const category = this.detectCategory(question);
    this.logger.debug(
      `Keyword retrieval → category: ${category ?? 'none (fallback scan)'}`,
    );

    return category
      ? this.knowledge.findByCategory(category)
      : this.knowledge.scanAll();
  }

  // ─── Smart Routing ──────────────────────────────────────────────────────────

  /**
   * Khi RAG không tìm thấy luật phù hợp, thay vì "Tôi không biết",
   * Agent sẽ query Groups/Users để gợi ý bộ phận hỗ trợ phù hợp.
   */
  private async generateSmartRouting(question: string): Promise<string> {
    try {
      // Lấy danh sách groups (bộ phận hỗ trợ)
      const groups = await this.repository.scanAll<{
        entityType: string;
        groupName: string;
        groupType: string;
        description?: string;
        locationCode: string;
        deletedAt: string | null;
      }>(this.config.dynamodbGroupsTableName);

      const activeGroups = groups
        .filter((g) => g.entityType === 'GROUP_METADATA' && !g.deletedAt)
        .map(
          (g) =>
            `- ${g.groupName} (${g.groupType}, khu vực: ${g.locationCode})${
              g.description ? `: ${g.description}` : ''
            }`,
        )
        .join('\n');

      if (!activeGroups) {
        return NO_DATA_FALLBACK;
      }

      const routingPrompt =
        `Bạn là trợ lý điều hướng của hệ thống quản lý đô thị.\n` +
        `Người dùng hỏi một câu hỏi mà hệ thống không có điều luật liên quan.\n` +
        `Nhiệm vụ: Dựa trên danh sách các nhóm/bộ phận bên dưới, gợi ý nhóm/bộ phận phù hợp nhất ` +
        `để người dùng liên hệ được hỗ trợ.\n` +
        `Trả lời bằng tiếng Việt, thân thiện, ngắn gọn.\n` +
        `Nếu không có nhóm phù hợp, hướng dẫn người dùng liên hệ UBND phường/xã.\n\n` +
        `[DANH SÁCH NHÓM/BỘ PHẬN]\n${activeGroups}`;

      return await this.groq.complete(routingPrompt, question);
    } catch (error) {
      this.logger.warn(
        'Smart routing failed: ' +
          (error instanceof Error ? error.message : String(error)),
      );
      return NO_DATA_FALLBACK;
    }
  }

  // ─── Dynamic System Prompt ──────────────────────────────────────────────────

  /**
   * Xây dựng System Prompt động dựa trên role và documents.
   *
   * - CITIZEN: chỉ nhận context từ KnowledgeBase
   * - OFFICER: có thể kích hoạt Agent đọc Messages/Reports (qua endpoint riêng)
   * - Guardrails luôn được áp dụng
   */
  private buildSystemPrompt(
    docs: KnowledgeDocument[],
    userRole?: UserRole,
  ): string {
    const context = docs
      .map((d, i) => `[${i + 1}] ${d.title}:\n${d.content}`)
      .join('\n\n---\n\n');

    const roleInstruction = this.buildRoleInstruction(userRole);

    return (
      `Bạn là trợ lý AI tư vấn pháp luật đô thị của hệ thống Urban Management System.\n` +
      `${roleInstruction}\n` +
      `Quy tắc quan trọng:\n` +
      `- Chỉ sử dụng thông tin trong phần [NGỮ CẢNH PHÁP LÝ] bên dưới.\n` +
      `- Nếu thông tin không đủ, hãy nói rõ và đề nghị người dùng liên hệ cơ quan có thẩm quyền.\n` +
      `- KHÔNG sáng tạo hoặc thêm thông tin ngoài ngữ cảnh.\n` +
      `- Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng, dễ hiểu.\n` +
      `- ${GUARDRAILS_RULE}\n\n` +
      `[NGỮ CẢNH PHÁP LÝ]\n${context}`
    );
  }

  /**
   * Tạo instruction dựa trên role user.
   */
  private buildRoleInstruction(role?: UserRole): string {
    if (!role || role === 'CITIZEN') {
      return (
        'Nhiệm vụ: Dựa HOÀN TOÀN vào thông tin pháp lý để trả lời câu hỏi của người dân. ' +
        'Trả lời đơn giản, dễ hiểu cho người dân sử dụng.'
      );
    }

    // WARD_OFFICER, PROVINCE_OFFICER, ADMIN
    return (
      'Nhiệm vụ: Dựa HOÀN TOÀN vào thông tin pháp lý để hỗ trợ Cán bộ. ' +
      'Có thể trả lời chi tiết hơn, bao gồm trích dẫn điều khoản cụ thể.'
    );
  }

  // ─── Intent Classification ──────────────────────────────────────────────────

  /**
   * Phân loại ý định (intent) từ câu hỏi user.
   *
   * - LAW_QUERY: hỏi về luật, quy định, thủ tục
   * - SUMMARIZE: yêu cầu tóm tắt tin nhắn nhóm
   * - REPORT: yêu cầu tóm tắt/thống kê báo cáo
   * - GENERAL: câu hỏi chung
   */
  private classifyIntent(question: string): ChatIntent {
    const lower = question.toLowerCase();

    // Detect summarize intent
    const summarizeKeywords = [
      'tóm tắt',
      'tổng kết',
      'summary',
      'tóm lược',
      'tin nhắn nhóm',
      'cuộc trò chuyện',
      'chat nhóm',
    ];
    if (summarizeKeywords.some((kw) => lower.includes(kw))) {
      return 'SUMMARIZE';
    }

    // Detect report intent
    const reportKeywords = [
      'báo cáo',
      'thống kê',
      'phản ánh',
      'report',
      'phân tích báo cáo',
      'tổng hợp phản ánh',
    ];
    if (reportKeywords.some((kw) => lower.includes(kw))) {
      return 'REPORT';
    }

    // Default: LAW_QUERY
    return 'LAW_QUERY';
  }

  // ─── Keyword Detection (Legacy Fallback) ────────────────────────────────────

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
