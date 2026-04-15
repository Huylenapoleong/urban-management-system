import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedUser } from '@urban/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiCreatedEnvelopeResponse } from '../../common/openapi/swagger-envelope';
import { ApiOkEnvelopeResponse } from '../../common/openapi/swagger-envelope';
import {
  ApiBadRequestExamples,
  ApiConflictExamples,
  ApiForbiddenExamples,
  ApiNotFoundExamples,
} from '../../common/openapi/swagger-errors';
import {
  DeleteUploadRequestDto,
  DeleteUploadResultDto,
  ErrorResponseDto,
  ListUploadsQueryDto,
  PresignDownloadRequestDto,
  PresignDownloadResultDto,
  PresignUploadRequestDto,
  PresignUploadResultDto,
  UploadListItemDto,
  UploadMediaRequestDto,
  UploadLimitsDto,
  UploadedAssetDto,
} from '../../common/openapi/swagger.models';
import { UploadsService } from './uploads.service';

const ABSOLUTE_MAX_UPLOAD_FILE_SIZE_BYTES = 100 * 1024 * 1024;

interface UploadedBinaryFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@ApiTags('Uploads')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: ABSOLUTE_MAX_UPLOAD_FILE_SIZE_BYTES,
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload media file to S3',
    description:
      'Multipart upload endpoint for small-to-medium files. For large uploads or direct browser/mobile uploads, prefer the presigned upload flow.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: UploadMediaRequestDto,
    description:
      'Send `target` and optional `entityId` together with a `file` multipart part. The returned `key` should be stored by FE and later sent as `avatarKey`, `attachmentKey`, or `mediaKeys`.',
  })
  @ApiCreatedEnvelopeResponse(UploadedAssetDto, {
    description:
      'Uploaded asset metadata, including the canonical S3 key that should be persisted by FE/BE business flows.',
  })
  @ApiBadRequestExamples('The multipart upload request is invalid.', [
    {
      name: 'fileRequired',
      summary: 'Missing multipart file',
      message: 'file is required.',
      path: '/api/uploads/media',
    },
    {
      name: 'avatarImageOnly',
      summary: 'Avatar target requires image content',
      message: 'Avatar uploads must be images.',
      path: '/api/uploads/media',
    },
    {
      name: 'mimeRejected',
      summary: 'File type not allowed',
      message: 'file type is not allowed.',
      path: '/api/uploads/media',
    },
  ])
  @ApiForbiddenExamples(
    'The actor is not allowed to upload media for the requested target.',
    [
      {
        name: 'foreignAvatarForbidden',
        summary: 'Cannot upload avatar for another user',
        message: 'You can only upload your own avatar.',
        path: '/api/uploads/media',
      },
      {
        name: 'reportUploadForbidden',
        summary: 'No access to report media target',
        message: 'You cannot upload media for this report.',
        path: '/api/uploads/media',
      },
    ],
  )
  @ApiNotFoundExamples('The target entity does not exist.', [
    {
      name: 'reportMissing',
      summary: 'Report target not found',
      message: 'Report not found.',
      path: '/api/uploads/media',
    },
  ])
  uploadMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UploadMediaRequestDto,
    @UploadedFile() file?: UploadedBinaryFile,
  ) {
    return this.uploadsService.uploadMedia(user, body, file);
  }

  @Get('media')
  @ApiOperation({
    summary: 'List my uploaded media for a target',
    description:
      'Returns actor-owned uploads for a target. Use `target=AVATAR` to build an avatar history picker. For `REPORT` and `MESSAGE`, `entityId` is required so the API can scope the listing safely.',
  })
  @ApiQuery({
    name: 'target',
    required: true,
    enum: ['REPORT', 'MESSAGE', 'AVATAR', 'GENERAL'],
    description:
      'Required upload target. `AVATAR` lists the current user avatar history.',
  })
  @ApiQuery({
    name: 'entityId',
    required: false,
    type: String,
    description:
      'Required for `REPORT` and `MESSAGE`. Optional for `AVATAR` and `GENERAL`.',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Opaque pagination cursor returned by a previous response.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Page size. Defaults to the API default and is capped safely.',
  })
  @ApiOkEnvelopeResponse(UploadListItemDto, {
    description:
      'Actor-owned upload history for the requested target. `isInUse=true` means FE should not offer destructive deletion without replacing the reference first.',
    isArray: true,
  })
  @ApiBadRequestExamples('The list-uploads query is invalid.', [
    {
      name: 'listTargetRequired',
      summary: 'Missing target filter',
      message: 'target is required.',
      path: '/api/uploads/media',
    },
    {
      name: 'listEntityRequired',
      summary: 'entityId required for REPORT or MESSAGE',
      message: 'entityId is required for this target.',
      path: '/api/uploads/media',
    },
  ])
  @ApiForbiddenExamples('The actor cannot list uploads for this target.', [
    {
      name: 'listAvatarForbidden',
      summary: 'Cannot access another user avatar scope',
      message: 'You can only upload your own avatar.',
      path: '/api/uploads/media',
    },
    {
      name: 'listReportForbidden',
      summary: 'No access to report media scope',
      message: 'You cannot upload media for this report.',
      path: '/api/uploads/media',
    },
  ])
  @ApiNotFoundExamples('The target entity does not exist.', [
    {
      name: 'listReportMissing',
      summary: 'Report target not found',
      message: 'Report not found.',
      path: '/api/uploads/media',
    },
  ])
  listMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListUploadsQueryDto,
  ) {
    return this.uploadsService.listMedia(user, query);
  }

  @Get('limits')
  @ApiOperation({
    summary: 'Get upload limits and accepted mime types',
    description:
      'Use this endpoint to pre-validate files client-side before choosing between multipart upload and presigned upload.',
  })
  @ApiOkEnvelopeResponse(UploadLimitsDto, {
    description:
      'Static upload policy information currently enforced by the API.',
  })
  getUploadLimits() {
    return this.uploadsService.getUploadLimits();
  }

  @Delete('media')
  @ApiOperation({
    summary: 'Delete an uploaded media file by key',
    description:
      'Deletes a previously uploaded object when the authenticated actor owns or is allowed to manage the target asset, and the object is no longer referenced by the active avatar/report/message state.',
  })
  @ApiBody({ type: DeleteUploadRequestDto })
  @ApiOkEnvelopeResponse(DeleteUploadResultDto, {
    description: 'Confirms that the object key was removed from storage.',
  })
  @ApiBadRequestExamples('The delete-media request is malformed.', [
    {
      name: 'deleteTargetInvalid',
      summary: 'Unsupported target',
      message: 'target is invalid.',
      path: '/api/uploads/media',
    },
    {
      name: 'deleteKeyRequired',
      summary: 'Missing asset key',
      message: 'key is required.',
      path: '/api/uploads/media',
    },
  ])
  @ApiConflictExamples('The asset is still actively referenced.', [
    {
      name: 'deleteAvatarInUse',
      summary: 'Current avatar cannot be deleted directly',
      message:
        'Cannot delete the avatar currently in use. Update your profile avatar first.',
      path: '/api/uploads/media',
    },
    {
      name: 'deleteReportMediaInUse',
      summary: 'Report media still attached',
      message:
        'Cannot delete media currently attached to this report. Update the report first.',
      path: '/api/uploads/media',
    },
    {
      name: 'deleteMessageAttachmentInUse',
      summary: 'Message attachment still active',
      message:
        'Cannot delete media currently attached to an active message. Update or recall the message first.',
      path: '/api/uploads/media',
    },
  ])
  @ApiForbiddenExamples('The actor cannot delete this uploaded asset.', [
    {
      name: 'deleteAvatarForbidden',
      summary: 'Cannot manage another user avatar',
      message: 'You can only upload your own avatar.',
      path: '/api/uploads/media',
    },
    {
      name: 'deleteOwnershipForbidden',
      summary: 'Asset ownership mismatch',
      message: 'You cannot delete this upload.',
      path: '/api/uploads/media',
    },
  ])
  @ApiNotFoundExamples('The target entity does not exist.', [
    {
      name: 'deleteReportMissing',
      summary: 'Report target not found',
      message: 'Report not found.',
      path: '/api/uploads/media',
    },
  ])
  deleteMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: DeleteUploadRequestDto,
  ) {
    return this.uploadsService.deleteMedia(user, body);
  }

  @Post('presign/upload')
  @ApiOperation({
    summary: 'Create a presigned upload URL for S3',
    description:
      'Preferred upload flow for browser/mobile clients that can PUT directly to S3. FE should persist the returned `key` and then use it in the business endpoint payload.',
  })
  @ApiBody({ type: PresignUploadRequestDto })
  @ApiOkEnvelopeResponse(PresignUploadResultDto, {
    description: 'Pre-signed PUT instructions for a future S3 upload.',
  })
  @ApiBadRequestExamples('The presigned upload request is invalid.', [
    {
      name: 'presignFileNameRequired',
      summary: 'Missing fileName',
      message: 'fileName is required.',
      path: '/api/uploads/presign/upload',
    },
    {
      name: 'presignSizeInvalid',
      summary: 'Invalid file size',
      message: 'size is invalid.',
      path: '/api/uploads/presign/upload',
    },
  ])
  @ApiForbiddenExamples(
    'The actor is not allowed to upload to the requested target.',
    [
      {
        name: 'presignAvatarForbidden',
        summary: 'Cannot upload avatar for another user',
        message: 'You can only upload your own avatar.',
        path: '/api/uploads/presign/upload',
      },
    ],
  )
  @ApiNotFoundExamples('The target entity does not exist.', [
    {
      name: 'presignReportMissing',
      summary: 'Report target not found',
      message: 'Report not found.',
      path: '/api/uploads/presign/upload',
    },
  ])
  presignUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PresignUploadRequestDto,
  ) {
    return this.uploadsService.presignUpload(user, body);
  }

  @Post('presign/download')
  @ApiOperation({
    summary: 'Create a presigned download URL for S3',
    description:
      'Creates a short-lived GET URL for private S3 media. Avatar downloads are public-by-policy in this app; report/message downloads still enforce target access.',
  })
  @ApiBody({ type: PresignDownloadRequestDto })
  @ApiOkEnvelopeResponse(PresignDownloadResultDto, {
    description: 'Pre-signed GET instructions for a private S3 object.',
  })
  @ApiBadRequestExamples('The presigned download request is invalid.', [
    {
      name: 'downloadTargetInvalid',
      summary: 'Unsupported target',
      message: 'target is invalid.',
      path: '/api/uploads/presign/download',
    },
    {
      name: 'downloadKeyRequired',
      summary: 'Missing object key',
      message: 'key is required.',
      path: '/api/uploads/presign/download',
    },
  ])
  @ApiForbiddenExamples(
    'The actor cannot access the requested private media target.',
    [
      {
        name: 'downloadReportForbidden',
        summary: 'No access to report media',
        message: 'You cannot upload media for this report.',
        path: '/api/uploads/presign/download',
      },
    ],
  )
  @ApiNotFoundExamples('The target entity does not exist.', [
    {
      name: 'downloadReportMissing',
      summary: 'Report target not found',
      message: 'Report not found.',
      path: '/api/uploads/presign/download',
    },
  ])
  presignDownload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PresignDownloadRequestDto,
  ) {
    return this.uploadsService.presignDownload(user, body);
  }
}
