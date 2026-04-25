import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UPLOAD_TARGETS } from '@urban/shared-constants';
import type {
  ApiResponseMeta,
  ApiSuccessResponse,
  AuthenticatedUser,
  UploadedAsset,
} from '@urban/shared-types';
import {
  createUlid,
  makeConversationPk,
  makeReportMetadataSk,
  makeReportPk,
  makeUserPk,
  makeUserProfileSk,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import {
  buildPaginatedResponse,
  paginateSortedItems,
} from '../../common/pagination';
import type {
  StoredMessage,
  StoredReport,
  StoredUser,
} from '../../common/storage-records';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { MediaAssetService } from '../../infrastructure/storage/media-asset.service';
import { S3StorageService } from '../../infrastructure/storage/s3-storage.service';
import type {
  DeleteUploadRequestDto,
  ListUploadsQueryDto,
  PresignDownloadRequestDto,
  PresignUploadRequestDto,
  UploadMediaRequestDto,
} from '../../common/openapi/swagger.models';
import { optionalQueryString, parseLimit } from '../../common/validation';
import { ConversationsService } from '../conversations/conversations.service';

interface UploadedBinaryFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface UploadListItem {
  key: string;
  bucket: string;
  target: UploadTarget;
  entityId?: string;
  fileName: string;
  size?: number;
  uploadedBy: string;
  uploadedAt?: string;
  url: string;
  expiresAt?: string;
  isInUse: boolean;
}

interface UploadUsageState {
  keys: Set<string>;
  legacyUrls: Set<string>;
}

type UploadMediaInput = Pick<UploadMediaRequestDto, 'target' | 'entityId'>;
type UploadTarget = (typeof UPLOAD_TARGETS)[number];

@Injectable()
export class UploadsService {
  constructor(
    private readonly config: AppConfigService,
    private readonly s3StorageService: S3StorageService,
    private readonly mediaAssetService: MediaAssetService,
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly conversationsService: ConversationsService,
  ) {}

  async uploadMedia(
    actor: AuthenticatedUser,
    input: UploadMediaInput,
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

    const normalizedTarget = this.mediaAssetService.normalizeSegment(
      input.target.toLowerCase(),
    );
    const actorSegment = this.mediaAssetService.normalizeSegment(actor.id);
    const entitySegment = input.entityId
      ? this.mediaAssetService.normalizeSegment(input.entityId)
      : undefined;
    const fileName = this.buildStoredFileName(file.originalname);
    const keyParts = [
      this.mediaAssetService.normalizeSegment(this.config.uploadKeyPrefix),
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

  async listMedia(
    actor: AuthenticatedUser,
    query: Pick<
      ListUploadsQueryDto,
      'target' | 'entityId' | 'limit' | 'cursor'
    >,
  ): Promise<ApiSuccessResponse<UploadListItem[], ApiResponseMeta>> {
    const rawTarget = optionalQueryString(query.target, 'target');
    const entityId = optionalQueryString(query.entityId, 'entityId');
    const limit = parseLimit(query.limit);

    if (!rawTarget) {
      throw new BadRequestException('target is required.');
    }

    if (!UPLOAD_TARGETS.includes(rawTarget as UploadTarget)) {
      throw new BadRequestException('target is invalid.');
    }

    const target = rawTarget as UploadTarget;

    if ((target === 'REPORT' || target === 'MESSAGE') && !entityId) {
      throw new BadRequestException('entityId is required for this target.');
    }

    await this.assertTargetAccess(actor, {
      target,
      entityId,
    });

    const prefix = this.buildOwnedPrefix(actor.id, target, entityId);
    const objects = await this.s3StorageService.listObjects({
      bucket: this.config.s3BucketName,
      prefix,
    });
    const usage = await this.loadUsageState(actor, target, entityId);
    const page = paginateSortedItems(
      objects,
      limit,
      query.cursor,
      (item) => item.lastModified,
      (item) => item.key,
    );

    return buildPaginatedResponse(
      await Promise.all(
        page.items.map((item) =>
          this.buildUploadListItem(actor.id, target, item, usage),
        ),
      ),
      page.nextCursor,
    );
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

    const normalizedTarget = this.mediaAssetService.normalizeSegment(
      input.target.toLowerCase(),
    );
    const actorSegment = this.mediaAssetService.normalizeSegment(actor.id);
    const entitySegment = input.entityId
      ? this.mediaAssetService.normalizeSegment(input.entityId)
      : undefined;
    const fileName = this.buildStoredFileName(input.fileName);
    const keyParts = [
      this.mediaAssetService.normalizeSegment(this.config.uploadKeyPrefix),
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

    const describedKey = this.mediaAssetService.describeKey(input.key);
    const effectiveEntityId = input.entityId?.trim() || describedKey.entityId;

    if (input.target !== 'AVATAR') {
      await this.assertTargetAccess(actor, {
        target: input.target,
        entityId: effectiveEntityId,
      });
      this.mediaAssetService.assertKeyMatchesTarget({
        ...input,
        entityId: effectiveEntityId,
      });
    } else {
      this.mediaAssetService.assertKeyTarget(input);
    }

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

    const describedKey = this.mediaAssetService.describeKey(input.key);
    const effectiveEntityId = input.entityId?.trim() || describedKey.entityId;

    await this.assertTargetAccess(actor, {
      target: input.target,
      entityId: effectiveEntityId,
    });
    this.mediaAssetService.assertKeyOwnership({
      ownerUserId: actor.id,
      target: input.target,
      entityId: effectiveEntityId,
      key: input.key,
    });
    await this.assertAssetNotInUse(actor, {
      target: input.target,
      entityId: effectiveEntityId,
      key: describedKey.normalizedKey,
    });

    await this.s3StorageService.deleteObject({
      bucket: this.config.s3BucketName,
      key: describedKey.normalizedKey,
    });

    return {
      deleted: true,
      key: describedKey.normalizedKey,
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

  private buildOwnedPrefix(
    ownerUserId: string,
    target: UploadTarget,
    entityId?: string,
  ): string {
    const prefixParts = [
      this.mediaAssetService.normalizeSegment(this.config.uploadKeyPrefix),
      this.mediaAssetService.normalizeSegment(target.toLowerCase()),
      this.mediaAssetService.normalizeSegment(ownerUserId),
    ];

    if (target !== 'AVATAR' && entityId) {
      prefixParts.push(this.mediaAssetService.normalizeSegment(entityId));
    }

    return `${prefixParts.join('/')}/`;
  }

  private async buildUploadListItem(
    ownerUserId: string,
    target: UploadTarget,
    item: { key: string; size?: number; lastModified?: string },
    usage: UploadUsageState,
  ): Promise<UploadListItem> {
    const describedKey = this.mediaAssetService.describeKey(item.key);
    const resolved = await this.s3StorageService.resolveObjectUrl({
      bucket: this.config.s3BucketName,
      key: describedKey.normalizedKey,
    });
    const objectUrl = this.s3StorageService.getObjectUrl({
      bucket: this.config.s3BucketName,
      key: describedKey.normalizedKey,
    });

    return {
      key: describedKey.normalizedKey,
      bucket: this.config.s3BucketName,
      target,
      entityId: describedKey.entityId,
      fileName: describedKey.fileName,
      size: item.size,
      uploadedBy: ownerUserId,
      uploadedAt: item.lastModified,
      url: resolved.url,
      expiresAt: resolved.expiresAt,
      isInUse:
        usage.keys.has(describedKey.normalizedKey) ||
        usage.legacyUrls.has(objectUrl),
    };
  }

  private async assertAssetNotInUse(
    actor: AuthenticatedUser,
    input: {
      target: UploadTarget;
      entityId?: string;
      key: string;
    },
  ): Promise<void> {
    const usage = await this.loadUsageState(
      actor,
      input.target,
      input.entityId,
    );
    const objectUrl = this.s3StorageService.getObjectUrl({
      bucket: this.config.s3BucketName,
      key: input.key,
    });
    const isInUse =
      usage.keys.has(input.key) || usage.legacyUrls.has(objectUrl);

    if (!isInUse) {
      return;
    }

    if (input.target === 'AVATAR') {
      throw new ConflictException(
        'Cannot delete the avatar currently in use. Update your profile avatar first.',
      );
    }

    if (input.target === 'REPORT') {
      throw new ConflictException(
        'Cannot delete media currently attached to this report. Update the report first.',
      );
    }

    if (input.target === 'MESSAGE') {
      throw new ConflictException(
        'Cannot delete media currently attached to an active message. Update or recall the message first.',
      );
    }
  }

  private async loadUsageState(
    actor: AuthenticatedUser,
    target: UploadTarget,
    entityId?: string,
  ): Promise<UploadUsageState> {
    if (target === 'AVATAR') {
      const profile = await this.repository.get<StoredUser>(
        this.config.dynamodbUsersTableName,
        makeUserPk(actor.id),
        makeUserProfileSk(),
      );

      if (!profile || profile.deletedAt || profile.status === 'DELETED') {
        return {
          keys: new Set<string>(),
          legacyUrls: new Set<string>(),
        };
      }

      return {
        keys: new Set(
          profile.avatarAsset?.key ? [profile.avatarAsset.key] : undefined,
        ),
        legacyUrls: new Set(
          profile.avatarUrl ? [profile.avatarUrl] : undefined,
        ),
      };
    }

    if (target === 'REPORT' && entityId) {
      const report = await this.repository.get<StoredReport>(
        this.config.dynamodbReportsTableName,
        makeReportPk(entityId),
        makeReportMetadataSk(),
      );

      if (!report || report.deletedAt) {
        return {
          keys: new Set<string>(),
          legacyUrls: new Set<string>(),
        };
      }

      return {
        keys: new Set(
          (report.mediaAssets ?? [])
            .map((asset) => asset.key)
            .filter((key): key is string => Boolean(key)),
        ),
        legacyUrls: new Set(report.mediaUrls ?? []),
      };
    }

    if (target === 'MESSAGE' && entityId) {
      const messages = await this.repository.queryByPk<StoredMessage>(
        this.config.dynamodbMessagesTableName,
        makeConversationPk(entityId),
        {
          beginsWith: 'MSG#',
        },
      );
      const activeMessages = messages.filter(
        (message) =>
          message.entityType === 'MESSAGE' &&
          !message.deletedAt &&
          !message.recalledAt,
      );

      return {
        keys: new Set(
          activeMessages
            .map((message) => message.attachmentAsset?.key)
            .filter((key): key is string => Boolean(key)),
        ),
        legacyUrls: new Set(
          activeMessages
            .map((message) => message.attachmentUrl)
            .filter((url): url is string => Boolean(url)),
        ),
      };
    }

    return {
      keys: new Set<string>(),
      legacyUrls: new Set<string>(),
    };
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
