import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { createDynamoClients } from './lib/dynamodb-client';
import { getTableDefinitions } from './lib/table-definitions';

function formatKeySchema(
  keySchema: Array<{ AttributeName?: string; KeyType?: string }> | undefined,
): string {
  return (keySchema ?? [])
    .map((item) => `${item.AttributeName}:${item.KeyType}`)
    .join(', ');
}

async function main(): Promise<void> {
  const { client, config } = createDynamoClients();
  const tableDefinitions = getTableDefinitions(config);
  let hasError = false;

  console.log(`AWS_REGION=${config.awsRegion}`);
  console.log(
    `DYNAMODB_ENDPOINT=${config.dynamodbEndpoint ?? '(aws default)'}`,
  );

  for (const definition of tableDefinitions) {
    const expectedIndexes = new Map(
      (definition.input.GlobalSecondaryIndexes ?? []).map((index) => [
        index.IndexName ?? '',
        formatKeySchema(index.KeySchema),
      ]),
    );

    try {
      const response = await client.send(
        new DescribeTableCommand({ TableName: definition.tableName }),
      );
      const table = response.Table;
      const actualIndexes = new Map(
        (table?.GlobalSecondaryIndexes ?? []).map((index) => [
          index.IndexName ?? '',
          formatKeySchema(index.KeySchema),
        ]),
      );

      console.log(`\n[OK] ${definition.tableName}`);
      console.log(`  KeySchema: ${formatKeySchema(table?.KeySchema)}`);

      const expectedTableKeySchema = formatKeySchema(
        definition.input.KeySchema,
      );
      const actualTableKeySchema = formatKeySchema(table?.KeySchema);
      if (expectedTableKeySchema !== actualTableKeySchema) {
        hasError = true;
        console.log(`  ERROR key schema mismatch`);
        console.log(`    expected: ${expectedTableKeySchema}`);
        console.log(`    actual:   ${actualTableKeySchema}`);
      }

      if (expectedIndexes.size === 0) {
        console.log('  GSIs: none expected');
        continue;
      }

      console.log('  GSIs:');
      for (const [indexName, expectedKeySchema] of expectedIndexes.entries()) {
        const actualKeySchema = actualIndexes.get(indexName);

        if (!actualKeySchema) {
          hasError = true;
          console.log(`    ERROR missing index ${indexName}`);
          continue;
        }

        console.log(`    ${indexName}: ${actualKeySchema}`);
        if (actualKeySchema !== expectedKeySchema) {
          hasError = true;
          console.log(`      ERROR key schema mismatch`);
          console.log(`      expected: ${expectedKeySchema}`);
          console.log(`      actual:   ${actualKeySchema}`);
        }
      }
    } catch (error) {
      hasError = true;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`\n[ERROR] ${definition.tableName}`);
      console.log(`  ${message}`);
    }
  }

  if (hasError) {
    process.exitCode = 1;
    return;
  }

  console.log('\nDynamoDB schema check passed.');
}

void main();
