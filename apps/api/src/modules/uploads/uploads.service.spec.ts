import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { StoredReport, StoredUser } from '../../common/storage-records';
import { MediaAssetService } from '../../infrastructure/storage/media-asset.service';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  const config = {
    dynamodbMessagesTableName: 'Messages',
    dynamodbReportsTableName: 'Reports',
    dynamodbUsersTableName: 'Users',
    s3BucketName: 'test-bucket',
    uploadAllowedMimeTypes: ['image/jpeg', 'image/png'],
    uploadKeyPrefix: 'uploads',
    uploadMaxFileSizeBytes: 2 * 1024 * 1024,
    uploadPresignTtlSeconds: 300,
  };
  const s3StorageService = {
    uploadObject: jest.fn(),
    deleteObject: jest.fn(),
    createPresignedUploadUrl: jest.fn(),
    createPresignedDownloadUrl: jest.fn(),
    getObjectUrl: jest.fn(),
    listObjects: jest.fn(),
    resolveObjectUrl: jest.fn(),
  };
  const repository = {
    get: jest.fn(),
    queryByPk: jest.fn(),
  };
  const authorizationService = {
    canReadReport: jest.fn(),
  };
  const conversationsService = {
    resolveConversationAccess: jest.fn(),
  };

  const actor = {
    id: 'user-1',
    fullName: 'Citizen One',
    role: 'CITIZEN' as const,
    locationCode: 'VN-HCM-BQ1-P01',
    status: 'ACTIVE' as const,
    createdAt: '2026-04-09T00:00:00.000Z',
    updatedAt: '2026-04-09T00:00:00.000Z',
  };

  const file = {
    buffer: Buffer.from('sample-binary'),
    mimetype: 'image/jpeg',
    originalname: 'test.jpg',
    size: 1024,
  };

  const report: StoredReport = {
    PK: 'REPORT#report-1',
    SK: 'METADATA',
    entityType: 'REPORT',
    GSI1PK: 'CAT#INFRASTRUCTURE#LOC#VN-HCM-BQ1-P01',
    GSI2PK: 'STATUS#NEW#LOC#VN-HCM-BQ1-P01',
    reportId: 'report-1',
    userId: actor.id,
    title: 'Report title',
    description: 'Report description',
    category: 'INFRASTRUCTURE',
    locationCode: actor.locationCode,
    status: 'NEW',
    priority: 'MEDIUM',
    mediaAssets: [],
    mediaUrls: [],
    deletedAt: null,
    createdAt: '2026-04-09T00:00:00.000Z',
    updatedAt: '2026-04-09T00:00:00.000Z',
  };
  const currentUser: StoredUser = {
    PK: 'USER#user-1',
    SK: 'PROFILE',
    entityType: 'USER_PROFILE',
    GSI1SK: 'USER',
    userId: actor.id,
    phone: '+84901111111',
    email: 'citizen.one@example.com',
    passwordHash: 'hashed-password',
    fullName: actor.fullName,
    role: actor.role,
    locationCode: actor.locationCode,
    unit: undefined,
    avatarAsset: {
      key: 'uploads/avatar/user-1/avatar-current.jpg',
      target: 'AVATAR',
      uploadedBy: actor.id,
    },
    avatarUrl:
      'https://cdn.example.com/test-bucket/uploads/avatar/user-1/avatar-current.jpg',
    status: 'ACTIVE',
    deletedAt: null,
    createdAt: '2026-04-09T00:00:00.000Z',
    updatedAt: '2026-04-09T00:00:00.000Z',
  };

  let service: UploadsService;
  let mediaAssetService: MediaAssetService;

  beforeEach(() => {
    jest.clearAllMocks();
    mediaAssetService = new MediaAssetService(
      config as never,
      s3StorageService as never,
    );
    service = new UploadsService(
      config as never,
      s3StorageService as never,
      mediaAssetService as never,
      repository as never,
      authorizationService as never,
      conversationsService as never,
    );
    s3StorageService.uploadObject.mockResolvedValue({
      bucket: 'test-bucket',
      key: 'uploads/report/user-1/report-1/file.jpg',
      url: 'https://cdn.example.com/file.jpg',
    });
    s3StorageService.deleteObject.mockResolvedValue(undefined);
    s3StorageService.createPresignedUploadUrl.mockResolvedValue({
      url: 'https://cdn.example.com/presign-upload',
      expiresAt: '2026-04-09T00:10:00.000Z',
    });
    s3StorageService.createPresignedDownloadUrl.mockResolvedValue({
      url: 'https://cdn.example.com/presign-download',
      expiresAt: '2026-04-09T00:10:00.000Z',
    });
    s3StorageService.getObjectUrl.mockImplementation(
      ({ bucket, key }: { bucket: string; key: string }) =>
        `https://cdn.example.com/${bucket}/${key}`,
    );
    s3StorageService.listObjects.mockResolvedValue([]);
    s3StorageService.resolveObjectUrl.mockImplementation(
      ({ key }: { key: string }) =>
        Promise.resolve({
          url: `https://cdn.example.com/test-bucket/${key}`,
          expiresAt: '2026-04-09T00:10:00.000Z',
        }),
    );
    repository.get.mockResolvedValue(report);
    authorizationService.canReadReport.mockReturnValue(true);
    conversationsService.resolveConversationAccess.mockResolvedValue({
      conversationId: 'group:group-1',
      conversationKey: 'GRP#group-1',
      participants: [actor.id, 'user-2'],
      isGroup: true,
    });
    repository.queryByPk.mockResolvedValue([]);
  });

  it('blocks avatar uploads for another user id', async () => {
    await expect(
      service.uploadMedia(
        actor,
        {
          target: 'AVATAR',
          entityId: 'user-2',
        },
        file,
      ),
    ).rejects.toThrow(
      new ForbiddenException('You can only upload your own avatar.'),
    );
  });

  it('rejects report target when report does not exist', async () => {
    repository.get.mockResolvedValue(undefined);

    await expect(
      service.uploadMedia(
        actor,
        {
          target: 'REPORT',
          entityId: 'report-1',
        },
        file,
      ),
    ).rejects.toThrow(new NotFoundException('Report not found.'));
  });

  it('blocks report uploads when actor cannot access report scope', async () => {
    repository.get.mockResolvedValue(report);
    authorizationService.canReadReport.mockReturnValue(false);

    await expect(
      service.uploadMedia(
        actor,
        {
          target: 'REPORT',
          entityId: 'report-1',
        },
        file,
      ),
    ).rejects.toThrow(
      new ForbiddenException('You cannot upload media for this report.'),
    );
  });

  it('enforces message target access via conversation resolver', async () => {
    await service.uploadMedia(
      actor,
      {
        target: 'MESSAGE',
        entityId: 'group:group-1',
      },
      file,
    );

    expect(conversationsService.resolveConversationAccess).toHaveBeenCalledWith(
      actor,
      'group:group-1',
      true,
    );
  });

  it('deletes upload when key matches actor and entity', async () => {
    repository.get.mockResolvedValue({
      ...report,
      mediaAssets: [],
      mediaUrls: [],
    });

    await service.deleteMedia(actor, {
      target: 'REPORT',
      entityId: 'report-1',
      key: 'uploads/report/user-1/report-1/file.jpg',
    });

    expect(s3StorageService.deleteObject).toHaveBeenCalledWith({
      bucket: 'test-bucket',
      key: 'uploads/report/user-1/report-1/file.jpg',
    });
  });

  it('rejects delete when upload belongs to another user', async () => {
    await expect(
      service.deleteMedia(actor, {
        target: 'REPORT',
        entityId: 'report-1',
        key: 'uploads/report/other-user/report-1/file.jpg',
      }),
    ).rejects.toThrow(new ForbiddenException('You cannot delete this upload.'));
  });

  it('infers entityId from the key when deleting an upload', async () => {
    repository.get.mockResolvedValue({
      ...report,
      mediaAssets: [],
      mediaUrls: [],
    });

    await service.deleteMedia(actor, {
      target: 'REPORT',
      key: 'uploads/report/user-1/report-1/file.jpg',
    });

    expect(s3StorageService.deleteObject).toHaveBeenCalledWith({
      bucket: 'test-bucket',
      key: 'uploads/report/user-1/report-1/file.jpg',
    });
  });

  it('blocks deleting the avatar currently in use', async () => {
    repository.get.mockResolvedValue(currentUser);

    await expect(
      service.deleteMedia(actor, {
        target: 'AVATAR',
        key: 'uploads/avatar/user-1/avatar-current.jpg',
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Cannot delete the avatar currently in use. Update your profile avatar first.',
      ),
    );
  });

  it('lists avatar uploads and marks the active avatar', async () => {
    repository.get.mockResolvedValue(currentUser);
    s3StorageService.listObjects.mockResolvedValue([
      {
        key: 'uploads/avatar/user-1/avatar-old.jpg',
        size: 111,
        lastModified: '2026-04-09T00:00:00.000Z',
      },
      {
        key: 'uploads/avatar/user-1/avatar-current.jpg',
        size: 222,
        lastModified: '2026-04-10T00:00:00.000Z',
      },
    ]);

    const result = await service.listMedia(actor, {
      target: 'AVATAR',
      limit: '20',
    });

    expect(result.data).toEqual([
      expect.objectContaining({
        key: 'uploads/avatar/user-1/avatar-current.jpg',
        isInUse: true,
      }),
      expect.objectContaining({
        key: 'uploads/avatar/user-1/avatar-old.jpg',
        isInUse: false,
      }),
    ]);
    expect(result.meta).toEqual({
      count: 2,
      nextCursor: undefined,
    });
  });

  it('presigns upload and returns key', async () => {
    const result = await service.presignUpload(actor, {
      target: 'REPORT',
      entityId: 'report-1',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      size: 1024,
    });

    expect(result.method).toBe('PUT');
    expect(result.url).toBe('https://cdn.example.com/presign-upload');
    expect(result.key).toContain('uploads/report/user-1/report-1/');
  });

  it('presigns download when key matches target', async () => {
    const result = await service.presignDownload(actor, {
      target: 'REPORT',
      entityId: 'report-1',
      key: 'uploads/report/user-1/report-1/file.jpg',
    });

    expect(result.method).toBe('GET');
    expect(result.url).toBe('https://cdn.example.com/presign-download');
  });

  it('allows avatar presign download without entity access checks', async () => {
    const result = await service.presignDownload(actor, {
      target: 'AVATAR',
      key: 'uploads/avatar/other-user/01JXYZ-avatar.jpg',
    });

    expect(result.method).toBe('GET');
    expect(result.url).toBe('https://cdn.example.com/presign-download');
  });
});
