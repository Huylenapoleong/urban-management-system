import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
  AssignReportRequestDto,
  CreateReportRequestDto,
  ErrorResponseDto,
  ListReportsQueryDto,
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
  @ApiOperation({ summary: 'Create report' })
  @ApiBody({ type: CreateReportRequestDto })
  @ApiCreatedEnvelopeResponse(ReportItemDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateReportRequestDto,
  ) {
    return this.reportsService.createReport(user, body);
  }

  @Get()
  @ApiOperation({ summary: 'List reports' })
  @ApiQuery({ name: 'mine', required: false, type: Boolean })
  @ApiQuery({ name: 'assignedToMe', required: false, type: Boolean })
  @ApiQuery({ name: 'status', required: false, enum: REPORT_STATUSES })
  @ApiQuery({ name: 'category', required: false, enum: REPORT_CATEGORIES })
  @ApiQuery({ name: 'locationCode', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(ReportItemDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
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
  @ApiOperation({ summary: 'Get report by id' })
  @ApiParam({ name: 'reportId', type: String })
  @ApiOkEnvelopeResponse(ReportItemDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
  ) {
    return this.reportsService.getReport(user, reportId);
  }

  @Patch(':reportId')
  @ApiOperation({ summary: 'Update report fields' })
  @ApiParam({ name: 'reportId', type: String })
  @ApiBody({ type: UpdateReportRequestDto })
  @ApiOkEnvelopeResponse(ReportItemDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  updateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: UpdateReportRequestDto,
  ) {
    return this.reportsService.updateReport(user, reportId, body);
  }

  @Post(':reportId/assign')
  @ApiOperation({ summary: 'Assign report to officer' })
  @ApiParam({ name: 'reportId', type: String })
  @ApiBody({ type: AssignReportRequestDto })
  @ApiOkEnvelopeResponse(ReportItemDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  assignReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: AssignReportRequestDto,
  ) {
    return this.reportsService.assignReport(user, reportId, body);
  }

  @Post(':reportId/status')
  @ApiOperation({ summary: 'Update report status' })
  @ApiParam({ name: 'reportId', type: String })
  @ApiBody({ type: UpdateReportStatusRequestDto })
  @ApiOkEnvelopeResponse(ReportItemDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: UpdateReportStatusRequestDto,
  ) {
    return this.reportsService.updateStatus(user, reportId, body);
  }
}
