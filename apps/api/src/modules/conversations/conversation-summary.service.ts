import { Injectable, NotFoundException } from '@nestjs/common';
import {
  getConversationKind,
  isGroupConversationId,
  makeConversationPk,
  makeConversationSummarySk,
  makeInboxPk,
  makeInboxStatsKey,
} from '@urban/shared-utils';
import type { AuthenticatedUser } from '@urban/shared-types';
import type {
  StoredConversation,
  StoredMessage,
} from '../../common/storage-records';
import { ConversationStateService } from '../../common/services/conversation-state.service';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';

export interface ConversationSummaryAccess {
  conversationKey: string;
  participants: string[];
}

export interface ConversationSyncResult {
  latestMessage?: StoredMessage;
  participantIds: string[];
  removedUserIds: string[];
  changedUserIds: string[];
  summariesByUser: Map<string, StoredConversation>;
}

export interface SingleConversationSyncResult {
  latestMessage?: StoredMessage;
  removed: boolean;
  changed: boolean;
  summary?: StoredConversation;
}

@Injectable()
export class ConversationSummaryService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly conversationStateService: ConversationStateService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly config: AppConfigService,
  ) {}

  async upsertConversationSummaries(
    conversationId: string,
    participants: string[],
    message: StoredMessage,
  ): Promise<Map<string, StoredConversation>> {
    const kind = getConversationKind(conversationId);
    const labelMap = await this.buildConversationLabelMap(
      conversationId,
      participants,
    );
    const summariesByUser = new Map<string, StoredConversation>();

    for (const participantId of participants) {
      const existingConversation = await this.getConversationSummary(
        participantId,
        conversationId,
      );
      const previousUnreadCount = existingConversation?.unreadCount ?? 0;
      const lastReadAt =
        participantId === message.senderId
          ? message.sentAt
          : this.conversationStateService.resolveStoredLastReadAt(
              existingConversation,
              message.sentAt,
            );
      const nextConversation: StoredConversation = {
        PK: makeInboxPk(participantId),
        SK: makeConversationSummarySk(conversationId, message.sentAt),
        entityType: 'CONVERSATION',
        GSI1PK: makeInboxStatsKey(participantId, kind),
        userId: participantId,
        conversationId,
        groupName:
          labelMap.get(participantId) ??
          existingConversation?.groupName ??
          participantId,
        lastMessagePreview: this.conversationStateService.buildPreview(message),
        lastSenderName: message.senderName,
        unreadCount:
          participantId === message.senderId ? 0 : previousUnreadCount + 1,
        isGroup: kind === 'GRP',
        isPinned: existingConversation?.isPinned ?? false,
        archivedAt: null,
        mutedUntil: existingConversation?.mutedUntil ?? null,
        deletedAt: null,
        updatedAt: message.sentAt,
        lastReadAt,
      };

      if (
        existingConversation &&
        existingConversation.SK !== nextConversation.SK
      ) {
        await this.repository.delete(
          this.config.dynamodbConversationsTableName,
          existingConversation.PK,
          existingConversation.SK,
        );
      }

      await this.repository.put(
        this.config.dynamodbConversationsTableName,
        nextConversation,
      );
      summariesByUser.set(participantId, nextConversation);
    }

    return summariesByUser;
  }

  async syncConversationSummariesAfterMessageMutation(
    access: ConversationSummaryAccess,
  ): Promise<ConversationSyncResult> {
    const participantIds =
      await this.resolveConversationSummaryParticipants(access);
    const activeMessages = await this.listActiveMessages(
      access.conversationKey,
    );

    if (activeMessages.length === 0) {
      const removedUserIds: string[] = [];

      for (const participantId of participantIds) {
        const existingConversation = await this.getConversationSummary(
          participantId,
          access.conversationKey,
        );

        if (!existingConversation) {
          continue;
        }

        await this.repository.delete(
          this.config.dynamodbConversationsTableName,
          existingConversation.PK,
          existingConversation.SK,
        );
        removedUserIds.push(participantId);
      }

      return {
        participantIds,
        removedUserIds,
        changedUserIds: [],
        summariesByUser: new Map(),
      };
    }

    const latestMessage = activeMessages[0];
    const kind = getConversationKind(access.conversationKey);
    const labelMap = await this.buildConversationLabelMap(
      access.conversationKey,
      access.participants,
    );
    const summariesByUser = new Map<string, StoredConversation>();
    const changedUserIds: string[] = [];

    for (const participantId of participantIds) {
      const existingConversation = await this.getConversationSummary(
        participantId,
        access.conversationKey,
      );

      if (!existingConversation || existingConversation.deletedAt) {
        continue;
      }

      const lastReadAt = this.conversationStateService.resolveStoredLastReadAt(
        existingConversation,
        latestMessage.sentAt,
      );
      const nextConversation: StoredConversation = {
        PK: makeInboxPk(participantId),
        SK: makeConversationSummarySk(
          access.conversationKey,
          latestMessage.sentAt,
        ),
        entityType: 'CONVERSATION',
        GSI1PK: makeInboxStatsKey(participantId, kind),
        userId: participantId,
        conversationId: access.conversationKey,
        groupName:
          existingConversation.groupName ??
          labelMap.get(participantId) ??
          participantId,
        lastMessagePreview:
          this.conversationStateService.buildPreview(latestMessage),
        lastSenderName: latestMessage.senderName,
        unreadCount: this.conversationStateService.computeUnreadCount(
          participantId,
          activeMessages,
          lastReadAt,
        ),
        isGroup: kind === 'GRP',
        isPinned: existingConversation.isPinned ?? false,
        archivedAt: existingConversation.archivedAt ?? null,
        mutedUntil: existingConversation.mutedUntil ?? null,
        deletedAt: null,
        updatedAt: latestMessage.sentAt,
        lastReadAt,
      };

      if (
        !this.conversationStateService.hasConversationSummaryChanged(
          existingConversation,
          nextConversation,
        )
      ) {
        summariesByUser.set(participantId, existingConversation);
        continue;
      }

      if (existingConversation.SK !== nextConversation.SK) {
        await this.repository.delete(
          this.config.dynamodbConversationsTableName,
          existingConversation.PK,
          existingConversation.SK,
        );
      }

      await this.repository.put(
        this.config.dynamodbConversationsTableName,
        nextConversation,
      );
      summariesByUser.set(participantId, nextConversation);
      changedUserIds.push(participantId);
    }

    return {
      latestMessage,
      participantIds,
      removedUserIds: [],
      changedUserIds,
      summariesByUser,
    };
  }

  async getConversationSummary(
    userId: string,
    conversationId: string,
  ): Promise<StoredConversation | undefined> {
    const items = await this.repository.queryByPk<StoredConversation>(
      this.config.dynamodbConversationsTableName,
      makeInboxPk(userId),
      {
        beginsWith: `CONV#${conversationId}#LAST#`,
        limit: 1,
      },
    );

    return items[0];
  }

  async getConversationLabelMap(
    conversationId: string,
    participants: string[],
  ): Promise<Map<string, string>> {
    return this.buildConversationLabelMap(conversationId, participants);
  }

  async listActiveMessages(conversationId: string): Promise<StoredMessage[]> {
    const items = await this.repository.queryByPk<StoredMessage>(
      this.config.dynamodbMessagesTableName,
      makeConversationPk(conversationId),
      {
        beginsWith: 'MSG#',
      },
    );

    return items.filter((item) => !item.deletedAt);
  }

  async listVisibleMessagesForUser(
    conversationId: string,
    userId: string,
  ): Promise<StoredMessage[]> {
    const activeMessages = await this.listActiveMessages(conversationId);

    return this.conversationStateService.filterVisibleMessagesForUser(
      activeMessages,
      userId,
    );
  }

  async syncConversationSummaryForUser(
    access: ConversationSummaryAccess,
    participantId: string,
  ): Promise<SingleConversationSyncResult> {
    const existingConversation = await this.getConversationSummary(
      participantId,
      access.conversationKey,
    );
    const visibleMessages = await this.listVisibleMessagesForUser(
      access.conversationKey,
      participantId,
    );

    if (visibleMessages.length === 0) {
      if (existingConversation) {
        await this.repository.delete(
          this.config.dynamodbConversationsTableName,
          existingConversation.PK,
          existingConversation.SK,
        );

        return {
          removed: true,
          changed: true,
        };
      }

      return {
        removed: false,
        changed: false,
      };
    }

    const latestMessage = visibleMessages[0];
    const kind = getConversationKind(access.conversationKey);
    const labelMap = await this.buildConversationLabelMap(
      access.conversationKey,
      access.participants,
    );
    const baseConversation: StoredConversation =
      existingConversation ??
      ({
        PK: makeInboxPk(participantId),
        SK: makeConversationSummarySk(
          access.conversationKey,
          latestMessage.sentAt,
        ),
        entityType: 'CONVERSATION',
        GSI1PK: makeInboxStatsKey(participantId, kind),
        userId: participantId,
        conversationId: access.conversationKey,
        groupName: labelMap.get(participantId) ?? participantId,
        lastMessagePreview:
          this.conversationStateService.buildPreview(latestMessage),
        lastSenderName: latestMessage.senderName,
        unreadCount: 0,
        isGroup: kind === 'GRP',
        isPinned: false,
        archivedAt: null,
        mutedUntil: null,
        deletedAt: null,
        updatedAt: latestMessage.sentAt,
        lastReadAt: latestMessage.sentAt,
      } satisfies StoredConversation);
    const nextConversation = existingConversation
      ? this.conversationStateService.buildExpectedSummary(
          {
            ...existingConversation,
            groupName:
              existingConversation.groupName ??
              labelMap.get(participantId) ??
              participantId,
          },
          visibleMessages,
        )
      : baseConversation;

    if (
      existingConversation &&
      !this.conversationStateService.hasConversationSummaryChanged(
        existingConversation,
        nextConversation,
      )
    ) {
      return {
        latestMessage,
        removed: false,
        changed: false,
        summary: existingConversation,
      };
    }

    if (
      existingConversation &&
      existingConversation.SK !== nextConversation.SK
    ) {
      await this.repository.delete(
        this.config.dynamodbConversationsTableName,
        existingConversation.PK,
        existingConversation.SK,
      );
    }

    await this.repository.put(
      this.config.dynamodbConversationsTableName,
      nextConversation,
    );

    return {
      latestMessage,
      removed: false,
      changed: true,
      summary: nextConversation,
    };
  }

  private async resolveConversationSummaryParticipants(
    access: ConversationSummaryAccess,
  ): Promise<string[]> {
    const storedSummaries = await this.repository.scanAll<StoredConversation>(
      this.config.dynamodbConversationsTableName,
    );
    const summaryUserIds = storedSummaries
      .filter((summary) => summary.conversationId === access.conversationKey)
      .map((summary) => summary.userId);

    return Array.from(new Set([...access.participants, ...summaryUserIds]));
  }

  private async buildConversationLabelMap(
    conversationId: string,
    participants: string[],
  ): Promise<Map<string, string>> {
    const userMap = new Map<
      string,
      Awaited<ReturnType<UsersService['getByIdOrThrow']>>
    >();
    const labelMap = new Map<string, string>();

    for (const userId of participants) {
      userMap.set(userId, await this.usersService.getByIdOrThrow(userId));
    }

    for (const participantId of participants) {
      labelMap.set(
        participantId,
        await this.getConversationLabel(
          participantId,
          conversationId,
          participants,
          userMap,
        ),
      );
    }

    return labelMap;
  }

  private async getConversationLabel(
    participantId: string,
    conversationId: string,
    participants: string[],
    userMap: Map<string, Awaited<ReturnType<UsersService['getByIdOrThrow']>>>,
  ): Promise<string> {
    if (isGroupConversationId(conversationId)) {
      const user = userMap.get(participantId);

      if (!user) {
        throw new NotFoundException('Conversation participant not found.');
      }

      const group = await this.groupsService.getGroup(
        {
          id: participantId,
          phone: user.phone,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          locationCode: user.locationCode,
          unit: user.unit,
          avatarUrl: user.avatarUrl,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        } satisfies AuthenticatedUser,
        conversationId.slice('GRP#'.length),
      );
      return group.groupName;
    }

    const otherParticipantId = participants.find(
      (userId) => userId !== participantId,
    );

    if (!otherParticipantId) {
      throw new NotFoundException('Conversation participant not found.');
    }

    return userMap.get(otherParticipantId)?.fullName ?? otherParticipantId;
  }
}
