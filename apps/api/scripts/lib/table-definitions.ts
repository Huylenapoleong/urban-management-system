import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import { AppConfigService } from '../../src/infrastructure/config/app-config.service';

interface TableDefinition {
  tableName: string;
  input: CreateTableCommandInput;
}

export function getTableDefinitions(
  config: AppConfigService,
): TableDefinition[] {
  return [
    {
      tableName: config.dynamodbUsersTableName,
      input: {
        TableName: config.dynamodbUsersTableName,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'phone', AttributeType: 'S' },
          { AttributeName: 'email', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: config.dynamodbUsersPhoneIndexName,
            KeySchema: [
              { AttributeName: 'phone', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
          {
            IndexName: config.dynamodbUsersEmailIndexName,
            KeySchema: [
              { AttributeName: 'email', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
        ],
      },
    },
    {
      tableName: config.dynamodbGroupsTableName,
      input: {
        TableName: config.dynamodbGroupsTableName,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'createdAt', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: config.dynamodbGroupsTypeLocationIndexName,
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'createdAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
        ],
      },
    },
    {
      tableName: config.dynamodbMembershipsTableName,
      input: {
        TableName: config.dynamodbMembershipsTableName,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: config.dynamodbMembershipsUserGroupsIndexName,
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
        ],
      },
    },
    {
      tableName: config.dynamodbMessagesTableName,
      input: {
        TableName: config.dynamodbMessagesTableName,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
      },
    },
    {
      tableName: config.dynamodbConversationsTableName,
      input: {
        TableName: config.dynamodbConversationsTableName,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'updatedAt', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: config.dynamodbConversationsInboxStatsIndexName,
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'updatedAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
        ],
      },
    },
    {
      tableName: config.dynamodbReportsTableName,
      input: {
        TableName: config.dynamodbReportsTableName,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI2PK', AttributeType: 'S' },
          { AttributeName: 'createdAt', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: config.dynamodbReportsCategoryLocationIndexName,
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'createdAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
          {
            IndexName: config.dynamodbReportsStatusLocationIndexName,
            KeySchema: [
              { AttributeName: 'GSI2PK', KeyType: 'HASH' },
              { AttributeName: 'createdAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
        ],
      },
    },
  ];
}
