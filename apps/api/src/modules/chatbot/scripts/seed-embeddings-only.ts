/**
 * Quick Seed: Nạp embedding cho documents ĐÃ CÓ trong bảng KnowledgeBase.
 * Không xóa/tạo lại bảng — chỉ overwrite data với embeddings.
 *
 * Chạy:
 *   npx ts-node -r tsconfig-paths/register src/modules/chatbot/scripts/seed-embeddings-only.ts
 */

import { loadEnvFiles } from '../../../infrastructure/config/load-env';
loadEnvFiles();

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';

const TABLE_NAME = process.env.DYNAMODB_KNOWLEDGE_TABLE_NAME ?? 'KnowledgeBase';
const REGION = process.env.AWS_REGION ?? 'ap-southeast-1';
const ENDPOINT = process.env.DYNAMODB_ENDPOINT || undefined;

const client = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

interface SeedDocument {
  docId: string;
  title: string;
  content: string;
  category: string;
  source: string;
  metadata?: Record<string, string>;
}

interface EmbeddingExtractorOutput {
  data: Float32Array;
}

type EmbeddingExtractor = (
  text: string,
  options: { pooling: 'mean'; normalize: true },
) => Promise<EmbeddingExtractorOutput>;

type TransformersPipeline = (
  task: 'feature-extraction',
  model: 'Xenova/all-MiniLM-L6-v2',
) => Promise<EmbeddingExtractor>;

async function main(): Promise<void> {
  console.log('\n=== Knowledge Base — Seed Embeddings Only ===');
  console.log(`Table : ${TABLE_NAME}`);
  console.log(`Region: ${REGION}\n`);

  // 1. Load embedding model
  let generateEmbedding: ((text: string) => Promise<number[]>) | null = null;
  try {
    console.log('[INFO] Loading embedding model (all-MiniLM-L6-v2)...');
    const { pipeline } = (await import('@xenova/transformers')) as {
      pipeline: TransformersPipeline;
    };
    const extractor = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
    );
    generateEmbedding = async (text: string) => {
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      });
      return Array.from(output.data);
    };
    console.log('[OK] Embedding model loaded.\n');
  } catch {
    console.warn(
      '[WARN] Could not load embedding model — seeding without embeddings.',
    );
  }

  // 2. Read seed data
  const dataPath = path.join(__dirname, 'knowledge-seed-data.json');
  const raw: SeedDocument[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`[INFO] Seeding ${raw.length} documents...\n`);

  const now = new Date().toISOString();
  const BATCH_SIZE = 25;

  // 3. Generate embeddings + write
  for (let i = 0; i < raw.length; i += BATCH_SIZE) {
    const batch = raw.slice(i, i + BATCH_SIZE);
    const items: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [];

    for (const doc of batch) {
      let embedding: number[] | undefined;
      if (generateEmbedding) {
        const text = `${doc.title}. ${doc.content}`;
        embedding = await generateEmbedding(text);
        console.log(`  ✓ ${doc.docId}: embedding (${embedding.length} dims)`);
      }

      items.push({
        PutRequest: {
          Item: {
            PK: 'KNOWLEDGE_DOCUMENT',
            SK: doc.docId,
            category: doc.category,
            docId: doc.docId,
            title: doc.title,
            content: doc.content,
            source: doc.source,
            metadata: doc.metadata,
            embedding,
            updatedAt: now,
          },
        },
      });
    }

    await docClient.send(
      new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: items } }),
    );
    console.log(
      `[OK] Batch ${Math.floor(i / BATCH_SIZE) + 1}: wrote ${batch.length} items.\n`,
    );
  }

  console.log(`[DONE] All ${raw.length} documents seeded with embeddings.`);
  client.destroy();
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
