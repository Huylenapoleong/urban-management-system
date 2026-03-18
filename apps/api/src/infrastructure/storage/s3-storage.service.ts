import {
  Injectable,
  InternalServerErrorException,
  OnApplicationShutdown,
} from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createInfrastructureOperationError } from '../errors/infrastructure-error.utils';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class S3StorageService implements OnApplicationShutdown {
  private readonly client: S3Client;

  constructor(private readonly config: AppConfigService) {
    this.client = new S3Client({
      region: this.config.awsRegion,
      endpoint: this.config.s3Endpoint,
      forcePathStyle: this.config.s3ForcePathStyle,
      credentials: this.config.dynamodbCredentials,
      maxAttempts: this.config.awsMaxAttempts,
    });
  }

  async uploadObject(input: {
    body: Buffer;
    bucket: string;
    contentType: string;
    key: string;
  }): Promise<{ bucket: string; key: string; url: string }> {
    if (!input.bucket) {
      throw new InternalServerErrorException('S3 bucket is not configured.');
    }

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      },
    });

    try {
      await upload.done();
    } catch (error) {
      throw createInfrastructureOperationError({
        context: {
          bucket: input.bucket,
          key: input.key,
        },
        error,
        operation: 'Upload',
        publicMessage: 'Temporary file storage failure. Please retry.',
        serviceLabel: 'S3',
      });
    }

    return {
      bucket: input.bucket,
      key: input.key,
      url: this.buildObjectUrl(input.bucket, input.key),
    };
  }

  getHealth(): { configured: boolean; detail: string } {
    if (!this.config.s3BucketName) {
      return {
        configured: false,
        detail: 'S3 bucket is not configured.',
      };
    }

    return {
      configured: true,
      detail: `bucket=${this.config.s3BucketName}`,
    };
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }

  private buildObjectUrl(bucket: string, key: string): string {
    if (this.config.s3PublicBaseUrl) {
      return `${this.config.s3PublicBaseUrl.replace(/\/$/, '')}/${this.encodeKey(key)}`;
    }

    if (this.config.s3Endpoint) {
      const endpoint = this.config.s3Endpoint.replace(/\/$/, '');
      return this.config.s3ForcePathStyle
        ? `${endpoint}/${bucket}/${this.encodeKey(key)}`
        : `${endpoint}/${this.encodeKey(key)}`;
    }

    return `https://${bucket}.s3.${this.config.awsRegion}.amazonaws.com/${this.encodeKey(key)}`;
  }

  private encodeKey(key: string): string {
    return key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }
}
