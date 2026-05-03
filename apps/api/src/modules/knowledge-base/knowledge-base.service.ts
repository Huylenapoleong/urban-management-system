import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { createUlid, nowIso } from '@urban/shared-utils';
import {
    buildPaginatedResponse,
    paginateSortedItems,
} from '../../common/pagination';
import {
    ensureObject,
    optionalQueryString,
    optionalString,
    parseLimit,
    requiredString,
} from '../../common/validation';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import {
    KNOWLEDGE_DOCUMENT_PK,
    KNOWLEDGE_DOCUMENT_STATUSES,
    type KnowledgeDocumentMetadata,
    type KnowledgeDocumentStatus,
    type KnowledgeDocumentSummary,
    type StoredKnowledgeDocumentRecord,
} from './knowledge-base.types';

const CATEGORY_INDEX_NAME = 'category-index';
const MAX_CATEGORY_LENGTH = 50;
const MAX_TITLE_LENGTH = 200;
const MAX_SOURCE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 2000;
const MAX_METADATA_LENGTH = 200;
const MAX_SEARCH_LENGTH = 100;
const MAX_EFFECTIVE_DATE_LENGTH = 100;

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly config: AppConfigService,
  ) {}

  async listDocuments(query: Record<string, unknown>) {
    const category = optionalQueryString(query.category, 'category');
    const status = this.parseStatus(optionalQueryString(query.status, 'status'));
    const search = optionalQueryString(query.q, 'q');
    const limit = parseLimit(query.limit);
    const cursor = query.cursor;

    if (category && category.length > MAX_CATEGORY_LENGTH) {
      throw new BadRequestException('category must be at most 50 characters.');
    }

    if (search && search.length > MAX_SEARCH_LENGTH) {
      throw new BadRequestException('q must be at most 100 characters.');
    }

    const records = category
      ? await this.repository.queryByIndex<StoredKnowledgeDocumentRecord>(
          this.config.dynamodbKnowledgeTableName,
          CATEGORY_INDEX_NAME,
          'category',
          'docId',
          category,
          { scanForward: false },
        )
      : await this.repository.scanAll<StoredKnowledgeDocumentRecord>(
          this.config.dynamodbKnowledgeTableName,
        );

    const normalizedSearch = search?.toLowerCase().trim();

    const filtered = records.filter((record) => {
      if (status && (record.status ?? 'ACTIVE') !== status) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        record.title,
        record.content,
        record.source,
        record.metadata?.lawName,
        record.metadata?.chapter,
        record.metadata?.section,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    const { items, nextCursor } = paginateSortedItems(
      filtered,
      limit,
      cursor,
      (record) => this.sortKey(record),
      (record) => record.docId,
    );

    return buildPaginatedResponse(
      items.map((record) => this.toSummary(record)),
      nextCursor,
    );
  }

  async getDocument(docId: string) {
    const record = await this.repository.get<StoredKnowledgeDocumentRecord>(
      this.config.dynamodbKnowledgeTableName,
      KNOWLEDGE_DOCUMENT_PK,
      docId,
    );

    if (!record) {
      throw new NotFoundException('Knowledge document not found.');
    }

    return this.toSummary(record);
  }

  async createDocument(payload: unknown) {
    const body = ensureObject(payload);

    const title = requiredString(body, 'title', {
      maxLength: MAX_TITLE_LENGTH,
      minLength: 1,
    });
    const content = requiredString(body, 'content', {
      maxLength: MAX_CONTENT_LENGTH,
      minLength: 1,
    });
    const category = requiredString(body, 'category', {
      maxLength: MAX_CATEGORY_LENGTH,
      minLength: 1,
    });
    const source = requiredString(body, 'source', {
      maxLength: MAX_SOURCE_LENGTH,
      minLength: 1,
    });
    const status = this.parseStatus(optionalString(body, 'status')) ?? 'ACTIVE';
    const effectiveDate = optionalString(body, 'effectiveDate', {
      maxLength: MAX_EFFECTIVE_DATE_LENGTH,
    });
    const metadata = this.parseMetadata(body.metadata, false);

    if (effectiveDate && Number.isNaN(Date.parse(effectiveDate))) {
      throw new BadRequestException('effectiveDate must be a valid ISO date.');
    }

    const now = nowIso();
    const docId = createUlid();
    const record: StoredKnowledgeDocumentRecord = {
      PK: KNOWLEDGE_DOCUMENT_PK,
      SK: docId,
      entityType: 'KNOWLEDGE_DOCUMENT',
      docId,
      category,
      title,
      content,
      source,
      status,
      metadata: metadata ?? undefined,
      effectiveDate: effectiveDate ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.put(this.config.dynamodbKnowledgeTableName, record);

    return this.toSummary(record);
  }

  async updateDocument(docId: string, payload: unknown) {
    const body = ensureObject(payload);
    const current = await this.getRecordOrThrow(docId);

    const title = optionalString(body, 'title', { maxLength: MAX_TITLE_LENGTH });
    const content = optionalString(body, 'content', {
      maxLength: MAX_CONTENT_LENGTH,
    });
    const category = optionalString(body, 'category', {
      maxLength: MAX_CATEGORY_LENGTH,
    });
    const source = optionalString(body, 'source', {
      maxLength: MAX_SOURCE_LENGTH,
    });
    const status = this.parseStatus(optionalString(body, 'status'));
    const effectiveDate = optionalString(body, 'effectiveDate', {
      maxLength: MAX_EFFECTIVE_DATE_LENGTH,
    });
    const metadata = this.parseMetadata(body.metadata, true);

    if (effectiveDate && Number.isNaN(Date.parse(effectiveDate))) {
      throw new BadRequestException('effectiveDate must be a valid ISO date.');
    }

    const next: StoredKnowledgeDocumentRecord = {
      ...current,
      entityType: 'KNOWLEDGE_DOCUMENT',
      title: title ?? current.title,
      content: content ?? current.content,
      category: category ?? current.category,
      source: source ?? current.source,
      status: status ?? current.status ?? 'ACTIVE',
      effectiveDate: effectiveDate ?? current.effectiveDate ?? null,
      metadata:
        metadata === null
          ? undefined
          : metadata ?? current.metadata ?? undefined,
      updatedAt: nowIso(),
    };

    await this.repository.put(this.config.dynamodbKnowledgeTableName, next);

    return this.toSummary(next);
  }

  async deleteDocument(docId: string) {
    await this.getRecordOrThrow(docId);
    await this.repository.delete(
      this.config.dynamodbKnowledgeTableName,
      KNOWLEDGE_DOCUMENT_PK,
      docId,
    );

    return { id: docId };
  }

  private async getRecordOrThrow(docId: string) {
    const record = await this.repository.get<StoredKnowledgeDocumentRecord>(
      this.config.dynamodbKnowledgeTableName,
      KNOWLEDGE_DOCUMENT_PK,
      docId,
    );

    if (!record) {
      throw new NotFoundException('Knowledge document not found.');
    }

    return record;
  }

  private toSummary(record: StoredKnowledgeDocumentRecord): KnowledgeDocumentSummary {
    return {
      id: record.docId,
      title: record.title,
      content: record.content,
      category: record.category,
      source: record.source,
      metadata: record.metadata,
      status: record.status ?? 'ACTIVE',
      effectiveDate: record.effectiveDate ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private parseStatus(
    value: string | undefined,
  ): KnowledgeDocumentStatus | undefined {
    if (!value) {
      return undefined;
    }

    if (!KNOWLEDGE_DOCUMENT_STATUSES.includes(value as KnowledgeDocumentStatus)) {
      throw new BadRequestException('status is invalid.');
    }

    return value as KnowledgeDocumentStatus;
  }

  private parseMetadata(
    value: unknown,
    allowNull: boolean,
  ): KnowledgeDocumentMetadata | undefined | null {
    if (value === undefined) {
      return undefined;
    }

    if (allowNull && value === null) {
      return null;
    }

    const metadata = ensureObject(value, 'metadata');
    const lawName = optionalString(metadata, 'lawName', {
      maxLength: MAX_METADATA_LENGTH,
    });
    const chapter = optionalString(metadata, 'chapter', {
      maxLength: MAX_METADATA_LENGTH,
    });
    const section = optionalString(metadata, 'section', {
      maxLength: MAX_METADATA_LENGTH,
    });

    if (!lawName && !chapter && !section) {
      return undefined;
    }

    return {
      lawName,
      chapter,
      section,
    };
  }

  private sortKey(record: StoredKnowledgeDocumentRecord): string {
    return record.updatedAt ?? record.createdAt ?? '';
  }
}
