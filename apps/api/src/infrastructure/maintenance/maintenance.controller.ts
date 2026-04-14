import { Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '@urban/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiForbiddenExamples,
  ApiUnauthorizedExamples,
} from '../../common/openapi/swagger-errors';
import { ChatReconciliationService } from './chat-reconciliation.service';
import { RetentionMaintenanceService } from './retention-maintenance.service';

@ApiTags('Maintenance')
@ApiBearerAuth('bearer')
@Roles('ADMIN')
@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly retentionMaintenanceService: RetentionMaintenanceService,
    private readonly chatReconciliationService: ChatReconciliationService,
  ) {}

  @Get('retention/preview')
  @ApiOperation({ summary: 'Preview retention purge candidates' })
  @ApiUnauthorizedExamples('The bearer token is missing or invalid.', [
    {
      name: 'maintenancePreviewUnauthorized',
      summary: 'Missing bearer token',
      message: 'Missing bearer token.',
      path: '/api/maintenance/retention/preview',
    },
  ])
  @ApiForbiddenExamples('Only administrators can access this endpoint.', [
    {
      name: 'maintenancePreviewAdminOnly',
      summary: 'Admin role required',
      message: 'Insufficient role.',
      path: '/api/maintenance/retention/preview',
    },
  ])
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            generatedAt: {
              type: 'string',
              example: '2026-03-18T15:00:00.000Z',
            },
            totalCandidates: { type: 'number', example: 12 },
            buckets: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
          required: ['generatedAt', 'totalCandidates', 'buckets'],
        },
      },
      required: ['success', 'data'],
    },
  })
  preview(@CurrentUser() user: AuthenticatedUser) {
    return this.retentionMaintenanceService.preview(user);
  }

  @Post('retention/purge')
  @ApiOperation({ summary: 'Purge retention candidates' })
  @ApiUnauthorizedExamples('The bearer token is missing or invalid.', [
    {
      name: 'maintenancePurgeUnauthorized',
      summary: 'Missing bearer token',
      message: 'Missing bearer token.',
      path: '/api/maintenance/retention/purge',
    },
  ])
  @ApiForbiddenExamples('Only administrators can access this endpoint.', [
    {
      name: 'maintenancePurgeAdminOnly',
      summary: 'Admin role required',
      message: 'Insufficient role.',
      path: '/api/maintenance/retention/purge',
    },
  ])
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            generatedAt: {
              type: 'string',
              example: '2026-03-18T15:00:00.000Z',
            },
            purgedAt: {
              type: 'string',
              example: '2026-03-18T15:00:02.000Z',
            },
            totalCandidates: { type: 'number', example: 12 },
            totalDeleted: { type: 'number', example: 12 },
            buckets: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
          required: [
            'generatedAt',
            'purgedAt',
            'totalCandidates',
            'totalDeleted',
            'buckets',
          ],
        },
      },
      required: ['success', 'data'],
    },
  })
  purge(@CurrentUser() user: AuthenticatedUser) {
    return this.retentionMaintenanceService.purge(user);
  }

  @Get('chat-reconciliation/preview')
  @ApiOperation({ summary: 'Preview chat inbox summary drift candidates' })
  @ApiUnauthorizedExamples('The bearer token is missing or invalid.', [
    {
      name: 'maintenanceChatPreviewUnauthorized',
      summary: 'Missing bearer token',
      message: 'Missing bearer token.',
      path: '/api/maintenance/chat-reconciliation/preview',
    },
  ])
  @ApiForbiddenExamples('Only administrators can access this endpoint.', [
    {
      name: 'maintenanceChatPreviewAdminOnly',
      summary: 'Admin role required',
      message: 'Insufficient role.',
      path: '/api/maintenance/chat-reconciliation/preview',
    },
  ])
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            generatedAt: {
              type: 'string',
              example: '2026-03-18T16:00:00.000Z',
            },
            totalCandidates: { type: 'number', example: 4 },
            buckets: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            issues: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
          required: ['generatedAt', 'totalCandidates', 'buckets', 'issues'],
        },
      },
      required: ['success', 'data'],
    },
  })
  previewChatReconciliation(@CurrentUser() user: AuthenticatedUser) {
    return this.chatReconciliationService.preview(user);
  }

  @Post('chat-reconciliation/repair')
  @ApiOperation({ summary: 'Repair chat inbox summary drift candidates' })
  @ApiUnauthorizedExamples('The bearer token is missing or invalid.', [
    {
      name: 'maintenanceChatRepairUnauthorized',
      summary: 'Missing bearer token',
      message: 'Missing bearer token.',
      path: '/api/maintenance/chat-reconciliation/repair',
    },
  ])
  @ApiForbiddenExamples('Only administrators can access this endpoint.', [
    {
      name: 'maintenanceChatRepairAdminOnly',
      summary: 'Admin role required',
      message: 'Insufficient role.',
      path: '/api/maintenance/chat-reconciliation/repair',
    },
  ])
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            generatedAt: {
              type: 'string',
              example: '2026-03-18T16:00:00.000Z',
            },
            repairedAt: {
              type: 'string',
              example: '2026-03-18T16:00:02.000Z',
            },
            totalCandidates: { type: 'number', example: 4 },
            totalUpdated: { type: 'number', example: 3 },
            totalDeleted: { type: 'number', example: 1 },
            buckets: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            issues: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
          required: [
            'generatedAt',
            'repairedAt',
            'totalCandidates',
            'totalUpdated',
            'totalDeleted',
            'buckets',
            'issues',
          ],
        },
      },
      required: ['success', 'data'],
    },
  })
  repairChatReconciliation(@CurrentUser() user: AuthenticatedUser) {
    return this.chatReconciliationService.repair(user);
  }
}
