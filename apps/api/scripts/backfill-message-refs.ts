import { BatchWriteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { StoredMessageRef } from '../src/common/storage-records';
import { createDynamoClients } from './lib/dynamodb-client';

interface LegacyMessageRecord extends Record<string, unknown> {
  PK: string;
  SK: string;
  entityType: string;
  conversationId?: string;
  messageId?: string;
  id?: string;
  senderId?: string;
  sentAt?: string;
  updatedAt?: string;
}

function isStoredMessage(
  item: Record<string, unknown>,
): item is LegacyMessageRecord {
  return (
    typeof item.PK === 'string' &&
    typeof item.SK === 'string' &&
    item.entityType === 'MESSAGE'
  );
}

function getCanonicalMessageId(item: LegacyMessageRecord): string | undefined {
  if (typeof item.messageId === 'string' && item.messageId.trim()) {
    return item.messageId.trim();
  }

  if (typeof item.id === 'string' && item.id.trim()) {
    return item.id.trim();
  }

  return undefined;
}

function buildMessageRef(
  item: LegacyMessageRecord,
  messageId: string,
): StoredMessageRef {
  return {
    PK: item.PK,
    SK: `MSGREF#${messageId}`,
    entityType: 'MESSAGE_REF',
    conversationId:
      typeof item.conversationId === 'string' ? item.conversationId : item.PK,
    messageId,
    messageSk: item.SK,
    senderId: typeof item.senderId === 'string' ? item.senderId : 'unknown',
    sentAt:
      typeof item.sentAt === 'string' ? item.sentAt : new Date(0).toISOString(),
    updatedAt:
      typeof item.updatedAt === 'string'
        ? item.updatedAt
        : typeof item.sentAt === 'string'
          ? item.sentAt
          : new Date(0).toISOString(),
  };
}

async function batchPutAll(
  tableName: string,
  items: Array<Record<string, unknown>>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const { documentClient } = createDynamoClients();

  for (let index = 0; index < items.length; index += 25) {
    let unprocessed = items.slice(index, index + 25).map((item) => ({
      PutRequest: {
        Item: item,
      },
    }));

    do {
      const response = await documentClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: unprocessed,
          },
        }),
      );

      unprocessed = (response.UnprocessedItems?.[tableName] ?? []) as Array<{
        PutRequest: { Item: Record<string, unknown> };
      }>;
    } while (unprocessed.length > 0);
  }
}

async function main(): Promise<void> {
  const { documentClient, config } = createDynamoClients();
  const tableName = config.dynamodbMessagesTableName;
  const scannedMessages: LegacyMessageRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await documentClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = (response.Items ?? []) as Array<Record<string, unknown>>;
    scannedMessages.push(...items.filter(isStoredMessage));
    exclusiveStartKey = response.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  const writeItems: Array<Record<string, unknown>> = [];
  let updatedMessages = 0;
  let writtenRefs = 0;
  let skippedMessages = 0;

  for (const item of scannedMessages) {
    const messageId = getCanonicalMessageId(item);

    if (!messageId) {
      skippedMessages += 1;
      continue;
    }

    if (item.messageId !== messageId) {
      writeItems.push({
        ...(item as Record<string, unknown>),
        messageId,
      });
      updatedMessages += 1;
    }

    writeItems.push(
      buildMessageRef(item, messageId) as unknown as Record<string, unknown>,
    );
    writtenRefs += 1;
  }

  await batchPutAll(tableName, writeItems);

  console.log(`Messages table: ${tableName}`);
  console.log(`Scanned message records: ${scannedMessages.length}`);
  console.log(`Updated messages with canonical messageId: ${updatedMessages}`);
  console.log(`Written MESSAGE_REF records: ${writtenRefs}`);
  console.log(`Skipped message records without usable id: ${skippedMessages}`);
}

void main();
