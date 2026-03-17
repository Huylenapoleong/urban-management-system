import { BadRequestException, Injectable } from '@nestjs/common';
import { UPLOAD_TARGETS } from '@urban/shared-constants';
import type { AuthenticatedUser, UploadedAsset } from '@urban/shared-types';
import { createUlid, nowIso } from '@urban/shared-utils';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { S3StorageService } from '../../infrastructure/storage/s3-storage.service';
import type { UploadMediaRequestDto } from '../../common/openapi/swagger.models';

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
}
