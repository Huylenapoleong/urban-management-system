import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedUser } from '@urban/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiCreatedEnvelopeResponse } from '../../common/openapi/swagger-envelope';
import { ApiOkEnvelopeResponse } from '../../common/openapi/swagger-envelope';
import {
  DeleteUploadRequestDto,
  DeleteUploadResultDto,
  ErrorResponseDto,
  PresignDownloadRequestDto,
  PresignDownloadResultDto,
  PresignUploadRequestDto,
  PresignUploadResultDto,
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
  @ApiOperation({ summary: 'Upload media file to S3' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadMediaRequestDto })
  @ApiCreatedEnvelopeResponse(UploadedAssetDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  uploadMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UploadMediaRequestDto,
    @UploadedFile() file?: UploadedBinaryFile,
  ) {
    return this.uploadsService.uploadMedia(user, body, file);
  }

  @Get('limits')
  @ApiOperation({ summary: 'Get upload limits and accepted mime types' })
  @ApiOkEnvelopeResponse(UploadLimitsDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  getUploadLimits() {
    return this.uploadsService.getUploadLimits();
  }

  @Delete('media')
  @ApiOperation({ summary: 'Delete an uploaded media file by key' })
  @ApiBody({ type: DeleteUploadRequestDto })
  @ApiOkEnvelopeResponse(DeleteUploadResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  deleteMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: DeleteUploadRequestDto,
  ) {
    return this.uploadsService.deleteMedia(user, body);
  }

  @Post('presign/upload')
  @ApiOperation({ summary: 'Create a presigned upload URL for S3' })
  @ApiBody({ type: PresignUploadRequestDto })
  @ApiOkEnvelopeResponse(PresignUploadResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  presignUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PresignUploadRequestDto,
  ) {
    return this.uploadsService.presignUpload(user, body);
  }

  @Post('presign/download')
  @ApiOperation({ summary: 'Create a presigned download URL for S3' })
  @ApiBody({ type: PresignDownloadRequestDto })
  @ApiOkEnvelopeResponse(PresignDownloadResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  presignDownload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PresignDownloadRequestDto,
  ) {
    return this.uploadsService.presignDownload(user, body);
  }
}
