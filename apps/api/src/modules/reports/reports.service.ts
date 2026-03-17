import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  REPORT_CATEGORIES,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
} from '@urban/shared-constants';
import type { AuthenticatedUser, ReportItem } from '@urban/shared-types';
import {
  createUlid,
  makeReportCategoryLocationKey,
  makeReportMetadataSk,
  makeReportPk,
  makeReportStatusLocationKey,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import { toReport } from '../../common/mappers';
import type { StoredReport } from '../../common/storage-records';
import {
  ensureLocationCode,
  ensureObject,
  optionalEnum,
  optionalQueryString,
  optionalString,
  optionalStringArray,
  parseBooleanQuery,
  parseLimit,
  requiredEnum,
  requiredString,
} from '../../common/validation';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
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
    const mediaUrls = optionalStringArray(body, 'mediaUrls', 10, 500) ?? [];
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
      mediaUrls,
      assignedOfficerId: undefined,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.put(this.config.dynamodbReportsTableName, report);
    return toReport(report);
  }

  async listReports(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ReportItem[]> {
    const mine =
      parseBooleanQuery(query.mine, 'mine') ?? actor.role === 'CITIZEN';
    const assignedToMe =
      parseBooleanQuery(query.assignedToMe, 'assignedToMe') ?? false;
    const status = optionalQueryString(query.status, 'status');
    const category = optionalQueryString(query.category, 'category');
    const locationCode = optionalQueryString(
      query.locationCode,
      'locationCode',
    );
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
        makeReportStatusLocationKey(
          status as (typeof REPORT_STATUSES)[number],
          locationCode,
        ),
        { limit },
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
        makeReportCategoryLocationKey(
          category as (typeof REPORT_CATEGORIES)[number],
          locationCode,
        ),
        { limit },
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

    return reports
      .filter((report) => !report.deletedAt)
      .filter((report) =>
        this.authorizationService.canReadReport(actor, report),
      )
      .filter((report) => {
        if (assignedToMe && report.assignedOfficerId !== actor.id) {
          return false;
        }

        if (status && report.status !== status) {
          return false;
        }

        if (category && report.category !== category) {
          return false;
        }

        if (locationCode && report.locationCode !== locationCode) {
          return false;
        }

        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map(toReport);
  }

  async getReport(
    actor: AuthenticatedUser,
    reportId: string,
  ): Promise<ReportItem> {
    const report = await this.getReportOrThrow(reportId);

    if (!this.authorizationService.canReadReport(actor, report)) {
      throw new ForbiddenException('You cannot access this report.');
    }

    return toReport(report);
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
    const mediaUrls = optionalStringArray(body, 'mediaUrls', 10, 500);
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
      mediaUrls: mediaUrls ?? report.mediaUrls,
      category: category ?? report.category,
      locationCode: nextLocationCode,
      updatedAt: nowIso(),
    };

    await this.repository.put(this.config.dynamodbReportsTableName, nextReport);
    return toReport(nextReport);
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
    const officer = await this.usersService.getByIdOrThrow(officerId);

    if (!this.authorizationService.canAssignReport(actor, report, officer)) {
      throw new ForbiddenException('You cannot assign this report.');
    }

    const nextReport: StoredReport = {
      ...report,
      assignedOfficerId: officerId,
      updatedAt: nowIso(),
    };

    await this.repository.put(this.config.dynamodbReportsTableName, nextReport);
    return toReport(nextReport);
  }

  async updateStatus(
    actor: AuthenticatedUser,
    reportId: string,
    payload: unknown,
  ): Promise<ReportItem> {
    const body = ensureObject(payload);
    const status = requiredEnum(body, 'status', REPORT_STATUSES);
    const report = await this.getReportOrThrow(reportId);

    if (!this.authorizationService.canTransitionReport(actor, report)) {
      throw new ForbiddenException('You cannot update report status.');
    }

    if (actor.role === 'CITIZEN' && status !== 'CLOSED') {
      throw new BadRequestException(
        'Citizen can only close a resolved report.',
      );
    }

    const nextReport: StoredReport = {
      ...report,
      GSI2PK: makeReportStatusLocationKey(status, report.locationCode),
      status,
      updatedAt: nowIso(),
    };

    await this.repository.put(this.config.dynamodbReportsTableName, nextReport);
    return toReport(nextReport);
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
