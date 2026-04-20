import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../../infrastructure/dynamodb/urban-table.repository';
import type { KnowledgeDocument, StoredKnowledgeDocument } from '../types/knowledge-document.types';

@Injectable()
export class KnowledgeRepository {
  private readonly logger = new Logger(KnowledgeRepository.name);

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

    const records = await this.repo.queryByIndex<StoredKnowledgeDocument>(
      this.config.dynamodbKnowledgeTableName,
      'category-index',
      'category',
      'docId',
      category,
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

  /**
   * Vector Search — In-memory Cosine Similarity.
   *
   * Fetch toàn bộ documents có embedding từ DynamoDB vào RAM,
   * tính Cosine Similarity giữa queryEmbedding và mỗi document embedding,
   * trả về K documents gần nhất.
   *
   * Phù hợp với dự án quy mô nhỏ (< 1000 documents).
   *
   * @param queryEmbedding - Vector embedding của câu hỏi user
   * @param topK - Số lượng documents gần nhất cần trả về
   * @param minScore - Ngưỡng similarity tối thiểu (0-1)
   * @returns Documents sorted by similarity descending, kèm score
   */
  async findBySimilarity(
    queryEmbedding: number[],
    topK?: number,
    minScore: number = 0.3,
  ): Promise<Array<KnowledgeDocument & { score: number }>> {
    const maxDocs = topK ?? this.config.chatbotMaxContextDocs;

    // Fetch all documents from DynamoDB
    const records = await this.repo.scanAll<StoredKnowledgeDocument>(
      this.config.dynamodbKnowledgeTableName,
    );

    // Lọc documents có embedding
    const withEmbeddings = records.filter(
      (r) => r.embedding && Array.isArray(r.embedding) && r.embedding.length > 0,
    );

    if (withEmbeddings.length === 0) {
      this.logger.warn(
        'No documents with embeddings found — falling back to scanAll',
      );
      return this.scanAll().then((docs) =>
        docs.map((d) => ({ ...d, score: 0 })),
      );
    }

    this.logger.debug(
      `Computing cosine similarity across ${withEmbeddings.length} documents`,
    );

    // Tính Cosine Similarity cho mỗi document
    const scored = withEmbeddings
      .map((r) => ({
        document: KnowledgeRepository.toDocument(r),
        score: KnowledgeRepository.cosineSimilarity(
          queryEmbedding,
          r.embedding!,
        ),
      }))
      .filter((item) => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxDocs);

    return scored.map((item) => ({
      ...item.document,
      score: item.score,
    }));
  }

  /**
   * Tính Cosine Similarity giữa 2 vectors.
   * cos(A, B) = (A · B) / (|A| × |B|)
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
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

