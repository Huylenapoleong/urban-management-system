import { ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoClients } from './lib/dynamodb-client';

async function main() {
  const { documentClient, config } = createDynamoClients();
  const tableName = config.dynamodbConversationsTableName;

  console.log(`Scanning table ${tableName} for aliases to clear...`);

  let exclusiveStartKey: any = undefined;
  let totalScanned = 0;
  let totalDeleted = 0;

  do {
    const scanResponse = await documentClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'entityType = :entityType',
        ExpressionAttributeValues: {
          ':entityType': 'CONVERSATION_MEMBER_ALIAS',
        },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    const items = scanResponse.Items ?? [];
    totalScanned += items.length;

    console.log(`Found ${items.length} alias items in this page.`);

    for (const item of items) {
      const { PK, SK } = item;
      console.log(`Deleting alias: PK=${PK}, SK=${SK}`);
      await documentClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { PK, SK },
        })
      );
      totalDeleted++;
    }

    exclusiveStartKey = scanResponse.LastEvaluatedKey;
  } while (exclusiveStartKey);

  console.log(`Successfully completed! Scanned: ${totalScanned}, Deleted: ${totalDeleted}`);
}

main().catch((err) => {
  console.error('Failed to clear aliases:', err);
  process.exit(1);
});
