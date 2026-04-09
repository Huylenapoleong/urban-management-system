import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@urban/shared-types';
import { nowIso } from '@urban/shared-utils';
import type {
  StoredAuthEmailOtp,
  StoredAuthRegisterDraft,
  StoredChatOutboxEvent,
  StoredConversation,
  StoredPushOutboxEvent,
  StoredRefreshSession,
  StoredRefreshTokenRevocation,
  StoredUser,
} from '../../common/storage-records';
import { AuthorizationService } from '../../common/authorization.service';
import { AppConfigService } from '../config/app-config.service';
import { UrbanTableRepository } from '../dynamodb/urban-table.repository';

export type RetentionCategory =
  | 'EXPIRED_REFRESH_SESSION'
  | 'DISMISSED_REFRESH_SESSION'
  | 'EXPIRED_AUTH_EMAIL_OTP'
  | 'EXPIRED_AUTH_REGISTER_DRAFT'
  | 'EXPIRED_REFRESH_TOKEN_REVOCATION'
  | 'CHAT_OUTBOX_EVENT'
  | 'PUSH_OUTBOX_EVENT'
  | 'DELETED_CONVERSATION_SUMMARY';

interface RetentionCandidate {
  category: RetentionCategory;
  eligibleAt: string;
  pk: string;
  sk: string;
  tableName: string;
}

interface RetentionBucket {
  category: RetentionCategory;
  count: number;
  cutoffAt: string;
  oldestEligibleAt?: string;
  tableName: string;
}

export interface RetentionPreview {
  buckets: RetentionBucket[];
  generatedAt: string;
  totalCandidates: number;
}

export interface RetentionPurgeResult extends RetentionPreview {
  purgedAt: string;
  totalDeleted: number;
}

@Injectable()
export class RetentionMaintenanceService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly config: AppConfigService,
  ) {}

  async preview(actor: AuthenticatedUser): Promise<RetentionPreview> {
    this.assertAdmin(actor);
    return this.previewSystem();
  }

  async purge(actor: AuthenticatedUser): Promise<RetentionPurgeResult> {
    this.assertAdmin(actor);
    return this.purgeSystem();
  }

  async previewSystem(): Promise<RetentionPreview> {
    const { buckets, candidates, generatedAt } = await this.collectCandidates();

    return {
      buckets,
      generatedAt,
      totalCandidates: candidates.length,
    };
  }

  async purgeSystem(): Promise<RetentionPurgeResult> {
    const { buckets, candidates, generatedAt } = await this.collectCandidates();

    for (const candidate of candidates) {
      await this.repository.delete(
        candidate.tableName,
        candidate.pk,
        candidate.sk,
      );
    }

    return {
      buckets,
      generatedAt,
      purgedAt: nowIso(),
      totalCandidates: candidates.length,
      totalDeleted: candidates.length,
    };
  }

  private async collectCandidates(): Promise<{
    buckets: RetentionBucket[];
    candidates: RetentionCandidate[];
    generatedAt: string;
  }> {
    const generatedAt = nowIso();
    const [usersItems, conversationItems] = await Promise.all([
      this.repository.scanAll<
        | StoredAuthEmailOtp
        | StoredAuthRegisterDraft
        | StoredUser
        | StoredRefreshSession
        | StoredRefreshTokenRevocation
        | StoredPushOutboxEvent
      >(this.config.dynamodbUsersTableName),
      this.repository.scanAll<StoredConversation | StoredChatOutboxEvent>(
        this.config.dynamodbConversationsTableName,
      ),
    ]);

    const cutoffs = {
      expiredRefreshSession: this.daysAgoIso(
        this.config.retentionExpiredSessionGraceDays,
      ),
      dismissedRefreshSession: this.daysAgoIso(
        this.config.retentionDismissedSessionDays,
      ),
      revokedRefreshToken: this.daysAgoIso(
        this.config.retentionRevokedRefreshTokenGraceDays,
      ),
      authEmailOtp: this.daysAgoIso(this.config.retentionAuthEmailOtpDays),
      authRegisterDraft: this.daysAgoIso(
        this.config.retentionAuthRegisterDraftDays,
      ),
      chatOutbox: this.daysAgoIso(this.config.retentionChatOutboxDays),
      pushOutbox: this.daysAgoIso(this.config.retentionPushOutboxDays),
      deletedConversationSummary: this.daysAgoIso(
        this.config.retentionDeletedConversationSummaryDays,
      ),
    };

    const candidates: RetentionCandidate[] = [
      ...usersItems.flatMap((item) =>
        this.collectUserTableCandidates(item, cutoffs),
      ),
      ...conversationItems.flatMap((item) =>
        this.collectConversationTableCandidates(item, cutoffs),
      ),
    ];

    return {
      buckets: this.summarizeCandidates(candidates, cutoffs),
      candidates,
      generatedAt,
    };
  }

  private collectUserTableCandidates(
    item:
      | StoredAuthEmailOtp
      | StoredAuthRegisterDraft
      | StoredUser
      | StoredRefreshSession
      | StoredRefreshTokenRevocation
      | StoredPushOutboxEvent,
    cutoffs: {
      expiredRefreshSession: string;
      dismissedRefreshSession: string;
      revokedRefreshToken: string;
      authEmailOtp: string;
      authRegisterDraft: string;
      pushOutbox: string;
    },
  ): RetentionCandidate[] {
    switch (item.entityType) {
      case 'USER_REFRESH_SESSION': {
        if (
          item.dismissedAt &&
          item.dismissedAt < cutoffs.dismissedRefreshSession
        ) {
          return [
            {
              category: 'DISMISSED_REFRESH_SESSION',
              eligibleAt: item.dismissedAt,
              pk: item.PK,
              sk: item.SK,
              tableName: this.config.dynamodbUsersTableName,
            },
          ];
        }

        const eligibleAt = item.revokedAt ?? item.expiresAt;

        if (eligibleAt >= cutoffs.expiredRefreshSession) {
          return [];
        }

        return [
          {
            category: 'EXPIRED_REFRESH_SESSION',
            eligibleAt,
            pk: item.PK,
            sk: item.SK,
            tableName: this.config.dynamodbUsersTableName,
          },
        ];
      }
      case 'AUTH_EMAIL_OTP': {
        const eligibleAt = item.consumedAt ?? item.expiresAt;

        if (eligibleAt >= cutoffs.authEmailOtp) {
          return [];
        }

        return [
          {
            category: 'EXPIRED_AUTH_EMAIL_OTP',
            eligibleAt,
            pk: item.PK,
            sk: item.SK,
            tableName: this.config.dynamodbUsersTableName,
          },
        ];
      }
      case 'AUTH_REGISTER_DRAFT': {
        const eligibleAt = item.consumedAt ?? item.expiresAt;

        if (eligibleAt >= cutoffs.authRegisterDraft) {
          return [];
        }

        return [
          {
            category: 'EXPIRED_AUTH_REGISTER_DRAFT',
            eligibleAt,
            pk: item.PK,
            sk: item.SK,
            tableName: this.config.dynamodbUsersTableName,
          },
        ];
      }
      case 'USER_REFRESH_TOKEN_REVOCATION': {
        if (item.expiresAt >= cutoffs.revokedRefreshToken) {
          return [];
        }

        return [
          {
            category: 'EXPIRED_REFRESH_TOKEN_REVOCATION',
            eligibleAt: item.expiresAt,
            pk: item.PK,
            sk: item.SK,
            tableName: this.config.dynamodbUsersTableName,
          },
        ];
      }
      case 'PUSH_OUTBOX_EVENT': {
        if (item.createdAt >= cutoffs.pushOutbox) {
          return [];
        }

        return [
          {
            category: 'PUSH_OUTBOX_EVENT',
            eligibleAt: item.createdAt,
            pk: item.PK,
            sk: item.SK,
            tableName: this.config.dynamodbUsersTableName,
          },
        ];
      }
      default:
        return [];
    }
  }

  private collectConversationTableCandidates(
    item: StoredConversation | StoredChatOutboxEvent,
    cutoffs: {
      chatOutbox: string;
      deletedConversationSummary: string;
    },
  ): RetentionCandidate[] {
    switch (item.entityType) {
      case 'CHAT_OUTBOX_EVENT': {
        if (item.createdAt >= cutoffs.chatOutbox) {
          return [];
        }

        return [
          {
            category: 'CHAT_OUTBOX_EVENT',
            eligibleAt: item.createdAt,
            pk: item.PK,
            sk: item.SK,
            tableName: this.config.dynamodbConversationsTableName,
          },
        ];
      }
      case 'CONVERSATION': {
        if (
          !item.deletedAt ||
          item.deletedAt >= cutoffs.deletedConversationSummary
        ) {
          return [];
        }

        return [
          {
            category: 'DELETED_CONVERSATION_SUMMARY',
            eligibleAt: item.deletedAt,
            pk: item.PK,
            sk: item.SK,
            tableName: this.config.dynamodbConversationsTableName,
          },
        ];
      }
      default:
        return [];
    }
  }

  private summarizeCandidates(
    candidates: RetentionCandidate[],
    cutoffs: {
      expiredRefreshSession: string;
      dismissedRefreshSession: string;
      revokedRefreshToken: string;
      authEmailOtp: string;
      authRegisterDraft: string;
      chatOutbox: string;
      pushOutbox: string;
      deletedConversationSummary: string;
    },
  ): RetentionBucket[] {
    const buckets = new Map<RetentionCategory, RetentionBucket>();

    for (const candidate of candidates) {
      const existing = buckets.get(candidate.category);

      if (!existing) {
        buckets.set(candidate.category, {
          category: candidate.category,
          count: 1,
          cutoffAt: this.getCutoffForCategory(candidate.category, cutoffs),
          oldestEligibleAt: candidate.eligibleAt,
          tableName: candidate.tableName,
        });
        continue;
      }

      existing.count += 1;
      if (
        !existing.oldestEligibleAt ||
        candidate.eligibleAt < existing.oldestEligibleAt
      ) {
        existing.oldestEligibleAt = candidate.eligibleAt;
      }
    }

    return Array.from(buckets.values()).sort((left, right) =>
      left.category.localeCompare(right.category),
    );
  }

  private getCutoffForCategory(
    category: RetentionCategory,
    cutoffs: {
      expiredRefreshSession: string;
      dismissedRefreshSession: string;
      revokedRefreshToken: string;
      authEmailOtp: string;
      authRegisterDraft: string;
      chatOutbox: string;
      pushOutbox: string;
      deletedConversationSummary: string;
    },
  ): string {
    switch (category) {
      case 'EXPIRED_REFRESH_SESSION':
        return cutoffs.expiredRefreshSession;
      case 'DISMISSED_REFRESH_SESSION':
        return cutoffs.dismissedRefreshSession;
      case 'EXPIRED_REFRESH_TOKEN_REVOCATION':
        return cutoffs.revokedRefreshToken;
      case 'EXPIRED_AUTH_EMAIL_OTP':
        return cutoffs.authEmailOtp;
      case 'EXPIRED_AUTH_REGISTER_DRAFT':
        return cutoffs.authRegisterDraft;
      case 'CHAT_OUTBOX_EVENT':
        return cutoffs.chatOutbox;
      case 'PUSH_OUTBOX_EVENT':
        return cutoffs.pushOutbox;
      case 'DELETED_CONVERSATION_SUMMARY':
        return cutoffs.deletedConversationSummary;
    }
  }

  private assertAdmin(actor: AuthenticatedUser): void {
    if (!this.authorizationService.isAdmin(actor)) {
      throw new ForbiddenException(
        'Only administrators can access retention maintenance.',
      );
    }
  }

  private daysAgoIso(days: number): string {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return new Date(Date.now() - days * millisecondsPerDay).toISOString();
  }
}
