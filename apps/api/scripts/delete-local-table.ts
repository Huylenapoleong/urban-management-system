import {
  DeleteTableCommand,
  DescribeTableCommand,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb';
import { createDynamoClients } from './lib/dynamodb-client';
import { getTableDefinitions } from './lib/table-definitions';

async function main(): Promise<void> {
  const { client, config } = createDynamoClients();
  const tables = getTableDefinitions(config).reverse();

  for (const table of tables) {
    try {
      await client.send(
        new DescribeTableCommand({
          TableName: table.tableName,
        }),
      );
    } catch (error) {
      const typedError = error as { name?: string };

      if (typedError.name === 'ResourceNotFoundException') {
        console.log(`Table ${table.tableName} does not exist.`);
        continue;
      }

      throw error;
    }

    await client.send(
      new DeleteTableCommand({
        TableName: table.tableName,
      }),
    );
    await waitUntilTableNotExists(
      { client, maxWaitTime: 60 },
      { TableName: table.tableName },
    );
    console.log(`Deleted table ${table.tableName}.`);
  }
}

void main();
