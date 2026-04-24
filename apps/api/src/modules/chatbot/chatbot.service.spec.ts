import type { UserRole } from '@urban/shared-constants';
import type { AppConfigService } from '../../infrastructure/config/app-config.service';
import type { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { ChatbotService } from './chatbot.service';
import type { KnowledgeRepository } from './repositories/knowledge.repository';
import type { GroqClientService } from './services/groq-client.service';

const NO_DATA_FALLBACK =
  'Hiện tại chưa có thông tin pháp lý phù hợp với câu hỏi của bạn trong hệ thống. ' +
  'Vui lòng liên hệ trực tiếp cơ quan quản lý đô thị hoặc tổ chức tư vấn pháp luật để được hỗ trợ.';

type MockedKnowledgeRepository = {
  findBySimilarity: jest.Mock;
  findByCategory: jest.Mock;
  scanAll: jest.Mock;
};

type MockedGroqClientService = {
  complete: jest.Mock;
  streamRAGResponse: jest.Mock;
};

type MockedConfig = {
  chatbotMaxContextDocs: number;
  dynamodbGroupsTableName: string;
};

type MockedUrbanTableRepository = {
  scanAll: jest.Mock;
};

function createService() {
  const knowledge: MockedKnowledgeRepository = {
    findBySimilarity: jest.fn(),
    findByCategory: jest.fn(),
    scanAll: jest.fn().mockResolvedValue([]),
  };

  const groq: MockedGroqClientService = {
    complete: jest.fn(),
    streamRAGResponse: jest.fn(),
  };

  const config: MockedConfig = {
    chatbotMaxContextDocs: 5,
    dynamodbGroupsTableName: 'Groups',
  };

  const repository: MockedUrbanTableRepository = {
    scanAll: jest.fn(),
  };

  const service = new ChatbotService(
    knowledge as unknown as KnowledgeRepository,
    groq as unknown as GroqClientService,
    config as unknown as AppConfigService,
    repository as unknown as UrbanTableRepository,
  );

  // Avoid runtime model loading in tests and force keyword retrieval path.
  (
    service as unknown as { embeddingInitAttempted: boolean }
  ).embeddingInitAttempted = true;

  return { service, knowledge, groq, repository };
}

describe('ChatbotService', () => {
  it('returns generated answer with sources when matching documents are found', async () => {
    const { service, knowledge, groq } = createService();
    knowledge.findByCategory.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Luat Dat Dai',
        content: 'Noi dung phap ly',
        category: 'land',
        source: 'Kho tri thuc',
      },
    ]);
    groq.complete.mockResolvedValue('Cau tra loi tu AI');

    const result = await service.ask('thủ tục đất đai là gì', 'CITIZEN');

    expect(result.answer).toBe('Cau tra loi tu AI');
    expect(result.sources).toEqual([
      { title: 'Luat Dat Dai', source: 'Kho tri thuc' },
    ]);
    expect(knowledge.findByCategory).toHaveBeenCalledWith('land');
  });

  it('falls back to local summary when LLM completion fails', async () => {
    const { service, knowledge, groq } = createService();
    knowledge.findByCategory.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Nghi dinh Xay Dung',
        content:
          'Noi dung van ban phap ly ve giay phep xay dung va dieu kien cap phep.',
        category: 'construction',
        source: 'Kho tri thuc',
      },
    ]);
    groq.complete.mockRejectedValue(new Error('provider unavailable'));

    const result = await service.ask(
      'giấy phép xây dựng cần gì',
      'WARD_OFFICER',
    );

    expect(result.answer).toContain('He thong AI dang tam thoi qua tai');
    expect(result.answer).toContain('Nghi dinh Xay Dung');
    expect(result.sources).toHaveLength(1);
  });

  it('returns smart routing fallback when no legal document is found', async () => {
    const { service, knowledge, repository } = createService();
    knowledge.findByCategory.mockResolvedValue([]);
    repository.scanAll.mockResolvedValue([]);

    const result = await service.ask('món ăn nào ngon nhất', 'CITIZEN');

    expect(result.answer).toBe(NO_DATA_FALLBACK);
    expect(result.sources).toEqual([]);
  });

  it('streams chunks from Groq when documents are available', async () => {
    const { service, knowledge, groq } = createService();
    knowledge.findByCategory.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Huong dan thu tuc hanh chinh',
        content: 'Noi dung huong dan',
        category: 'administrative',
        source: 'Kho tri thuc',
      },
    ]);

    function* chunkGenerator() {
      yield 'chunk-1';
      yield 'chunk-2';
    }

    groq.streamRAGResponse.mockReturnValue(chunkGenerator());

    const chunks: string[] = [];
    for await (const chunk of service.askStream('thủ tục hành chính')) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['chunk-1', 'chunk-2']);
  });

  it('streams smart routing answer when no documents are available', async () => {
    const { service, knowledge, repository } = createService();
    knowledge.scanAll.mockResolvedValue([]);
    repository.scanAll.mockResolvedValue([]);

    const chunks: string[] = [];
    for await (const chunk of service.askStream('câu hỏi ngoài phạm vi')) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([NO_DATA_FALLBACK]);
  });

  it('builds officer instruction for officer roles', () => {
    const { service } = createService();
    const buildRoleInstruction = (
      service as unknown as {
        buildRoleInstruction: (role?: UserRole) => string;
      }
    ).buildRoleInstruction;

    expect(buildRoleInstruction('ADMIN')).toContain('hỗ trợ Cán bộ');
    expect(buildRoleInstruction('CITIZEN')).toContain('người dân');
  });
});
