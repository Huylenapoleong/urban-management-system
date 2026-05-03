import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KNOWLEDGE_DOCUMENT_PK } from './knowledge-base.types';

describe('KnowledgeBaseService', () => {
  const repository = {
    delete: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    queryByIndex: jest.fn(),
    scanAll: jest.fn(),
  };

  const config = {
    dynamodbKnowledgeTableName: 'KnowledgeBase',
  };

  let service: KnowledgeBaseService;

  const baseRecord = {
    PK: KNOWLEDGE_DOCUMENT_PK,
    SK: 'doc-1',
    docId: 'doc-1',
    category: 'land',
    title: 'Sample title',
    content: 'Sample content',
    source: 'Land Law 2024',
    status: 'ACTIVE' as const,
    updatedAt: '2026-03-17T06:15:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KnowledgeBaseService(repository as never, config as never);
  });

  it('lists documents by category using the index', async () => {
    repository.queryByIndex.mockResolvedValue([baseRecord]);

    const result = await service.listDocuments({ category: 'land' });

    expect(repository.queryByIndex).toHaveBeenCalledWith(
      'KnowledgeBase',
      'category-index',
      'category',
      'docId',
      'land',
      { scanForward: false },
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('doc-1');
  });

  it('creates a document with defaults', async () => {
    repository.put.mockResolvedValue(undefined);

    const result = await service.createDocument({
      title: 'Article 3',
      content: 'Land is owned by the entire people.',
      category: 'land',
      source: 'Land Law 2024 - Article 3',
    });

    expect(repository.put).toHaveBeenCalledTimes(1);
    const saved = repository.put.mock.calls[0][1];
    expect(saved.PK).toBe(KNOWLEDGE_DOCUMENT_PK);
    expect(saved.SK).toEqual(saved.docId);
    expect(saved.status).toBe('ACTIVE');
    expect(result.status).toBe('ACTIVE');
  });

  it('rejects invalid status', async () => {
    await expect(
      service.createDocument({
        title: 'Article 3',
        content: 'Land is owned by the entire people.',
        category: 'land',
        source: 'Land Law 2024 - Article 3',
        status: 'UNKNOWN',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when document is missing', async () => {
    repository.get.mockResolvedValue(undefined);

    await expect(service.getDocument('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
