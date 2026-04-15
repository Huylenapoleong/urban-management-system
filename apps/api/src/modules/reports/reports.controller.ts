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
import { REPORT_CATEGORIES, REPORT_STATUSES } from '@urban/shared-constants';
import type { AuthenticatedUser } from '@urban/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiCreatedEnvelopeResponse,
  ApiOkEnvelopeResponse,
} from '../../common/openapi/swagger-envelope';
import {
  ApiBadRequestExamples,
  ApiConflictExamples,
  ApiForbiddenExamples,
  ApiNotFoundExamples,
} from '../../common/openapi/swagger-errors';
import {
  AssignReportRequestDto,
  AuditEventItemDto,
  CreateReportRequestDto,
  ErrorResponseDto,
  LinkReportConversationRequestDto,
  ListAuditQueryDto,
  ListLinkedReportConversationsQueryDto,
  ListReportsQueryDto,
  ReportConversationLinkDto,
  ReportItemDto,
  UpdateReportRequestDto,
  UpdateReportStatusRequestDto,
} from '../../common/openapi/swagger.models';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create report',
    description:
      'Creates a new report in the actor scope. FE should prefer `mediaKeys` from upload/presign flows over legacy `mediaUrls`. If both are sent during migration, the API will prefer `mediaKeys`.',
  })
  @ApiBody({ type: CreateReportRequestDto })
  @ApiCreatedEnvelopeResponse(ReportItemDto, {
    description:
      'Created report with resolved media and current audit-safe state.',
  })
  @ApiBadRequestExamples('The create-report payload is invalid.', [
    {
      name: 'reportMediaTargetMismatch',
      summary: 'A provided media key does not belong to the report target',
      message: 'key does not match target.',
      path: '/api/reports',
    },
    {
      name: 'reportLocationInvalid',
      summary: 'Invalid location code',
      message: 'locationCode is invalid.',
      path: '/api/reports',
    },
  ])
  @ApiForbiddenExamples(
    'The actor cannot create a report in the requested location or group scope.',
    [
      {
        name: 'createReportForbidden',
        summary: 'Report create denied by scope',
        message: 'You cannot create a report for this location.',
        path: '/api/reports',
      },
    ],
  )
  createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateReportRequestDto,
  ) {
    return this.reportsService.createReport(user, body);
  }

  @Get()
  @ApiOperation({
    summary: 'List reports',
    description:
      'Lists reports visible in the actor scope. Citizens typically use `mine=true`, while officers/admins combine location/status filters for operational views.',
  })
  @ApiQuery({ name: 'mine', required: false, type: Boolean })
  @ApiQuery({ name: 'assignedToMe', required: false, type: Boolean })
  @ApiQuery({ name: 'status', required: false, enum: REPORT_STATUSES })
  @ApiQuery({ name: 'category', required: false, enum: REPORT_CATEGORIES })
  @ApiQuery({
    name: 'priority',
    required: false,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
  })
  @ApiQuery({ name: 'assignedOfficerId', required: false, type: String })
  @ApiQuery({ name: 'locationCode', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'createdFrom', required: false, type: String })
  @ApiQuery({ name: 'createdTo', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(ReportItemDto, {
    isArray: true,
    description: 'Paginated report list.',
  })
  @ApiBadRequestExamples('One or more report list filters are invalid.', [
    {
      name: 'reportsAssignedToMeInvalid',
      summary: 'Invalid assignedToMe flag',
      message: 'assignedToMe must be "true" or "false".',
      path: '/api/reports?assignedToMe=yes',
    },
  ])
  listReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListReportsQueryDto,
  ) {
    return this.reportsService.listReports(
      user,
      query as Record<string, unknown>,
    );
  }

  @Get(':reportId')
  @ApiOperation({
    summary: 'Get report by id',
    description:
      'Returns one report visible to the current actor. Media fields include both the asset-backed representation and legacy URLs for compatibility.',
  })
  @ApiParam({ name: 'reportId', type: String })
  @ApiOkEnvelopeResponse(ReportItemDto, {
    description: 'Requested report item.',
  })
  @ApiForbiddenExamples(
    'The actor does not have permission to view this report.',
    [
      {
        name: 'reportReadForbidden',
        summary: 'Report access denied',
        message: 'You cannot access this report.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000',
      },
    ],
  )
  @ApiNotFoundExamples('The report does not exist.', [
    {
      name: 'reportMissing',
      summary: 'Report not found',
      message: 'Report not found.',
      path: '/api/reports/01JPCY2000UNKNOWNREPORT000000',
    },
  ])
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
  ) {
    return this.reportsService.getReport(user, reportId);
  }

  @Get(':reportId/audit')
  @ApiOperation({ summary: 'List audit events for a report' })
  @ApiParam({ name: 'reportId', type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(AuditEventItemDto, { isArray: true })
  @ApiBadRequestExamples('The audit query is invalid.', [
    {
      name: 'reportAuditInvalidLimit',
      summary: 'Invalid pagination limit',
      message: 'limit must be a positive integer.',
      path: '/api/reports/01JPCY2000REPORTNEW00000000/audit?limit=0',
    },
    {
      name: 'reportAuditInvalidCursor',
      summary: 'Invalid pagination cursor',
      message: 'cursor is invalid.',
      path: '/api/reports/01JPCY2000REPORTNEW00000000/audit?cursor=not-base64',
    },
  ])
  @ApiForbiddenExamples('The actor cannot access this report audit trail.', [
    {
      name: 'reportAuditForbidden',
      summary: 'Report access denied',
      message: 'You cannot access this report.',
      path: '/api/reports/01JPCY2000REPORTNEW00000000/audit',
    },
  ])
  @ApiNotFoundExamples('The report does not exist.', [
    {
      name: 'reportAuditMissing',
      summary: 'Report not found',
      message: 'Report not found.',
      path: '/api/reports/01JPCY2000UNKNOWNREPORT000000/audit',
    },
  ])
  listAuditEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Query() query: ListAuditQueryDto,
  ) {
    return this.reportsService.listAuditEvents(
      user,
      reportId,
      query as Record<string, unknown>,
    );
  }

  @Get(':reportId/conversations')
  @ApiOperation({ summary: 'List group conversations linked to a report' })
  @ApiParam({ name: 'reportId', type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(ReportConversationLinkDto, { isArray: true })
  @ApiBadRequestExamples('The linked-conversations query is invalid.', [
    {
      name: 'reportLinksInvalidLimit',
      summary: 'Invalid pagination limit',
      message: 'limit must be a positive integer.',
      path: '/api/reports/01JPCY2000REPORTNEW00000000/conversations?limit=0',
    },
    {
      name: 'reportLinksInvalidCursor',
      summary: 'Invalid pagination cursor',
      message: 'cursor is invalid.',
      path: '/api/reports/01JPCY2000REPORTNEW00000000/conversations?cursor=not-base64',
    },
  ])
  @ApiForbiddenExamples(
    'The actor cannot access linked conversations for this report.',
    [
      {
        name: 'reportLinksForbidden',
        summary: 'Report access denied',
        message: 'You cannot access this report.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000/conversations',
      },
    ],
  )
  @ApiNotFoundExamples('The report does not exist.', [
    {
      name: 'reportLinksMissing',
      summary: 'Report not found',
      message: 'Report not found.',
      path: '/api/reports/01JPCY2000UNKNOWNREPORT000000/conversations',
    },
  ])
  listLinkedConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Query() query: ListLinkedReportConversationsQueryDto,
  ) {
    return this.reportsService.listLinkedConversations(
      user,
      reportId,
      query as Record<string, unknown>,
    );
  }

  @Post(':reportId/conversations')
  @ApiOperation({
    summary: 'Link a group conversation to a report',
    description:
      'Links an existing group conversation so report detail screens can navigate directly into the relevant operational chat.',
  })
  @ApiParam({ name: 'reportId', type: String })
  @ApiBody({ type: LinkReportConversationRequestDto })
  @ApiOkEnvelopeResponse(ReportConversationLinkDto, {
    description: 'Created or confirmed report-to-conversation link.',
  })
  @ApiBadRequestExamples('The link-report-conversation payload is invalid.', [
    {
      name: 'groupIdRequired',
      summary: 'Missing groupId',
      message: 'groupId is required.',
      path: '/api/reports/01JPCY2000REPORTNEW00000000/conversations',
    },
  ])
  @ApiForbiddenExamples(
    'The actor cannot link this report to the requested group conversation.',
    [
      {
        name: 'linkReportForbidden',
        summary: 'Linking denied by policy',
        message: 'You cannot link this report.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000/conversations',
      },
    ],
  )
  @ApiNotFoundExamples('The report or target group does not exist.', [
    {
      name: 'linkReportMissing',
      summary: 'Report not found',
      message: 'Report not found.',
      path: '/api/reports/01JPCY2000UNKNOWNREPORT000000/conversations',
    },
  ])
  linkGroupConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: LinkReportConversationRequestDto,
  ) {
    return this.reportsService.linkGroupConversation(user, reportId, body);
  }

  @Patch(':reportId')
  @ApiOperation({
    summary: 'Update report fields',
    description:
      'Updates mutable report fields. Officers can update category/location; citizens can only update their own allowed fields.',
  })
  @ApiParam({ name: 'reportId', type: String })
  @ApiBody({ type: UpdateReportRequestDto })
  @ApiOkEnvelopeResponse(ReportItemDto, {
    description:
      'Updated report after validation and optimistic concurrency checks.',
  })
  @ApiBadRequestExamples('The report update payload is invalid.', [
    {
      name: 'reportMediaEntityMismatch',
      summary: 'A provided media key belongs to a different report',
      message: 'key does not match entityId.',
      path: '/api/reports/01JPCY2000REPORTNEW00000000',
    },
  ])
  @ApiForbiddenExamples(
    'The actor is not allowed to update the requested fields.',
    [
      {
        name: 'reportUpdateForbidden',
        summary: 'Report update denied',
        message: 'You cannot update this report.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000',
      },
      {
        name: 'reportLocationForbidden',
        summary: 'Only officers can change category/location',
        message: 'Only officers can change category or location.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000',
      },
    ],
  )
  @ApiConflictExamples(
    'The report changed while the update was being processed.',
    [
      {
        name: 'reportChanged',
        summary: 'Optimistic concurrency conflict',
        message: 'Report changed. Please retry.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000',
      },
    ],
  )
  @ApiNotFoundExamples('The report does not exist.', [
    {
      name: 'updateReportMissing',
      summary: 'Report not found',
      message: 'Report not found.',
      path: '/api/reports/01JPCY2000UNKNOWNREPORT000000',
    },
  ])
  updateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: UpdateReportRequestDto,
  ) {
    return this.reportsService.updateReport(user, reportId, body);
  }

  @Delete(':reportId')
  @ApiOperation({
    summary: 'Delete report',
    description:
      'Soft-deletes a report. The report record remains available for audit/history with `deletedAt` populated.',
  })
  @ApiParam({ name: 'reportId', type: String })
  @ApiOkEnvelopeResponse(ReportItemDto, {
    description: 'Soft-deleted report snapshot.',
  })
  @ApiForbiddenExamples('The actor cannot delete this report.', [
    {
      name: 'reportDeleteForbidden',
      summary: 'Report delete denied',
      message: 'You cannot delete this report.',
      path: '/api/reports/01JPCY2000REPORTNEW00000000',
    },
  ])
  @ApiConflictExamples(
    'The report changed while the delete request was being processed.',
    [
      {
        name: 'reportDeleteConflict',
        summary: 'Optimistic concurrency conflict',
        message: 'Report changed. Please retry.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000',
      },
    ],
  )
  @ApiNotFoundExamples('The report does not exist.', [
    {
      name: 'deleteReportMissing',
      summary: 'Report not found',
      message: 'Report not found.',
      path: '/api/reports/01JPCY2000UNKNOWNREPORT000000',
    },
  ])
  deleteReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
  ) {
    return this.reportsService.deleteReport(user, reportId);
  }
  @Post(':reportId/assign')
  @ApiOperation({
    summary: 'Assign report to officer',
    description:
      'Assigns the report to one active officer and emits the related operational push/outbox event.',
  })
  @ApiParam({ name: 'reportId', type: String })
  @ApiBody({ type: AssignReportRequestDto })
  @ApiOkEnvelopeResponse(ReportItemDto, {
    description: 'Updated report with the new assigned officer.',
  })
  @ApiForbiddenExamples(
    'The actor cannot assign this report to the requested officer.',
    [
      {
        name: 'assignForbidden',
        summary: 'Assignment denied',
        message: 'You cannot assign this report.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000/assign',
      },
    ],
  )
  @ApiConflictExamples(
    'The report changed while the assignment was being processed.',
    [
      {
        name: 'assignConflict',
        summary: 'Optimistic concurrency conflict',
        message: 'Report changed. Please retry.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000/assign',
      },
    ],
  )
  @ApiNotFoundExamples('The report or officer does not exist.', [
    {
      name: 'assignReportMissing',
      summary: 'Report not found',
      message: 'Report not found.',
      path: '/api/reports/01JPCY2000UNKNOWNREPORT000000/assign',
    },
  ])
  assignReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: AssignReportRequestDto,
  ) {
    return this.reportsService.assignReport(user, reportId, body);
  }

  @Post(':reportId/status')
  @ApiOperation({
    summary: 'Update report status',
    description:
      'Transitions the report status according to report workflow permissions and emits related push/audit events.',
  })
  @ApiParam({ name: 'reportId', type: String })
  @ApiBody({ type: UpdateReportStatusRequestDto })
  @ApiOkEnvelopeResponse(ReportItemDto, {
    description: 'Updated report after the new status was applied.',
  })
  @ApiForbiddenExamples(
    'The actor cannot perform the requested status transition.',
    [
      {
        name: 'statusForbidden',
        summary: 'Status transition denied',
        message: 'You cannot update report status.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000/status',
      },
    ],
  )
  @ApiConflictExamples(
    'The report changed while the status update was being processed.',
    [
      {
        name: 'statusConflict',
        summary: 'Optimistic concurrency conflict',
        message: 'Report changed. Please retry.',
        path: '/api/reports/01JPCY2000REPORTNEW00000000/status',
      },
    ],
  )
  @ApiNotFoundExamples('The report does not exist.', [
    {
      name: 'statusReportMissing',
      summary: 'Report not found',
      message: 'Report not found.',
      path: '/api/reports/01JPCY2000UNKNOWNREPORT000000/status',
    },
  ])
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: UpdateReportStatusRequestDto,
  ) {
    return this.reportsService.updateStatus(user, reportId, body);
  }
}
