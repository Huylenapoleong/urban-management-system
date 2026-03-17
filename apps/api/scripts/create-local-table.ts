import {
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { createDynamoClients } from './lib/dynamodb-client';
import { getTableDefinitions } from './lib/table-definitions';

async function main(): Promise<void> {
  const { client, config } = createDynamoClients();
  const tables = getTableDefinitions(config);

  for (const table of tables) {
    try {
      const current = await client.send(
        new DescribeTableCommand({
          TableName: table.tableName,
        }),
      );
      console.log(
        `Table ${table.tableName} already exists (${current.Table?.TableStatus ?? 'UNKNOWN'}).`,
      );
      continue;
    } catch (error) {
      const typedError = error as { name?: string };

      if (typedError.name !== 'ResourceNotFoundException') {
        throw error;
      }
    }

    await client.send(new CreateTableCommand(table.input));
    await waitUntilTableExists(
      { client, maxWaitTime: 60 },
      { TableName: table.tableName },
    );
    console.log(`Created table ${table.tableName}.`);
  }
}

void main();
