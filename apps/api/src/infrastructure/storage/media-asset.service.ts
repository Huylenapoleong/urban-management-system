import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { UploadTarget } from '@urban/shared-constants';
import type { MediaAsset } from '@urban/shared-types';
import { AppConfigService } from '../config/app-config.service';
import { S3StorageService } from './s3-storage.service';

@Injectable()
export class MediaAssetService {
  constructor(
    private readonly config: AppConfigService,
    private readonly s3StorageService: S3StorageService,
  ) {}

  assertKeyMatchesTarget(input: {
    target: UploadTarget;
    entityId?: string;
    key: string;
  }): void {
    const parsedKey = this.parseKey(input.key);
    const expectedPrefix = this.normalizeSegment(this.config.uploadKeyPrefix);
    const expectedTarget = this.normalizeSegment(input.target.toLowerCase());
    const expectedEntity = input.entityId
      ? this.normalizeSegment(input.entityId)
      : undefined;

    if (parsedKey.prefix !== expectedPrefix) {
      throw new BadRequestException('key is invalid.');
    }

    if (parsedKey.target !== expectedTarget) {
      throw new BadRequestException('key does not match target.');
    }

    if (expectedEntity) {
      if (!parsedKey.entityId || parsedKey.entityId !== expectedEntity) {
        throw new BadRequestException('key does not match entityId.');
      }

      return;
    }

    if (parsedKey.entityId) {
      throw new BadRequestException(
        'entityId is required to access this upload.',
      );
    }
  }

  assertKeyTarget(input: { target: UploadTarget; key: string }): void {
    const parsedKey = this.parseKey(input.key);
    const expectedPrefix = this.normalizeSegment(this.config.uploadKeyPrefix);
    const expectedTarget = this.normalizeSegment(input.target.toLowerCase());

    if (parsedKey.prefix !== expectedPrefix) {
      throw new BadRequestException('key is invalid.');
    }

    if (parsedKey.target !== expectedTarget) {
      throw new BadRequestException('key does not match target.');
    }
  }

  assertKeyOwnership(input: {
    ownerUserId: string;
    target: UploadTarget;
    entityId?: string;
    key: string;
  }): void {
    const parsedKey = this.parseKey(input.key);
    const expectedPrefix = this.normalizeSegment(this.config.uploadKeyPrefix);
    const expectedTarget = this.normalizeSegment(input.target.toLowerCase());
    const expectedOwner = this.normalizeSegment(input.ownerUserId);
    const expectedEntity = input.entityId
      ? this.normalizeSegment(input.entityId)
      : undefined;

    if (
      parsedKey.prefix !== expectedPrefix ||
      parsedKey.target !== expectedTarget ||
      parsedKey.ownerUserId !== expectedOwner
    ) {
      throw new ForbiddenException('You cannot delete this upload.');
    }

    if (expectedEntity) {
      if (!parsedKey.entityId || parsedKey.entityId !== expectedEntity) {
        throw new ForbiddenException('You cannot delete this upload.');
      }

      return;
    }

    if (parsedKey.entityId) {
      throw new BadRequestException(
        'entityId is required to delete this upload.',
      );
    }
  }

  createOwnedAssetReference(input: {
    key: string;
    target: UploadTarget;
    ownerUserId: string;
    entityId?: string;
  }): MediaAsset {
    const parsedKey = this.parseKey(input.key);
    const expectedPrefix = this.normalizeSegment(this.config.uploadKeyPrefix);
    const expectedTarget = this.normalizeSegment(input.target.toLowerCase());
    const expectedOwner = this.normalizeSegment(input.ownerUserId);
    const expectedEntity = input.entityId
      ? this.normalizeSegment(input.entityId)
      : undefined;

    if (parsedKey.prefix !== expectedPrefix) {
      throw new BadRequestException('key is invalid.');
    }

    if (parsedKey.target !== expectedTarget) {
      throw new BadRequestException('key does not match target.');
    }

    if (parsedKey.ownerUserId !== expectedOwner) {
      throw new ForbiddenException('You cannot use this uploaded file.');
    }

    if (
      expectedEntity &&
      parsedKey.entityId &&
      parsedKey.entityId !== expectedEntity
    ) {
      throw new BadRequestException('key does not match entityId.');
    }

    return {
      key: parsedKey.normalizedKey,
      bucket: this.config.s3BucketName || undefined,
      target: input.target,
      entityId: input.entityId ?? parsedKey.entityId,
      fileName: parsedKey.fileName,
      uploadedBy: input.ownerUserId,
    };
  }

  async resolveAsset(
    asset?: MediaAsset | null,
  ): Promise<MediaAsset | undefined> {
    if (!asset?.key) {
      return undefined;
    }

    const bucket = asset.bucket || this.config.s3BucketName;

    if (!bucket) {
      return {
        ...asset,
        bucket: undefined,
      };
    }

    try {
      const resolved = await this.s3StorageService.resolveObjectUrl({
        bucket,
        key: asset.key,
      });

      return {
        ...asset,
        bucket,
        resolvedUrl: resolved.url,
        expiresAt: resolved.expiresAt,
      };
    } catch {
      return {
        ...asset,
        bucket,
      };
    }
  }

  async resolveAssetWithLegacyUrl(
    asset?: MediaAsset | null,
    legacyUrl?: string | null,
  ): Promise<{ asset?: MediaAsset; url?: string }> {
    const resolvedAsset = await this.resolveAsset(asset);

    if (resolvedAsset?.resolvedUrl) {
      return {
        asset: resolvedAsset,
        url: resolvedAsset.resolvedUrl,
      };
    }

    return {
      asset: resolvedAsset,
      url: legacyUrl ?? undefined,
    };
  }

  async resolveAvatarFields<
    T extends { avatarAsset?: MediaAsset; avatarUrl?: string },
  >(value: T): Promise<T> {
    const { asset, url } = await this.resolveAssetWithLegacyUrl(
      value.avatarAsset,
      value.avatarUrl,
    );

    return {
      ...value,
      avatarAsset: asset,
      avatarUrl: url,
    };
  }

  async resolveAssetCollectionWithLegacyUrls(
    assets?: MediaAsset[] | null,
    legacyUrls?: string[] | null,
  ): Promise<{ assets: MediaAsset[]; urls: string[] }> {
    if (assets && assets.length > 0) {
      const resolvedAssets = (
        await Promise.all(assets.map((asset) => this.resolveAsset(asset)))
      ).filter((asset): asset is MediaAsset => Boolean(asset));

      return {
        assets: resolvedAssets,
        urls: resolvedAssets
          .map((asset) => asset.resolvedUrl)
          .filter(
            (url): url is string => typeof url === 'string' && url.length > 0,
          ),
      };
    }

    return {
      assets: [],
      urls: legacyUrls ? [...legacyUrls] : [],
    };
  }

  normalizeSegment(value: string): string {
    const normalized = value
      .trim()
      .replace(/[^a-zA-Z0-9/_-]+/g, '-')
      .replace(/\/+/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase();

    return normalized || 'default';
  }

  private parseKey(key: string): {
    normalizedKey: string;
    prefix: string;
    target: string;
    ownerUserId: string;
    entityId?: string;
    fileName: string;
  } {
    const normalizedKey = key.trim().replace(/^\/+|\/+$/g, '');
    const parts = normalizedKey.split('/').filter(Boolean);

    if (parts.length < 4) {
      throw new BadRequestException('key is invalid.');
    }

    const [prefix, target, ownerUserId, ...tail] = parts;
    const fileName = tail[tail.length - 1];

    if (!prefix || !target || !ownerUserId || !fileName) {
      throw new BadRequestException('key is invalid.');
    }

    const entityId =
      tail.length > 1 ? tail.slice(0, -1).join('/') || undefined : undefined;

    return {
      normalizedKey,
      prefix,
      target,
      ownerUserId,
      entityId,
      fileName,
    };
  }
}
