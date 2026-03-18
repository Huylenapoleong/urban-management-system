import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';

@Injectable()
export class DynamoDbService implements OnApplicationShutdown {
  readonly client: DynamoDBClient;
  readonly documentClient: DynamoDBDocumentClient;

  constructor(
    private readonly config: AppConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {
    this.client = new DynamoDBClient({
      region: this.config.awsRegion,
      endpoint: this.config.dynamodbEndpoint,
      credentials: this.config.dynamodbCredentials,
      maxAttempts: this.config.awsMaxAttempts,
    });

    this.documentClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  async checkConnection(): Promise<{ tableName: string; tableStatus: string }> {
    const response = await this.circuitBreakerService.execute(
      'dynamodb',
      'DynamoDB',
      () =>
        this.client.send(
          new DescribeTableCommand({
            TableName: this.config.dynamodbUsersTableName,
          }),
        ),
    );

    return {
      tableName: this.config.dynamodbUsersTableName,
      tableStatus: response.Table?.TableStatus ?? 'UNKNOWN',
    };
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
