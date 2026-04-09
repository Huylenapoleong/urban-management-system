import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UPLOAD_TARGETS } from '@urban/shared-constants';
import type { AuthenticatedUser, UploadedAsset } from '@urban/shared-types';
import {
  createUlid,
  makeReportMetadataSk,
  makeReportPk,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import type { StoredReport } from '../../common/storage-records';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { S3StorageService } from '../../infrastructure/storage/s3-storage.service';
import type {
  DeleteUploadRequestDto,
  PresignDownloadRequestDto,
  PresignUploadRequestDto,
  UploadMediaRequestDto,
} from '../../common/openapi/swagger.models';
import { ConversationsService } from '../conversations/conversations.service';

interface UploadedBinaryFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly config: AppConfigService,
    private readonly s3StorageService: S3StorageService,
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly conversationsService: ConversationsService,
  ) {}

  async uploadMedia(
    actor: AuthenticatedUser,
    input: UploadMediaRequestDto,
    file?: UploadedBinaryFile,
  ): Promise<UploadedAsset> {
    if (!file) {
      throw new BadRequestException('file is required.');
    }

    if (!UPLOAD_TARGETS.includes(input.target)) {
      throw new BadRequestException('target is invalid.');
    }
    await this.assertTargetAccess(actor, {
      target: input.target,
      entityId: input.entityId,
    });

    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty.');
    }

    if (file.size > this.config.uploadMaxFileSizeBytes) {
      throw new BadRequestException(
        `file exceeds ${this.config.uploadMaxFileSizeBytes} bytes.`,
      );
    }

    const contentType = file.mimetype.toLowerCase();
    if (!this.config.uploadAllowedMimeTypes.includes(contentType)) {
      throw new BadRequestException('file type is not allowed.');
    }

    if (input.target === 'AVATAR' && !contentType.startsWith('image/')) {
      throw new BadRequestException('Avatar uploads must be images.');
    }

    const normalizedTarget = this.normalizeSegment(input.target.toLowerCase());
    const actorSegment = this.normalizeSegment(actor.id);
    const entitySegment = input.entityId
      ? this.normalizeSegment(input.entityId)
      : undefined;
    const fileName = this.buildStoredFileName(file.originalname);
    const keyParts = [
      this.normalizeSegment(this.config.uploadKeyPrefix),
      normalizedTarget,
      actorSegment,
    ];

    if (entitySegment) {
      keyParts.push(entitySegment);
    }

    const key = `${keyParts.join('/')}/${createUlid()}-${fileName}`;
    const uploaded = await this.s3StorageService.uploadObject({
      body: file.buffer,
      bucket: this.config.s3BucketName,
      contentType,
      key,
    });
    const uploadedAt = nowIso();

    return {
      key: uploaded.key,
      url: uploaded.url,
      bucket: uploaded.bucket,
      target: input.target,
      entityId: input.entityId,
      originalFileName: file.originalname,
      fileName,
      contentType,
      size: file.size,
      uploadedBy: actor.id,
      uploadedAt,
    };
  }

  getUploadLimits(): {
    maxFileSizeBytes: number;
    allowedMimeTypes: string[];
    imageOnlyTargets: Array<(typeof UPLOAD_TARGETS)[number]>;
  } {
    return {
      maxFileSizeBytes: this.config.uploadMaxFileSizeBytes,
      allowedMimeTypes: [...this.config.uploadAllowedMimeTypes],
      imageOnlyTargets: ['AVATAR'],
    };
  }

  async presignUpload(
    actor: AuthenticatedUser,
    input: PresignUploadRequestDto,
  ): Promise<{
    method: 'PUT';
    url: string;
    key: string;
    bucket: string;
    target: (typeof UPLOAD_TARGETS)[number];
    entityId?: string;
    contentType: string;
    expiresAt: string;
  }> {
    if (!UPLOAD_TARGETS.includes(input.target)) {
      throw new BadRequestException('target is invalid.');
    }

    if (!input.fileName?.trim()) {
      throw new BadRequestException('fileName is required.');
    }

    if (!input.contentType?.trim()) {
      throw new BadRequestException('contentType is required.');
    }

    if (!Number.isFinite(input.size) || input.size <= 0) {
      throw new BadRequestException('size is invalid.');
    }

    if (input.size > this.config.uploadMaxFileSizeBytes) {
      throw new BadRequestException(
        `file exceeds ${this.config.uploadMaxFileSizeBytes} bytes.`,
      );
    }

    const contentType = input.contentType.toLowerCase();
    if (!this.config.uploadAllowedMimeTypes.includes(contentType)) {
      throw new BadRequestException('file type is not allowed.');
    }

    if (input.target === 'AVATAR' && !contentType.startsWith('image/')) {
      throw new BadRequestException('Avatar uploads must be images.');
    }

    await this.assertTargetAccess(actor, {
      target: input.target,
      entityId: input.entityId,
    });

    const normalizedTarget = this.normalizeSegment(input.target.toLowerCase());
    const actorSegment = this.normalizeSegment(actor.id);
    const entitySegment = input.entityId
      ? this.normalizeSegment(input.entityId)
      : undefined;
    const fileName = this.buildStoredFileName(input.fileName);
    const keyParts = [
      this.normalizeSegment(this.config.uploadKeyPrefix),
      normalizedTarget,
      actorSegment,
    ];

    if (entitySegment) {
      keyParts.push(entitySegment);
    }

    const key = `${keyParts.join('/')}/${createUlid()}-${fileName}`;
    const presigned = await this.s3StorageService.createPresignedUploadUrl({
      bucket: this.config.s3BucketName,
      key,
      contentType,
      expiresInSeconds: this.config.uploadPresignTtlSeconds,
    });

    return {
      method: 'PUT',
      url: presigned.url,
      key,
      bucket: this.config.s3BucketName,
      target: input.target,
      entityId: input.entityId,
      contentType,
      expiresAt: presigned.expiresAt,
    };
  }

  async presignDownload(
    actor: AuthenticatedUser,
    input: PresignDownloadRequestDto,
  ): Promise<{ method: 'GET'; url: string; key: string; expiresAt: string }> {
    if (!UPLOAD_TARGETS.includes(input.target)) {
      throw new BadRequestException('target is invalid.');
    }

    if (!input.key?.trim()) {
      throw new BadRequestException('key is required.');
    }

    if (input.target !== 'AVATAR') {
      await this.assertTargetAccess(actor, {
        target: input.target,
        entityId: input.entityId,
      });
    }

    this.assertKeyMatchesTarget(input);

    const presigned = await this.s3StorageService.createPresignedDownloadUrl({
      bucket: this.config.s3BucketName,
      key: input.key,
      expiresInSeconds: this.config.uploadPresignTtlSeconds,
    });

    return {
      method: 'GET',
      url: presigned.url,
      key: input.key,
      expiresAt: presigned.expiresAt,
    };
  }

  async deleteMedia(
    actor: AuthenticatedUser,
    input: DeleteUploadRequestDto,
  ): Promise<{ deleted: true; key: string; removedAt: string }> {
    if (!UPLOAD_TARGETS.includes(input.target)) {
      throw new BadRequestException('target is invalid.');
    }

    if (!input.key?.trim()) {
      throw new BadRequestException('key is required.');
    }

    await this.assertTargetAccess(actor, {
      target: input.target,
      entityId: input.entityId,
    });
    this.assertKeyOwnership(actor, input);

    await this.s3StorageService.deleteObject({
      bucket: this.config.s3BucketName,
      key: input.key,
    });

    return {
      deleted: true,
      key: input.key,
      removedAt: nowIso(),
    };
  }

  private buildStoredFileName(originalName: string): string {
    const trimmed = originalName.trim();

    if (!trimmed) {
      return 'file.bin';
    }

    const sanitized =
      trimmed.replace(/\\+/g, '/').split('/').pop() ?? 'file.bin';
    const normalized = sanitized
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    return normalized || 'file.bin';
  }

  private normalizeSegment(value: string): string {
    const normalized = value
      .trim()
      .replace(/[^a-zA-Z0-9/_-]+/g, '-')
      .replace(/\/+/g, '/')
      .replace(/\/\//g, '/')
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase();

    return normalized || 'default';
  }

  private assertKeyOwnership(
    actor: AuthenticatedUser,
    input: DeleteUploadRequestDto,
  ): void {
    const key = input.key.trim().replace(/^\/+|\/+$/g, '');
    const parts = key.split('/').filter(Boolean);
    const expectedPrefix = this.normalizeSegment(this.config.uploadKeyPrefix);
    const expectedTarget = this.normalizeSegment(input.target.toLowerCase());
    const expectedActor = this.normalizeSegment(actor.id);
    const expectedEntity = input.entityId
      ? this.normalizeSegment(input.entityId)
      : undefined;

    if (
      parts.length < 4 ||
      parts[0] !== expectedPrefix ||
      parts[1] !== expectedTarget ||
      parts[2] !== expectedActor
    ) {
      throw new ForbiddenException('You cannot delete this upload.');
    }

    if (expectedEntity) {
      if (parts.length < 5 || parts[3] !== expectedEntity) {
        throw new ForbiddenException('You cannot delete this upload.');
      }
      return;
    }

    if (parts.length > 4) {
      throw new BadRequestException(
        'entityId is required to delete this upload.',
      );
    }
  }

  private assertKeyMatchesTarget(input: {
    target: (typeof UPLOAD_TARGETS)[number];
    entityId?: string;
    key: string;
  }): void {
    const key = input.key.trim().replace(/^\/+|\/+$/g, '');
    const parts = key.split('/').filter(Boolean);
    const expectedPrefix = this.normalizeSegment(this.config.uploadKeyPrefix);
    const expectedTarget = this.normalizeSegment(input.target.toLowerCase());
    const expectedEntity = input.entityId
      ? this.normalizeSegment(input.entityId)
      : undefined;

    if (parts.length < 4 || parts[0] !== expectedPrefix) {
      throw new BadRequestException('key is invalid.');
    }

    if (parts[1] !== expectedTarget) {
      throw new BadRequestException('key does not match target.');
    }

    if (expectedEntity) {
      if (parts.length < 5 || parts[3] !== expectedEntity) {
        throw new BadRequestException('key does not match entityId.');
      }
      return;
    }

    if (parts.length > 4) {
      throw new BadRequestException(
        'entityId is required to access this upload.',
      );
    }
  }

  private async assertTargetAccess(
    actor: AuthenticatedUser,
    input: { target: (typeof UPLOAD_TARGETS)[number]; entityId?: string },
  ): Promise<void> {
    const entityId = input.entityId?.trim();

    if (input.target === 'AVATAR') {
      if (entityId && entityId !== actor.id) {
        throw new ForbiddenException('You can only upload your own avatar.');
      }

      return;
    }

    if (!entityId) {
      return;
    }

    if (input.target === 'REPORT') {
      const report = await this.repository.get<StoredReport>(
        this.config.dynamodbReportsTableName,
        makeReportPk(entityId),
        makeReportMetadataSk(),
      );

      if (!report || report.entityType !== 'REPORT' || report.deletedAt) {
        throw new NotFoundException('Report not found.');
      }

      if (!this.authorizationService.canReadReport(actor, report)) {
        throw new ForbiddenException(
          'You cannot upload media for this report.',
        );
      }

      return;
    }

    if (input.target === 'MESSAGE') {
      await this.conversationsService.resolveConversationAccess(
        actor,
        entityId,
        true,
      );
    }
  }
}
