import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AppConfigService } from '../../src/infrastructure/config/app-config.service';
import { loadEnvFiles } from '../../src/infrastructure/config/load-env';

loadEnvFiles();

export function createDynamoClients() {
  const config = new AppConfigService();
  const client = new DynamoDBClient({
    region: config.awsRegion,
    endpoint: config.dynamodbEndpoint,
    maxAttempts: config.awsMaxAttempts,
    credentials:
      config.dynamodbCredentials ??
      (config.dynamodbEndpoint
        ? {
            accessKeyId: 'local',
            secretAccessKey: 'local',
          }
        : undefined),
  });
  const documentClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  return {
    client,
    config,
    documentClient,
  };
}
