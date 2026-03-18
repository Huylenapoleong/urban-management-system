import { ForbiddenException, Injectable } from '@nestjs/common';
import { nowIso } from '@urban/shared-utils';
import type { AuthenticatedUser } from '@urban/shared-types';
import type {
  StoredConversation,
  StoredMessage,
} from '../../common/storage-records';
import { AuthorizationService } from '../../common/authorization.service';
import { ConversationStateService } from '../../common/services/conversation-state.service';
import { AppConfigService } from '../config/app-config.service';
import { UrbanTableRepository } from '../dynamodb/urban-table.repository';

export type ChatReconciliationIssueType =
  | 'ORPHANED_SUMMARY'
  | 'SUMMARY_INDEX_MISMATCH'
  | 'SUMMARY_KEY_MISMATCH'
  | 'SUMMARY_KIND_MISMATCH'
  | 'SUMMARY_LAST_READ_AT_MISMATCH'
  | 'SUMMARY_PREVIEW_MISMATCH'
  | 'SUMMARY_SENDER_MISMATCH'
  | 'SUMMARY_UNREAD_COUNT_MISMATCH'
  | 'SUMMARY_UPDATED_AT_MISMATCH';

interface ChatReconciliationBucket {
  count: number;
  issueType: ChatReconciliationIssueType;
}

export interface ChatReconciliationIssue {
  userId: string;
  conversationId: string;
  issueTypes: ChatReconciliationIssueType[];
  pk: string;
  sk: string;
  tableName: string;
  expectedSk?: string;
  latestMessageId?: string;
  latestMessageSentAt?: string;
}

export interface ChatReconciliationPreview {
  buckets: ChatReconciliationBucket[];
  generatedAt: string;
  issues: ChatReconciliationIssue[];
  totalCandidates: number;
}

export interface ChatReconciliationRepairResult extends ChatReconciliationPreview {
  repairedAt: string;
  totalDeleted: number;
  totalUpdated: number;
}

@Injectable()
export class ChatReconciliationService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly conversationStateService: ConversationStateService,
    private readonly config: AppConfigService,
  ) {}

  async preview(actor: AuthenticatedUser): Promise<ChatReconciliationPreview> {
    this.assertAdmin(actor);
    return this.previewSystem();
  }

  async repair(
    actor: AuthenticatedUser,
  ): Promise<ChatReconciliationRepairResult> {
    this.assertAdmin(actor);
    return this.repairSystem();
  }

  async previewSystem(): Promise<ChatReconciliationPreview> {
    const generatedAt = nowIso();
    const candidates = await this.collectCandidates();

    return {
      buckets: this.summarizeCandidates(candidates),
      generatedAt,
      issues: candidates.map((candidate) => candidate.issue),
      totalCandidates: candidates.length,
    };
  }

  async repairSystem(): Promise<ChatReconciliationRepairResult> {
    const generatedAt = nowIso();
    const candidates = await this.collectCandidates();
    let totalDeleted = 0;
    let totalUpdated = 0;

    for (const candidate of candidates) {
      if (!candidate.expectedSummary) {
        await this.repository.delete(
          this.config.dynamodbConversationsTableName,
          candidate.currentSummary.PK,
          candidate.currentSummary.SK,
        );
        totalDeleted += 1;
        continue;
      }

      if (
        candidate.currentSummary.PK !== candidate.expectedSummary.PK ||
        candidate.currentSummary.SK !== candidate.expectedSummary.SK
      ) {
        await this.repository.delete(
          this.config.dynamodbConversationsTableName,
          candidate.currentSummary.PK,
          candidate.currentSummary.SK,
        );
      }

      await this.repository.put(
        this.config.dynamodbConversationsTableName,
        candidate.expectedSummary,
      );
      totalUpdated += 1;
    }

    return {
      buckets: this.summarizeCandidates(candidates),
      generatedAt,
      issues: candidates.map((candidate) => candidate.issue),
      repairedAt: nowIso(),
      totalCandidates: candidates.length,
      totalDeleted,
      totalUpdated,
    };
  }

  private async collectCandidates(): Promise<
    Array<{
      currentSummary: StoredConversation;
      expectedSummary?: StoredConversation;
      issue: ChatReconciliationIssue;
    }>
  > {
    const [summaries, allMessageItems] = await Promise.all([
      this.repository.scanAll<StoredConversation>(
        this.config.dynamodbConversationsTableName,
      ),
      this.repository.scanAll<StoredMessage>(
        this.config.dynamodbMessagesTableName,
      ),
    ]);
    const conversationSummaries = summaries.filter(
      (item) => item.entityType === 'CONVERSATION' && !item.deletedAt,
    );
    const messagesByConversation =
      this.conversationStateService.groupActiveMessagesByConversation(
        allMessageItems.filter((item) => item.entityType === 'MESSAGE'),
      );
    const candidates: Array<{
      currentSummary: StoredConversation;
      expectedSummary?: StoredConversation;
      issue: ChatReconciliationIssue;
    }> = [];

    for (const summary of conversationSummaries) {
      const activeMessages =
        messagesByConversation.get(summary.conversationId) ?? [];
      const latestMessage = activeMessages[0];

      if (!latestMessage) {
        candidates.push({
          currentSummary: summary,
          issue: {
            conversationId: summary.conversationId,
            issueTypes: ['ORPHANED_SUMMARY'],
            pk: summary.PK,
            sk: summary.SK,
            tableName: this.config.dynamodbConversationsTableName,
            userId: summary.userId,
          },
        });
        continue;
      }

      const expectedSummary =
        this.conversationStateService.buildExpectedSummary(
          summary,
          activeMessages,
        );
      const issueTypes = this.collectIssueTypes(summary, expectedSummary);

      if (issueTypes.length === 0) {
        continue;
      }

      candidates.push({
        currentSummary: summary,
        expectedSummary,
        issue: {
          conversationId: summary.conversationId,
          expectedSk: expectedSummary.SK,
          issueTypes,
          latestMessageId: latestMessage.messageId,
          latestMessageSentAt: latestMessage.sentAt,
          pk: summary.PK,
          sk: summary.SK,
          tableName: this.config.dynamodbConversationsTableName,
          userId: summary.userId,
        },
      });
    }

    return candidates.sort((left, right) => {
      if (left.issue.conversationId !== right.issue.conversationId) {
        return left.issue.conversationId.localeCompare(
          right.issue.conversationId,
        );
      }

      return left.issue.userId.localeCompare(right.issue.userId);
    });
  }

  private collectIssueTypes(
    currentSummary: StoredConversation,
    expectedSummary: StoredConversation,
  ): ChatReconciliationIssueType[] {
    const issues: ChatReconciliationIssueType[] = [];

    if (currentSummary.PK !== expectedSummary.PK) {
      issues.push('SUMMARY_KEY_MISMATCH');
    }

    if (currentSummary.SK !== expectedSummary.SK) {
      issues.push('SUMMARY_KEY_MISMATCH');
    }

    if ((currentSummary.GSI1PK ?? '') !== (expectedSummary.GSI1PK ?? '')) {
      issues.push('SUMMARY_INDEX_MISMATCH');
    }

    if (currentSummary.isGroup !== expectedSummary.isGroup) {
      issues.push('SUMMARY_KIND_MISMATCH');
    }

    if (
      currentSummary.lastMessagePreview !== expectedSummary.lastMessagePreview
    ) {
      issues.push('SUMMARY_PREVIEW_MISMATCH');
    }

    if (currentSummary.lastSenderName !== expectedSummary.lastSenderName) {
      issues.push('SUMMARY_SENDER_MISMATCH');
    }

    if (currentSummary.unreadCount !== expectedSummary.unreadCount) {
      issues.push('SUMMARY_UNREAD_COUNT_MISMATCH');
    }

    if (
      (currentSummary.lastReadAt ?? null) !==
      (expectedSummary.lastReadAt ?? null)
    ) {
      issues.push('SUMMARY_LAST_READ_AT_MISMATCH');
    }

    if (currentSummary.updatedAt !== expectedSummary.updatedAt) {
      issues.push('SUMMARY_UPDATED_AT_MISMATCH');
    }

    return issues;
  }

  private summarizeCandidates(
    candidates: Array<{
      issue: ChatReconciliationIssue;
    }>,
  ): ChatReconciliationBucket[] {
    const buckets = new Map<ChatReconciliationIssueType, number>();

    for (const candidate of candidates) {
      for (const issueType of candidate.issue.issueTypes) {
        buckets.set(issueType, (buckets.get(issueType) ?? 0) + 1);
      }
    }

    return Array.from(buckets.entries())
      .map(([issueType, count]) => ({ count, issueType }))
      .sort((left, right) => left.issueType.localeCompare(right.issueType));
  }

  private assertAdmin(actor: AuthenticatedUser): void {
    if (!this.authorizationService.isAdmin(actor)) {
      throw new ForbiddenException(
        'Only administrators can access chat reconciliation maintenance.',
      );
    }
  }
}
