import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../../infrastructure/dynamodb/urban-table.repository';
import { GroqClientService } from './groq-client.service';
import { ChatbotPrivacyService } from './chatbot-privacy.service';
import type { StoredReport } from '../../../common/storage-records';

export interface ReportAnalysisFilters {
  status?: string;
  locationCode?: string;
  category?: string;
  groupId?: string;
}

/**
 * Report Generator Service — Officer Assistant Feature.
 *
 * Flow:
 *   1. Kiểm tra Privacy (Role)
 *   2. Lấy danh sách Reports theo filter
 *   3. Gửi Groq phân tích mức độ nghiêm trọng
 *   4. Trả ra Markdown thống kê
 */
@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly config: AppConfigService,
    private readonly groq: GroqClientService,
    private readonly privacy: ChatbotPrivacyService,
  ) {}

  /**
   * Phân tích reports và tạo báo cáo tổng hợp.
   *
   * @param userId - ID user đang yêu cầu
   * @param userRole - Role
   * @param filters - Bộ lọc (status, locationCode, category, groupId)
   */
  async generateReport(
    userId: string,
    userRole: string,
    filters: ReportAnalysisFilters,
  ): Promise<{ analysis: string; reportsAnalyzed: number }> {
    // Step 1: Privacy check — chỉ officer
    this.privacy.ensureOfficerRole(userRole);

    // Step 2: Lấy reports từ DynamoDB
    const allReports = await this.repository.scanAll<StoredReport>(
      this.config.dynamodbReportsTableName,
    );

    // Lọc theo bộ lọc
    const filtered = allReports
      .filter((r) => r.entityType === 'REPORT')
      .filter((r) => !r.deletedAt)
      .filter((r) => {
        if (filters.status && r.status !== filters.status) return false;
        if (filters.locationCode && r.locationCode !== filters.locationCode)
          return false;
        if (filters.category && r.category !== filters.category) return false;
        if (filters.groupId && r.groupId !== filters.groupId) return false;
        return true;
      });

    if (filtered.length === 0) {
      return {
        analysis: 'Không tìm thấy phản ánh nào phù hợp với tiêu chí lọc.',
        reportsAnalyzed: 0,
      };
    }

    // Step 3: Xây dựng prompt
    const reportSummaries = filtered
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50) // Giới hạn 50 reports để giữ prompt nhỏ
      .map(
        (r, i) =>
          `[${i + 1}] ID: ${r.reportId}\n` +
          `  Tiêu đề: ${r.title}\n` +
          `  Trạng thái: ${r.status} | Ưu tiên: ${r.priority}\n` +
          `  Phân loại: ${r.category} | Khu vực: ${r.locationCode}\n` +
          `  Mô tả: ${r.description || '(không có)'}\n` +
          `  Ngày tạo: ${r.createdAt}`,
      )
      .join('\n\n');

    const systemPrompt =
      `Bạn là trợ lý AI phân tích phản ánh đô thị.\n` +
      `Nhiệm vụ: Phân tích danh sách phản ánh/báo cáo bên dưới và tạo báo cáo tổng hợp.\n` +
      `Yêu cầu:\n` +
      `- Trả lời bằng tiếng Việt, định dạng Markdown.\n` +
      `- Thống kê tổng số phản ánh theo trạng thái, phân loại, mức ưu tiên.\n` +
      `- Đánh giá mức độ nghiêm trọng tổng thể.\n` +
      `- Đề xuất ưu tiên xử lý (vấn đề nào cần giải quyết trước).\n` +
      `- Liệt kê các vấn đề nổi bật.\n` +
      `- KHÔNG sáng tạo thêm thông tin ngoài dữ liệu.\n\n` +
      `[DANH SÁCH PHẢN ÁNH]\n${reportSummaries}`;

    this.logger.debug(
      `Analyzing ${filtered.length} reports (filters: ${JSON.stringify(filters)})`,
    );

    // Step 4: Gọi Groq
    const analysis = await this.groq.complete(
      systemPrompt,
      'Hãy phân tích và tạo báo cáo tổng hợp từ danh sách phản ánh trên.',
    );

    return {
      analysis,
      reportsAnalyzed: filtered.length,
    };
  }
}
