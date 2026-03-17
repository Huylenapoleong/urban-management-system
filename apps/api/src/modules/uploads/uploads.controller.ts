import {
  Body,
  Controller,
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
import {
  ErrorResponseDto,
  UploadMediaRequestDto,
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
}
