import { Injectable } from '@nestjs/common';
import type { ApiResponseMeta, ApiSuccessResponse } from '@urban/shared-types';
import {
  createUlid,
  makeConversationAuditSk,
  makeConversationPk,
  makeReportAuditSk,
  makeReportPk,
  nowIso,
} from '@urban/shared-utils';
import {
  buildPaginatedResponse,
  paginateSortedItems,
} from '../../common/pagination';
import { toAuditEvent } from '../../common/mappers';
import type {
  StoredConversationAuditEvent,
  StoredReportAuditEvent,
} from '../../common/storage-records';
import { parseLimit } from '../../common/validation';
import { UrbanTableRepository } from '../dynamodb/urban-table.repository';
import { AppConfigService } from '../config/app-config.service';

interface ConversationAuditInput {
  action: string;
  actorUserId: string;
  conversationId: string;
  messageId?: string;
  occurredAt?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

interface ReportAuditInput {
  action: string;
  actorUserId: string;
  reportId: string;
  occurredAt?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditTrailService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly config: AppConfigService,
  ) {}

  buildConversationEvent(
    input: ConversationAuditInput,
  ): StoredConversationAuditEvent {
    const occurredAt = input.occurredAt ?? nowIso();
    const eventId = createUlid();

    return {
      PK: makeConversationPk(input.conversationId),
      SK: makeConversationAuditSk(occurredAt, eventId),
      entityType: 'CONVERSATION_AUDIT_EVENT',
      eventId,
      conversationId: input.conversationId,
      action: input.action,
      actorUserId: input.actorUserId,
      messageId: input.messageId,
      occurredAt,
      summary: input.summary,
      metadata: input.metadata,
    };
  }

  buildReportEvent(input: ReportAuditInput): StoredReportAuditEvent {
    const occurredAt = input.occurredAt ?? nowIso();
    const eventId = createUlid();

    return {
      PK: makeReportPk(input.reportId),
      SK: makeReportAuditSk(occurredAt, eventId),
      entityType: 'REPORT_AUDIT_EVENT',
      eventId,
      reportId: input.reportId,
      action: input.action,
      actorUserId: input.actorUserId,
      occurredAt,
      summary: input.summary,
      metadata: input.metadata,
    };
  }

  async listConversationEvents(
    conversationId: string,
    query: Record<string, unknown>,
  ): Promise<
    ApiSuccessResponse<ReturnType<typeof toAuditEvent>[], ApiResponseMeta>
  > {
    const items = await this.repository.queryByPk<StoredConversationAuditEvent>(
      this.config.dynamodbConversationsTableName,
      makeConversationPk(conversationId),
      { beginsWith: 'AUDIT#' },
    );
    const page = paginateSortedItems(
      items.filter((item) => item.entityType === 'CONVERSATION_AUDIT_EVENT'),
      parseLimit(query.limit),
      query.cursor,
      (item) => item.occurredAt,
      (item) => item.eventId,
    );

    return buildPaginatedResponse(
      page.items.map((item) => toAuditEvent(item, 'CONVERSATION')),
      page.nextCursor,
    );
  }

  async listReportEvents(
    reportId: string,
    query: Record<string, unknown>,
  ): Promise<
    ApiSuccessResponse<ReturnType<typeof toAuditEvent>[], ApiResponseMeta>
  > {
    const items = await this.repository.queryByPk<StoredReportAuditEvent>(
      this.config.dynamodbReportsTableName,
      makeReportPk(reportId),
      { beginsWith: 'AUDIT#' },
    );
    const page = paginateSortedItems(
      items.filter((item) => item.entityType === 'REPORT_AUDIT_EVENT'),
      parseLimit(query.limit),
      query.cursor,
      (item) => item.occurredAt,
      (item) => item.eventId,
    );

    return buildPaginatedResponse(
      page.items.map((item) => toAuditEvent(item, 'REPORT')),
      page.nextCursor,
    );
  }
}
