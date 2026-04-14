import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import {
  Injectable,
  InternalServerErrorException,
  OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createInfrastructureOperationError } from '../errors/infrastructure-error.utils';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';

@Injectable()
export class S3StorageService implements OnApplicationShutdown {
  private readonly client: S3Client;

  constructor(
    private readonly config: AppConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {
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
      await this.circuitBreakerService.execute('s3', 'S3', () => upload.done());
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

  async deleteObject(input: { bucket: string; key: string }): Promise<void> {
    if (!input.bucket) {
      throw new InternalServerErrorException('S3 bucket is not configured.');
    }

    try {
      await this.circuitBreakerService.execute('s3', 'S3', () =>
        this.client.send(
          new DeleteObjectCommand({
            Bucket: input.bucket,
            Key: input.key,
          }),
        ),
      );
    } catch (error) {
      throw createInfrastructureOperationError({
        context: {
          bucket: input.bucket,
          key: input.key,
        },
        error,
        operation: 'Delete',
        publicMessage: 'Temporary file storage failure. Please retry.',
        serviceLabel: 'S3',
      });
    }
  }

  async copyObject(input: {
    sourceBucket: string;
    sourceKey: string;
    destinationBucket: string;
    destinationKey: string;
  }): Promise<void> {
    if (!input.sourceBucket || !input.destinationBucket) {
      throw new InternalServerErrorException('S3 bucket is not configured.');
    }

    try {
      await this.circuitBreakerService.execute('s3', 'S3', () =>
        this.client.send(
          new CopyObjectCommand({
            Bucket: input.destinationBucket,
            Key: input.destinationKey,
            CopySource: `${input.sourceBucket}/${this.encodeKey(input.sourceKey)}`,
          }),
        ),
      );
    } catch (error) {
      throw createInfrastructureOperationError({
        context: {
          destinationBucket: input.destinationBucket,
          destinationKey: input.destinationKey,
          sourceBucket: input.sourceBucket,
          sourceKey: input.sourceKey,
        },
        error,
        operation: 'Copy',
        publicMessage: 'Temporary file storage failure. Please retry.',
        serviceLabel: 'S3',
      });
    }
  }

  async createPresignedUploadUrl(input: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }> {
    if (!input.bucket) {
      throw new InternalServerErrorException('S3 bucket is not configured.');
    }

    const expiresInSeconds = Math.max(60, input.expiresInSeconds);

    try {
      const url = await getSignedUrl(
        this.client as never,
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          ContentType: input.contentType,
        }) as never,
        { expiresIn: expiresInSeconds },
      );

      return {
        url,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      };
    } catch (error) {
      throw createInfrastructureOperationError({
        context: {
          bucket: input.bucket,
          key: input.key,
        },
        error,
        operation: 'PresignUpload',
        publicMessage: 'Temporary file storage failure. Please retry.',
        serviceLabel: 'S3',
      });
    }
  }

  async createPresignedDownloadUrl(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }> {
    if (!input.bucket) {
      throw new InternalServerErrorException('S3 bucket is not configured.');
    }

    const expiresInSeconds = Math.max(60, input.expiresInSeconds);

    try {
      const url = await getSignedUrl(
        this.client as never,
        new GetObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
        }) as never,
        { expiresIn: expiresInSeconds },
      );

      return {
        url,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      };
    } catch (error) {
      throw createInfrastructureOperationError({
        context: {
          bucket: input.bucket,
          key: input.key,
        },
        error,
        operation: 'PresignDownload',
        publicMessage: 'Temporary file storage failure. Please retry.',
        serviceLabel: 'S3',
      });
    }
  }

  async resolveObjectUrl(input: {
    bucket: string;
    key: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt?: string }> {
    if (this.config.s3PublicBaseUrl) {
      return {
        url: this.getObjectUrl(input),
      };
    }

    return this.createPresignedDownloadUrl({
      bucket: input.bucket,
      key: input.key,
      expiresInSeconds:
        input.expiresInSeconds ?? this.config.uploadPresignTtlSeconds,
    });
  }

  getObjectUrl(input: { bucket: string; key: string }): string {
    return this.buildObjectUrl(input.bucket, input.key);
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
