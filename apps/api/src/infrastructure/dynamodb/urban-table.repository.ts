import { Injectable } from '@nestjs/common';
import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { TableItemBase } from '../../common/storage-records';
import { createInfrastructureOperationError } from '../errors/infrastructure-error.utils';
import { DynamoDbService } from './dynamodb.service';

interface QueryOptions {
  beginsWith?: string;
  limit?: number;
  scanForward?: boolean;
}

interface IndexQueryInput {
  tableName: string;
  indexName?: string;
  pkKeyName: string;
  skKeyName: string;
  pk: string;
  options: QueryOptions;
}

interface TransactionPutInput {
  tableName: string;
  item: TableItemBase;
  conditionExpression?: string;
}

@Injectable()
export class UrbanTableRepository {
  constructor(private readonly dynamoDbService: DynamoDbService) {}

  async get<T>(
    tableName: string,
    pk: string,
    sk: string,
  ): Promise<T | undefined> {
    try {
      const response = await this.dynamoDbService.documentClient.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: pk,
            SK: sk,
          },
        }),
      );

      return response.Item as T | undefined;
    } catch (error) {
      throw this.createOperationError('Get', error, {
        tableName,
        pk,
        sk,
      });
    }
  }

  async put(tableName: string, item: TableItemBase): Promise<void> {
    try {
      await this.dynamoDbService.documentClient.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        }),
      );
    } catch (error) {
      throw this.createOperationError('Put', error, {
        tableName,
        pk: item.PK,
        sk: item.SK,
      });
    }
  }

  async transactPut(items: TransactionPutInput[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    try {
      await this.dynamoDbService.documentClient.send(
        new TransactWriteCommand({
          TransactItems: items.map((item) => ({
            Put: {
              TableName: item.tableName,
              Item: item.item,
              ConditionExpression: item.conditionExpression,
            },
          })),
        }),
      );
    } catch (error) {
      throw this.createOperationError('TransactWrite', error, {
        itemCount: String(items.length),
      });
    }
  }

  async delete(tableName: string, pk: string, sk: string): Promise<void> {
    try {
      await this.dynamoDbService.documentClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            PK: pk,
            SK: sk,
          },
        }),
      );
    } catch (error) {
      throw this.createOperationError('Delete', error, {
        tableName,
        pk,
        sk,
      });
    }
  }

  async batchGet<T>(
    tableName: string,
    keys: Array<{ PK?: string; SK?: string } & Record<string, unknown>>,
  ): Promise<T[]> {
    if (keys.length === 0) {
      return [];
    }

    const uniqueKeys = Array.from(
      new Map(
        keys
          .map((key) => this.toPrimaryKey(key))
          .filter(
            (
              key,
            ): key is {
              PK: string;
              SK: string;
            } => key !== undefined,
          )
          .map((key) => [`${key.PK}|${key.SK}`, key]),
      ).values(),
    );

    if (uniqueKeys.length === 0) {
      throw new Error(
        `DynamoDB BatchGet failed (tableName=${tableName}, keyCount=${keys.length}): no valid PK/SK keys provided`,
      );
    }

    try {
      const response = await this.dynamoDbService.documentClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: uniqueKeys,
            },
          },
        }),
      );

      return (response.Responses?.[tableName] as T[] | undefined) ?? [];
    } catch (error) {
      throw this.createOperationError('BatchGet', error, {
        tableName,
        keyCount: String(uniqueKeys.length),
      });
    }
  }

  async queryByPk<T>(
    tableName: string,
    pk: string,
    options: QueryOptions = {},
  ): Promise<T[]> {
    return this.runIndexQuery<T>({
      tableName,
      pkKeyName: 'PK',
      skKeyName: 'SK',
      pk,
      options,
    });
  }

  async queryByGsi1<T>(
    tableName: string,
    indexName: string,
    pk: string,
    options: QueryOptions = {},
  ): Promise<T[]> {
    return this.runIndexQuery<T>({
      tableName,
      indexName,
      pkKeyName: 'GSI1PK',
      skKeyName: 'GSI1SK',
      pk,
      options,
    });
  }

  async queryByGsi2<T>(
    tableName: string,
    indexName: string,
    pk: string,
    options: QueryOptions = {},
  ): Promise<T[]> {
    return this.runIndexQuery<T>({
      tableName,
      indexName,
      pkKeyName: 'GSI2PK',
      skKeyName: 'GSI2SK',
      pk,
      options,
    });
  }

  async queryByIndex<T>(
    tableName: string,
    indexName: string,
    pkKeyName: string,
    skKeyName: string,
    pk: string,
    options: QueryOptions = {},
  ): Promise<T[]> {
    return this.runIndexQuery<T>({
      tableName,
      indexName,
      pkKeyName,
      skKeyName,
      pk,
      options,
    });
  }

  async scanAll<T>(tableName: string): Promise<T[]> {
    const items: T[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    try {
      do {
        const response = await this.dynamoDbService.documentClient.send(
          new ScanCommand({
            TableName: tableName,
            ExclusiveStartKey: exclusiveStartKey,
          }),
        );

        items.push(...((response.Items as T[] | undefined) ?? []));
        exclusiveStartKey = response.LastEvaluatedKey as
          | Record<string, unknown>
          | undefined;
      } while (exclusiveStartKey);

      return items;
    } catch (error) {
      throw this.createOperationError('Scan', error, {
        tableName,
      });
    }
  }

  private async runIndexQuery<T>(input: IndexQueryInput): Promise<T[]> {
    const expressionNames: Record<string, string> = {
      '#pk': input.pkKeyName,
    };
    const expressionValues: Record<string, string | number> = {
      ':pk': input.pk,
    };
    let keyConditionExpression = '#pk = :pk';

    if (input.options.beginsWith) {
      expressionNames['#sk'] = input.skKeyName;
      expressionValues[':sk'] = input.options.beginsWith;
      keyConditionExpression += ' AND begins_with(#sk, :sk)';
    }

    try {
      const response = await this.dynamoDbService.documentClient.send(
        new QueryCommand({
          TableName: input.tableName,
          IndexName: input.indexName,
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeNames: expressionNames,
          ExpressionAttributeValues: expressionValues,
          Limit: input.options.limit,
          ScanIndexForward: input.options.scanForward ?? false,
        }),
      );

      return (response.Items as T[] | undefined) ?? [];
    } catch (error) {
      throw this.createOperationError('Query', error, {
        tableName: input.tableName,
        indexName: input.indexName,
        pkKeyName: input.pkKeyName,
        skKeyName: input.skKeyName,
        pk: input.pk,
      });
    }
  }

  private toPrimaryKey(
    key: { PK?: string; SK?: string } & Record<string, unknown>,
  ): { PK: string; SK: string } | undefined {
    if (typeof key.PK !== 'string' || typeof key.SK !== 'string') {
      return undefined;
    }

    return {
      PK: key.PK,
      SK: key.SK,
    };
  }

  private createOperationError(
    operation: string,
    error: unknown,
    context: Record<string, string | undefined>,
  ): Error {
    return createInfrastructureOperationError({
      context,
      error,
      operation,
      publicMessage: 'Temporary database failure. Please retry.',
      serviceLabel: 'DynamoDB',
    });
  }
}
