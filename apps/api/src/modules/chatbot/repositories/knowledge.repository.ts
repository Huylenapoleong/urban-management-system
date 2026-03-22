import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../../infrastructure/dynamodb/urban-table.repository';
import type { KnowledgeDocument, StoredKnowledgeDocument } from '../types/knowledge-document.types';

@Injectable()
export class KnowledgeRepository {
  constructor(
    private readonly repo: UrbanTableRepository,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Query theo category qua GSI "category-index".
   * GSI PK = field `category` trực tiếp (e.g. "land", "construction").
   */
  async findByCategory(
    category: string,
    limit?: number,
  ): Promise<KnowledgeDocument[]> {
    const maxDocs = limit ?? this.config.chatbotMaxContextDocs;

    const records = await this.repo.queryByGsi1<StoredKnowledgeDocument>(
      this.config.dynamodbKnowledgeTableName,
      'category-index',  // ← tên index đúng
      category,          // ← giá trị `category` trực tiếp, không cần prefix
      { limit: maxDocs },
    );

    return records.map(KnowledgeRepository.toDocument);
  }

  /**
   * Fallback scan khi không detect được category.
   */
  async scanAll(): Promise<KnowledgeDocument[]> {
    const records = await this.repo.scanAll<StoredKnowledgeDocument>(
      this.config.dynamodbKnowledgeTableName,
    );

    return records
      .slice(0, this.config.chatbotMaxContextDocs * 2)
      .map(KnowledgeRepository.toDocument);
  }

  private static toDocument(r: StoredKnowledgeDocument): KnowledgeDocument {
    return {
      id: r.SK,
      title: r.title,
      content: r.content,
      category: r.category,
      source: r.source,
    };
  }
}
