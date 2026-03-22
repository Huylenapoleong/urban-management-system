/**
 * Seed Script: Xóa và tạo lại bảng DynamoDB KnowledgeBase với design đúng.
 *
 * Chạy lại bất cứ khi nào cần reset data:
 *   npx ts-node -r tsconfig-paths/register apps/api/src/modules/chatbot/scripts/seed-knowledge.ts
 *
 * Design bảng (đã sửa):
 *   PK  = "KNOWLEDGE_DOCUMENT"  (constant entity type — query all dễ dàng)
 *   SK  = <docId>               (unique per article)
 *   GSI "category-index":
 *     PK = category             (field thật — "land", "construction", ...)
 *     SK = docId
 */

// Load .env TRƯỚC KHI khởi tạo bất kỳ AWS client nào
import { loadEnvFiles } from '../../../infrastructure/config/load-env';
loadEnvFiles();

import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config từ env ────────────────────────────────────────────────────────────
const TABLE_NAME = process.env.DYNAMODB_KNOWLEDGE_TABLE_NAME ?? 'KnowledgeBase';
const REGION = process.env.AWS_REGION ?? 'ap-southeast-1';
const ENDPOINT = process.env.DYNAMODB_ENDPOINT || undefined;

const client = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface SeedDocument {
  docId: string;
  title: string;
  content: string;
  category: string;
  source: string;
  metadata?: Record<string, string>;
}

// ─── Step 1: Xóa table cũ nếu đang tồn tại ───────────────────────────────────
async function dropTableIfExists(): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`[INFO] Table "${TABLE_NAME}" exists — deleting...`);
    await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));

    console.log('[INFO] Waiting for table to be fully deleted...');
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      try {
        await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      } catch (err) {
        if (err instanceof ResourceNotFoundException) {
          console.log('[OK] Table deleted.');
          return;
        }
      }
    }
    throw new Error('Table deletion timed out.');
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      console.log(`[OK] Table "${TABLE_NAME}" does not exist — skipping delete.`);
    } else {
      throw err;
    }
  }
}

// ─── Step 2: Tạo table mới với design đúng ───────────────────────────────────
async function createTable(): Promise<void> {
  console.log(`[INFO] Creating table "${TABLE_NAME}" with clean design...`);

  await client.send(
    new CreateTableCommand({
      TableName: TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'category', AttributeType: 'S' }, // field thật
        { AttributeName: 'docId', AttributeType: 'S' },   // field thật
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'category-index',
          KeySchema: [
            { AttributeName: 'category', KeyType: 'HASH' }, // field thật
            { AttributeName: 'docId', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );

  console.log('[INFO] Waiting for table to become ACTIVE...');
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const res = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    if (res.Table?.TableStatus === 'ACTIVE') {
      console.log('[OK] Table is ACTIVE.');
      return;
    }
  }
  throw new Error('Table did not become ACTIVE in time.');
}

// ─── Step 3: Đọc file JSON và nạp dữ liệu ────────────────────────────────────
async function seedData(): Promise<void> {
  const dataPath = path.join(__dirname, 'knowledge-seed-data.json');
  const raw: SeedDocument[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log(`[INFO] Seeding ${raw.length} documents into "${TABLE_NAME}"...`);

  const BATCH_SIZE = 25;
  const now = new Date().toISOString();

  for (let i = 0; i < raw.length; i += BATCH_SIZE) {
    const batch = raw.slice(i, i + BATCH_SIZE);

    const requestItems = batch.map((doc) => ({
      PutRequest: {
        Item: {
          PK: 'KNOWLEDGE_DOCUMENT', // constant entity type
          SK: doc.docId,            // docId trực tiếp, không cần prefix
          category: doc.category,   // field thật → GSI partition key
          docId: doc.docId,         // field thật → GSI sort key
          title: doc.title,
          content: doc.content,
          source: doc.source,
          metadata: doc.metadata,
          updatedAt: now,
        },
      },
    }));

    await docClient.send(
      new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: requestItems } }),
    );

    console.log(
      `[OK] Batch ${Math.floor(i / BATCH_SIZE) + 1}: seeded ${batch.length} items.`,
    );
  }

  console.log(`\n[DONE] All ${raw.length} documents seeded successfully.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\n=== Knowledge Base Seed Script (clean design) ===`);
  console.log(`Table : ${TABLE_NAME}`);
  console.log(`Region: ${REGION}`);
  console.log(`Endpoint: ${ENDPOINT ?? 'AWS (production)'}\n`);

  try {
    await dropTableIfExists();
    await createTable();
    await seedData();
  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  } finally {
    client.destroy();
  }
}

void main();
