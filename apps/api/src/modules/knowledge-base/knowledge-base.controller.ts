import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiForbiddenResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
    ApiCreatedEnvelopeResponse,
    ApiOkEnvelopeResponse,
} from '../../common/openapi/swagger-envelope';
import {
    CreateKnowledgeDocumentRequestDto,
    DeleteKnowledgeDocumentResultDto,
    ErrorResponseDto,
    KnowledgeDocumentDto,
    ListKnowledgeDocumentsQueryDto,
    UpdateKnowledgeDocumentRequestDto,
} from '../../common/openapi/swagger.models';
import { KnowledgeBaseService } from './knowledge-base.service';

@ApiTags('KnowledgeBase')
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List knowledge documents' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkEnvelopeResponse(KnowledgeDocumentDto, { isArray: true })
  listDocuments(@Query() query: ListKnowledgeDocumentsQueryDto) {
    return this.knowledgeBaseService.listDocuments(
      query as Record<string, unknown>,
    );
  }

  @Public()
  @Get(':docId')
  @ApiOperation({ summary: 'Get knowledge document by id' })
  @ApiParam({ name: 'docId', type: String })
  @ApiOkEnvelopeResponse(KnowledgeDocumentDto)
  getDocument(@Param('docId') docId: string) {
    return this.knowledgeBaseService.getDocument(docId);
  }

  @Post()
  @Roles('WARD_OFFICER', 'PROVINCE_OFFICER', 'ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create knowledge document' })
  @ApiBody({ type: CreateKnowledgeDocumentRequestDto })
  @ApiCreatedEnvelopeResponse(KnowledgeDocumentDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  createDocument(@Body() body: CreateKnowledgeDocumentRequestDto) {
    return this.knowledgeBaseService.createDocument(body);
  }

  @Patch(':docId')
  @Roles('WARD_OFFICER', 'PROVINCE_OFFICER', 'ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update knowledge document' })
  @ApiParam({ name: 'docId', type: String })
  @ApiBody({ type: UpdateKnowledgeDocumentRequestDto })
  @ApiOkEnvelopeResponse(KnowledgeDocumentDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  updateDocument(
    @Param('docId') docId: string,
    @Body() body: UpdateKnowledgeDocumentRequestDto,
  ) {
    return this.knowledgeBaseService.updateDocument(docId, body);
  }

  @Delete(':docId')
  @Roles('WARD_OFFICER', 'PROVINCE_OFFICER', 'ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Delete knowledge document' })
  @ApiParam({ name: 'docId', type: String })
  @ApiOkEnvelopeResponse(DeleteKnowledgeDocumentResultDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  deleteDocument(@Param('docId') docId: string) {
    return this.knowledgeBaseService.deleteDocument(docId);
  }
}
