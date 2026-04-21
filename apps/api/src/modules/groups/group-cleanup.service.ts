import { Injectable, Logger } from '@nestjs/common';
import type {
  StoredConversation,
  StoredGroupDeleteCleanupTask,
  StoredMembership,
  StoredReport,
} from '../../common/storage-records';
import { makeInboxPk, nowIso } from '@urban/shared-utils';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';

const GROUP_DELETE_CLEANUP_PK = 'GROUP_DELETE_CLEANUP';

@Injectable()
export class GroupCleanupService {
  private readonly logger = new Logger(GroupCleanupService.name);

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly config: AppConfigService,
  ) {}

  buildGroupDeleteCleanupTask(
    groupId: string,
    deletedAt: string,
  ): StoredGroupDeleteCleanupTask {
    return {
      PK: GROUP_DELETE_CLEANUP_PK,
      SK: this.makeCleanupTaskSk(deletedAt, groupId),
      entityType: 'GROUP_DELETE_CLEANUP_TASK',
      groupId,
      deletedAt,
      attempts: 0,
      createdAt: deletedAt,
      updatedAt: deletedAt,
    };
  }

  async processTask(task: StoredGroupDeleteCleanupTask): Promise<void> {
    try {
      const memberships = await this.listMembershipsForGroup(task.groupId);
      await this.softDeleteMemberships(memberships, task.deletedAt);
      await this.softDeleteConversationSummariesForGroup(
        task.groupId,
        memberships,
        task.deletedAt,
      );
      await this.detachReportsFromGroup(task.groupId, task.deletedAt);
      await this.repository.delete(
        this.config.dynamodbGroupsTableName,
        task.PK,
        task.SK,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      const failedTask: StoredGroupDeleteCleanupTask = {
        ...task,
        attempts: task.attempts + 1,
        updatedAt: nowIso(),
        lastError: message.slice(0, 1000),
      };

      await this.repository.put(
        this.config.dynamodbGroupsTableName,
        failedTask,
      );
      throw error;
    }
  }

  async runPendingCleanupCycle(): Promise<{
    processedCount: number;
    remainingCount: number;
  }> {
    const tasks = await this.listPendingCleanupTasks();
    let processedCount = 0;

    for (const task of tasks) {
      try {
        await this.processTask(task);
        processedCount += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error.';
        this.logger.warn(
          `Group cleanup replay failed for ${task.groupId}: ${message}`,
        );
      }
    }

    return {
      processedCount,
      remainingCount: Math.max(tasks.length - processedCount, 0),
    };
  }

  async listPendingCleanupTasks(): Promise<StoredGroupDeleteCleanupTask[]> {
    const items = await this.repository.queryByPk<StoredGroupDeleteCleanupTask>(
      this.config.dynamodbGroupsTableName,
      GROUP_DELETE_CLEANUP_PK,
      {
        beginsWith: 'TASK#',
        scanForward: true,
      },
    );

    return items.filter(
      (item) => item.entityType === 'GROUP_DELETE_CLEANUP_TASK',
    );
  }

  private makeCleanupTaskSk(deletedAt: string, groupId: string): string {
    return `TASK#${deletedAt}#${groupId}`;
  }

  private async listMembershipsForGroup(
    groupId: string,
  ): Promise<StoredMembership[]> {
    return this.repository.queryByPk<StoredMembership>(
      this.config.dynamodbMembershipsTableName,
      `GROUP#${groupId}`,
      {
        beginsWith: 'MEMBER#',
      },
    );
  }

  private async softDeleteMemberships(
    memberships: StoredMembership[],
    deletedAt: string,
  ): Promise<void> {
    for (const membership of memberships) {
      if (
        membership.deletedAt ||
        membership.entityType !== 'GROUP_MEMBERSHIP'
      ) {
        continue;
      }

      const nextMembership: StoredMembership = {
        ...membership,
        deletedAt,
        updatedAt: deletedAt,
      };

      await this.repository.put(
        this.config.dynamodbMembershipsTableName,
        nextMembership,
      );
    }
  }

  private async softDeleteConversationSummariesForGroup(
    groupId: string,
    memberships: StoredMembership[],
    deletedAt: string,
  ): Promise<void> {
    const conversationId = `GRP#${groupId}`;

    for (const membership of memberships) {
      const summaries = await this.repository.queryByPk<StoredConversation>(
        this.config.dynamodbConversationsTableName,
        makeInboxPk(membership.userId),
        {
          beginsWith: `CONV#${conversationId}#LAST#`,
        },
      );

      for (const summary of summaries) {
        if (
          summary.entityType !== 'CONVERSATION' ||
          summary.conversationId !== conversationId ||
          summary.deletedAt
        ) {
          continue;
        }

        const nextSummary: StoredConversation = {
          ...summary,
          deletedAt,
          updatedAt: deletedAt,
        };

        await this.repository.put(
          this.config.dynamodbConversationsTableName,
          nextSummary,
        );
      }
    }
  }

  private async detachReportsFromGroup(
    groupId: string,
    updatedAt: string,
  ): Promise<void> {
    const reports = await this.repository.scanAll<StoredReport>(
      this.config.dynamodbReportsTableName,
    );

    for (const report of reports) {
      if (
        report.entityType !== 'REPORT' ||
        report.groupId !== groupId ||
        report.deletedAt
      ) {
        continue;
      }

      const nextReport: StoredReport = {
        ...report,
        groupId: undefined,
        updatedAt,
      };

      await this.repository.put(
        this.config.dynamodbReportsTableName,
        nextReport,
      );
    }
  }
}
