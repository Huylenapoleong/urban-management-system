import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  REPORT_CATEGORIES,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
} from '@urban/shared-constants';
import type {
  ApiResponseMeta,
  ApiSuccessResponse,
  AuditEventItem,
  AuthenticatedUser,
  MediaAsset,
  ReportConversationLinkItem,
  ReportItem,
} from '@urban/shared-types';
import {
  createUlid,
  makeReportCategoryLocationKey,
  makeReportConversationLinkSk,
  makeReportMetadataSk,
  makeReportPk,
  makeReportStatusLocationKey,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import {
  buildPaginatedResponse,
  paginateSortedItems,
} from '../../common/pagination';
import { toReport, toReportConversationLink } from '../../common/mappers';
import type {
  StoredPushOutboxEvent,
  StoredReport,
  StoredReportAuditEvent,
  StoredReportConversationLink,
} from '../../common/storage-records';
import {
  ensureLocationCode,
  ensureObject,
  optionalEnum,
  optionalQueryString,
  optionalString,
  optionalStringArray,
  parseLocationCodeQuery,
  parseBooleanQuery,
  parseEnumQuery,
  parseIsoDateQuery,
  parseLimit,
  requiredEnum,
  requiredString,
} from '../../common/validation';
import { AuditTrailService } from '../../infrastructure/audit/audit-trail.service';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { PushNotificationService } from '../../infrastructure/notifications/push-notification.service';
import { MediaAssetService } from '../../infrastructure/storage/media-asset.service';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly auditTrailService: AuditTrailService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly mediaAssetService: MediaAssetService,
    private readonly config: AppConfigService,
  ) {}

  async createReport(
    actor: AuthenticatedUser,
    payload: unknown,
  ): Promise<ReportItem> {
    const body = ensureObject(payload);
    const title = requiredString(body, 'title', {
      minLength: 1,
      maxLength: 100,
    });
    const description = optionalString(body, 'description', {
      maxLength: 2000,
    });
    const category = requiredEnum(body, 'category', REPORT_CATEGORIES);
    const priority = requiredEnum(body, 'priority', REPORT_PRIORITIES);
    const locationCode = ensureLocationCode(
      requiredString(body, 'locationCode'),
    );
    const mediaInput = this.resolveReportMediaInput(body, actor.id);
    const groupId = optionalString(body, 'groupId', { maxLength: 50 });

    if (!this.authorizationService.canCreateReport(actor, locationCode)) {
      throw new ForbiddenException(
        'You cannot create report in this location.',
      );
    }

    if (groupId) {
      await this.groupsService.getGroup(actor, groupId);
    }

    const now = nowIso();
    const reportId = createUlid();
    const report: StoredReport = {
      PK: makeReportPk(reportId),
      SK: makeReportMetadataSk(),
      entityType: 'REPORT',
      GSI1PK: makeReportCategoryLocationKey(category, locationCode),
      GSI2PK: makeReportStatusLocationKey('NEW', locationCode),
      reportId,
      userId: actor.id,
      groupId,
      title,
      description,
      category,
      locationCode,
      status: 'NEW',
      priority,
      mediaAssets: mediaInput.assets ?? [],
      mediaUrls: mediaInput.urls ?? [],
      assignedOfficerId: undefined,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const auditRecord = this.auditTrailService.buildReportEvent({
      action: 'REPORT_CREATED',
      actorUserId: actor.id,
      reportId,
      occurredAt: now,
      summary: `Created report ${title}.`,
      metadata: {
        category,
        groupId,
        locationCode,
        priority,
      },
    });

    await this.repository.transactPut([
      {
        tableName: this.config.dynamodbReportsTableName,
        item: report,
      },
      {
        tableName: this.config.dynamodbReportsTableName,
        item: auditRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);
    return this.serializeReport(report);
  }

  async listReports(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<ReportItem[], ApiResponseMeta>> {
    const mine =
      parseBooleanQuery(query.mine, 'mine') ?? actor.role === 'CITIZEN';
    const assignedToMe =
      parseBooleanQuery(query.assignedToMe, 'assignedToMe') ?? false;
    const status = parseEnumQuery(query.status, 'status', REPORT_STATUSES);
    const category = parseEnumQuery(
      query.category,
      'category',
      REPORT_CATEGORIES,
    );
    const priority = parseEnumQuery(
      query.priority,
      'priority',
      REPORT_PRIORITIES,
    );
    const assignedOfficerId = optionalQueryString(
      query.assignedOfficerId,
      'assignedOfficerId',
    );
    const locationCode = parseLocationCodeQuery(
      query.locationCode,
      'locationCode',
    );
    const keyword = optionalQueryString(query.q, 'q')?.toLowerCase();
    const createdFrom = parseIsoDateQuery(query.createdFrom, 'createdFrom');
    const createdTo = parseIsoDateQuery(query.createdTo, 'createdTo');
    const limit = parseLimit(query.limit);
    let reports: StoredReport[];

    if (mine || actor.role === 'CITIZEN') {
      reports = (
        await this.repository.scanAll<StoredReport>(
          this.config.dynamodbReportsTableName,
        )
      ).filter((report) => report.userId === actor.id);
    } else if (status && locationCode) {
      const items = await this.repository.queryByIndex<{
        PK: string;
        SK: string;
      }>(
        this.config.dynamodbReportsTableName,
        this.config.dynamodbReportsStatusLocationIndexName,
        'GSI2PK',
        'createdAt',
        makeReportStatusLocationKey(status, locationCode),
      );
      reports = await this.repository.batchGet<StoredReport>(
        this.config.dynamodbReportsTableName,
        items,
      );
    } else if (category && locationCode) {
      const items = await this.repository.queryByIndex<{
        PK: string;
        SK: string;
      }>(
        this.config.dynamodbReportsTableName,
        this.config.dynamodbReportsCategoryLocationIndexName,
        'GSI1PK',
        'createdAt',
        makeReportCategoryLocationKey(category, locationCode),
      );
      reports = await this.repository.batchGet<StoredReport>(
        this.config.dynamodbReportsTableName,
        items,
      );
    } else {
      reports = await this.repository.scanAll<StoredReport>(
        this.config.dynamodbReportsTableName,
      );
    }

        const filtered = reports
      .filter((report) => report.entityType === 'REPORT')
      .filter((report) => !report.deletedAt)
      .filter((report) =>
        this.authorizationService.canReadReport(actor, report),
      )
      .filter((report) => {
        if (assignedToMe && report.assignedOfficerId !== actor.id) {
          return false;
        }

        if (
          assignedOfficerId &&
          report.assignedOfficerId !== assignedOfficerId
        ) {
          return false;
        }

        if (status && report.status !== status) {
          return false;
        }

        if (category && report.category !== category) {
          return false;
        }

        if (priority && report.priority !== priority) {
          return false;
        }

        if (locationCode && report.locationCode !== locationCode) {
          return false;
        }

        if (createdFrom && report.createdAt < createdFrom) {
          return false;
        }

        if (createdTo && report.createdAt > createdTo) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        return [report.title, report.description ?? '']
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      });
    const page = paginateSortedItems(
      filtered,
      limit,
      query.cursor,
      (report) => report.createdAt,
      (report) => report.reportId,
    );

    return buildPaginatedResponse(
      await Promise.all(page.items.map((item) => this.serializeReport(item))),
      page.nextCursor,
    );
  }

  async getReport(
    actor: AuthenticatedUser,
    reportId: string,
  ): Promise<ReportItem> {
    const report = await this.getReportOrThrow(reportId);

    if (!this.authorizationService.canReadReport(actor, report)) {
      throw new ForbiddenException('You cannot access this report.');
    }

    return this.serializeReport(report);
  }

  async listAuditEvents(
    actor: AuthenticatedUser,
    reportId: string,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<AuditEventItem[], ApiResponseMeta>> {
    const report = await this.getReportOrThrow(reportId);

    if (!this.authorizationService.canReadReport(actor, report)) {
      throw new ForbiddenException('You cannot access this report.');
    }

    return this.auditTrailService.listReportEvents(reportId, query);
  }

  async listLinkedConversations(
    actor: AuthenticatedUser,
    reportId: string,
    query: Record<string, unknown>,
  ): Promise<
    ApiSuccessResponse<ReportConversationLinkItem[], ApiResponseMeta>
  > {
    const report = await this.getReportOrThrow(reportId);

    if (!this.authorizationService.canReadReport(actor, report)) {
      throw new ForbiddenException('You cannot access this report.');
    }

    const items = await this.repository.queryByPk<StoredReportConversationLink>(
      this.config.dynamodbReportsTableName,
      makeReportPk(reportId),
      { beginsWith: 'LINK#GRP#' },
    );
    const links = new Map<string, ReportConversationLinkItem>();

    if (report.groupId) {
      links.set(report.groupId, {
        reportId: report.reportId,
        groupId: report.groupId,
        conversationId: `group:${report.groupId}`,
        linkedByUserId: report.userId,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      });
    }

    for (const item of items.filter(
      (entry) => entry.entityType === 'REPORT_CONVERSATION_LINK',
    )) {
      links.set(item.groupId, {
        ...toReportConversationLink(item),
        conversationId: `group:${item.groupId}`,
      });
    }

    const page = paginateSortedItems(
      Array.from(links.values()),
      parseLimit(query.limit),
      query.cursor,
      (link) => link.updatedAt,
      (link) => link.groupId,
    );

    return buildPaginatedResponse(page.items, page.nextCursor);
  }

  async linkGroupConversation(
    actor: AuthenticatedUser,
    reportId: string,
    payload: unknown,
  ): Promise<ReportConversationLinkItem> {
    const body = ensureObject(payload);
    const groupId = requiredString(body, 'groupId', {
      minLength: 5,
      maxLength: 50,
    });
    const report = await this.getReportOrThrow(reportId);

    if (!this.authorizationService.canManageReport(actor, report)) {
      throw new ForbiddenException('You cannot link this report.');
    }

    await this.groupsService.getGroup(actor, groupId);

    if (report.groupId === groupId) {
      return {
        reportId: report.reportId,
        groupId,
        conversationId: `group:${groupId}`,
        linkedByUserId: report.userId,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      };
    }

    const now = nowIso();
    const existing = await this.repository.get<StoredReportConversationLink>(
      this.config.dynamodbReportsTableName,
      makeReportPk(reportId),
      makeReportConversationLinkSk(groupId),
    );
    const link: StoredReportConversationLink = {
      PK: makeReportPk(reportId),
      SK: makeReportConversationLinkSk(groupId),
      entityType: 'REPORT_CONVERSATION_LINK',
      reportId,
      groupId,
      conversationId: `GRP#${groupId}`,
      linkedByUserId: existing?.linkedByUserId ?? actor.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const auditRecord = this.auditTrailService.buildReportEvent({
      action: 'REPORT_GROUP_LINKED',
      actorUserId: actor.id,
      reportId,
      occurredAt: now,
      summary: `Linked report ${report.title} to group ${groupId}.`,
      metadata: { groupId },
    });

    await this.repository.transactPut([
      {
        tableName: this.config.dynamodbReportsTableName,
        item: link,
      },
      {
        tableName: this.config.dynamodbReportsTableName,
        item: auditRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);

    return {
      ...toReportConversationLink(link),
      conversationId: `group:${groupId}`,
    };
  }

  async updateReport(
    actor: AuthenticatedUser,
    reportId: string,
    payload: unknown,
  ): Promise<ReportItem> {
    const body = ensureObject(payload);
    const report = await this.getReportOrThrow(reportId);
    const canManage = this.authorizationService.canManageReport(actor, report);
    const canUpdateOwn = this.authorizationService.canUpdateOwnReport(
      actor,
      report,
    );

    if (!canManage && !canUpdateOwn) {
      throw new ForbiddenException('You cannot update this report.');
    }

    const title = optionalString(body, 'title', {
      minLength: 1,
      maxLength: 100,
    });
    const description = optionalString(body, 'description', {
      maxLength: 2000,
    });
    const priority = optionalEnum(body, 'priority', REPORT_PRIORITIES);
    const mediaInput = this.resolveReportMediaInput(
      body,
      actor.id,
      report.reportId,
    );
    const category = optionalEnum(body, 'category', REPORT_CATEGORIES);
    const locationCodeInput = optionalString(body, 'locationCode');
    const nextLocationCode = locationCodeInput
      ? ensureLocationCode(locationCodeInput)
      : report.locationCode;

    if (!canManage && (category || locationCodeInput)) {
      throw new ForbiddenException(
        'Only officers can change category or location.',
      );
    }

    if (
      canManage &&
      !this.authorizationService.canCreateReport(actor, nextLocationCode)
    ) {
      throw new ForbiddenException(
        'Updated report location is outside your scope.',
      );
    }

    const nextReport: StoredReport = {
      ...report,
      GSI1PK: makeReportCategoryLocationKey(
        category ?? report.category,
        nextLocationCode,
      ),
      GSI2PK: makeReportStatusLocationKey(report.status, nextLocationCode),
      title: title ?? report.title,
      description: description ?? report.description,
      priority: priority ?? report.priority,
      mediaAssets:
        mediaInput.assets !== undefined
          ? mediaInput.assets
          : report.mediaAssets,
      mediaUrls:
        mediaInput.urls !== undefined ? mediaInput.urls : report.mediaUrls,
      category: category ?? report.category,
      locationCode: nextLocationCode,
      updatedAt: nowIso(),
    };
    const auditRecord = this.auditTrailService.buildReportEvent({
      action: 'REPORT_UPDATED',
      actorUserId: actor.id,
      reportId,
      occurredAt: nextReport.updatedAt,
      summary: `Updated report ${nextReport.title}.`,
      metadata: {
        category: nextReport.category,
        locationCode: nextReport.locationCode,
        priority: nextReport.priority,
      },
    });

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbReportsTableName,
          item: nextReport,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': report.updatedAt,
          },
        },
        {
          tableName: this.config.dynamodbReportsTableName,
          item: auditRecord,
          conditionExpression:
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Report changed. Please retry.');
      }

      throw error;
    }
    return this.serializeReport(nextReport);
  }

  async deleteReport(
    actor: AuthenticatedUser,
    reportId: string,
  ): Promise<ReportItem> {
    const report = await this.getReportOrThrow(reportId);

    if (!this.authorizationService.canDeleteReport(actor, report)) {
      throw new ForbiddenException('You cannot delete this report.');
    }

    if (report.deletedAt) {
      return this.serializeReport(report);
    }

    const deletedAt = nowIso();
    const nextReport: StoredReport = {
      ...report,
      deletedAt,
      updatedAt: deletedAt,
    };
    const auditRecord = this.auditTrailService.buildReportEvent({
      action: 'REPORT_DELETED',
      actorUserId: actor.id,
      reportId,
      occurredAt: deletedAt,
      summary: `Deleted report ${report.title}.`,
    });

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbReportsTableName,
          item: nextReport,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': report.updatedAt,
          },
        },
        {
          tableName: this.config.dynamodbReportsTableName,
          item: auditRecord,
          conditionExpression:
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Report changed. Please retry.');
      }

      throw error;
    }
    return this.serializeReport(nextReport);
  }

  async assignReport(
    actor: AuthenticatedUser,
    reportId: string,
    payload: unknown,
  ): Promise<ReportItem> {
    const body = ensureObject(payload);
    const officerId = requiredString(body, 'officerId', {
      minLength: 5,
      maxLength: 50,
    });
    const report = await this.getReportOrThrow(reportId);
    const officer = await this.usersService.getActiveByIdOrThrow(officerId);

    if (!this.authorizationService.canAssignReport(actor, report, officer)) {
      throw new ForbiddenException('You cannot assign this report.');
    }

    const updatedAt = nowIso();
    const nextReport: StoredReport = {
      ...report,
      assignedOfficerId: officerId,
      updatedAt,
    };
    const auditRecord = this.auditTrailService.buildReportEvent({
      action: 'REPORT_ASSIGNED',
      actorUserId: actor.id,
      reportId,
      occurredAt: updatedAt,
      summary: `Assigned report ${report.title} to ${officer.fullName}.`,
      metadata: { officerId },
    });
    const pushRecipients = Array.from(
      new Set(
        [officerId, report.userId].filter((userId) => userId !== actor.id),
      ),
    );
    const pushRecord =
      pushRecipients.length > 0
        ? this.pushNotificationService.buildPushOutboxEvent({
            actorUserId: actor.id,
            eventName: 'report.assigned',
            recipientUserIds: pushRecipients,
            title: 'Report assigned',
            body: `${report.title} was assigned to ${officer.fullName}.`,
            reportId,
            data: {
              reportId,
              reportStatus: nextReport.status,
            },
            occurredAt: updatedAt,
          })
        : undefined;

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbReportsTableName,
          item: nextReport,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': report.updatedAt,
          },
        },
        {
          tableName: this.config.dynamodbReportsTableName,
          item: auditRecord,
          conditionExpression:
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
        ...(pushRecord
          ? ([
              {
                tableName: this.config.dynamodbUsersTableName,
                item: pushRecord,
                conditionExpression:
                  'attribute_not_exists(PK) AND attribute_not_exists(SK)',
              },
            ] as Array<{
              tableName: string;
              item:
                | StoredPushOutboxEvent
                | StoredReport
                | StoredReportAuditEvent;
              conditionExpression?: string;
            }>)
          : []),
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Report changed. Please retry.');
      }

      throw error;
    }
    return this.serializeReport(nextReport);
  }
  async updateStatus(
    actor: AuthenticatedUser,
    reportId: string,
    payload: unknown,
  ): Promise<ReportItem> {
    const body = ensureObject(payload);
    const status = requiredEnum(body, 'status', REPORT_STATUSES);
    const report = await this.getReportOrThrow(reportId);

    if (!this.authorizationService.canTransitionReport(actor, report, status)) {
      throw new ForbiddenException('You cannot update report status.');
    }

    const updatedAt = nowIso();
    const nextReport: StoredReport = {
      ...report,
      GSI2PK: makeReportStatusLocationKey(status, report.locationCode),
      status,
      updatedAt,
    };
    const auditRecord = this.auditTrailService.buildReportEvent({
      action: 'REPORT_STATUS_UPDATED',
      actorUserId: actor.id,
      reportId,
      occurredAt: updatedAt,
      summary: `Changed report ${report.title} status to ${status}.`,
      metadata: { status },
    });
    const pushRecipients = Array.from(
      new Set(
        [report.userId, report.assignedOfficerId]
          .filter((userId): userId is string => Boolean(userId))
          .filter((userId) => userId !== actor.id),
      ),
    );
    const pushRecord =
      pushRecipients.length > 0
        ? this.pushNotificationService.buildPushOutboxEvent({
            actorUserId: actor.id,
            eventName: 'report.status.updated',
            recipientUserIds: pushRecipients,
            title: 'Report status updated',
            body: `${report.title} is now ${status}.`,
            reportId,
            data: {
              reportId,
              reportStatus: status,
            },
            occurredAt: updatedAt,
          })
        : undefined;

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbReportsTableName,
          item: nextReport,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': report.updatedAt,
          },
        },
        {
          tableName: this.config.dynamodbReportsTableName,
          item: auditRecord,
          conditionExpression:
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
        ...(pushRecord
          ? ([
              {
                tableName: this.config.dynamodbUsersTableName,
                item: pushRecord,
                conditionExpression:
                  'attribute_not_exists(PK) AND attribute_not_exists(SK)',
              },
            ] as Array<{
              tableName: string;
              item:
                | StoredPushOutboxEvent
                | StoredReport
                | StoredReportAuditEvent;
              conditionExpression?: string;
            }>)
          : []),
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Report changed. Please retry.');
      }

      throw error;
    }
    return this.serializeReport(nextReport);
  }

  private resolveReportMediaInput(
    body: Record<string, unknown>,
    ownerUserId: string,
    entityId?: string,
  ): { assets?: MediaAsset[]; urls?: string[] } {
    const hasMediaKeys = Object.prototype.hasOwnProperty.call(
      body,
      'mediaKeys',
    );
    const hasMediaUrls = Object.prototype.hasOwnProperty.call(
      body,
      'mediaUrls',
    );

    if (hasMediaKeys && hasMediaUrls) {
      throw new BadRequestException(
        'Provide either mediaKeys or mediaUrls, not both.',
      );
    }

    if (hasMediaKeys) {
      const mediaKeys = optionalStringArray(body, 'mediaKeys', 10, 500) ?? [];

      return {
        assets: mediaKeys.map((key) =>
          this.mediaAssetService.createOwnedAssetReference({
            key,
            target: 'REPORT',
            ownerUserId,
            entityId,
          }),
        ),
        urls: [],
      };
    }

    if (hasMediaUrls) {
      return {
        assets: [],
        urls: optionalStringArray(body, 'mediaUrls', 10, 500) ?? [],
      };
    }

    return {};
  }

  private async serializeReport(report: StoredReport): Promise<ReportItem> {
    const item = toReport(report);
    const { assets, urls } =
      await this.mediaAssetService.resolveAssetCollectionWithLegacyUrls(
        item.mediaAssets,
        item.mediaUrls,
      );

    return {
      ...item,
      mediaAssets: assets,
      mediaUrls: urls,
    };
  }

  private isConditionalWriteConflict(error: unknown): boolean {
    const sourceErrors = [error];

    if (
      error &&
      typeof error === 'object' &&
      'cause' in error &&
      (error as { cause?: unknown }).cause !== undefined
    ) {
      sourceErrors.push((error as { cause?: unknown }).cause);
    }

    return sourceErrors.some((sourceError) => {
      if (!sourceError) {
        return false;
      }

      const name =
        typeof sourceError === 'object' &&
        sourceError !== null &&
        'name' in sourceError &&
        typeof (sourceError as { name?: unknown }).name === 'string'
          ? (sourceError as { name: string }).name
          : '';
      const message =
        sourceError instanceof Error
          ? sourceError.message
          : typeof sourceError === 'string'
            ? sourceError
            : '';

      return /ConditionalCheckFailed|TransactionCanceled/i.test(
        [name, message].join(' '),
      );
    });
  }

  private async getReportOrThrow(reportId: string): Promise<StoredReport> {
    const report = await this.repository.get<StoredReport>(
      this.config.dynamodbReportsTableName,
      makeReportPk(reportId),
      makeReportMetadataSk(),
    );

    if (!report || report.deletedAt) {
      throw new NotFoundException('Report not found.');
    }

    return report;
  }
}
