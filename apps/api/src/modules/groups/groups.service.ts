import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  CHAT_SOCKET_EVENTS,
  GROUP_MESSAGE_POLICIES,
  GROUP_MEMBER_ROLES,
  GROUP_TYPES,
  type GroupMemberRole,
  type GroupMessagePolicy,
  type GroupType,
} from '@urban/shared-constants';
import type {
  ApiResponseMeta,
  ApiSuccessResponse,
  AuthenticatedUser,
  AuditEventItem,
  ChatConversationUpdatedEvent,
  GroupBan,
  GroupInviteLink,
  GroupMembership,
  GroupMetadata,
} from '@urban/shared-types';
import {
  createUlid,
  makeGroupBanSk,
  makeGroupInviteCodeLookupPk,
  makeGroupInviteCodeLookupSk,
  makeGroupInviteLinkSk,
  makeGroupMetadataSk,
  makeGroupPk,
  makeGroupTypeLocationKey,
  makeInboxPk,
  makeMembershipSk,
  makeUserGroupsKey,
  makeUserGroupsSk,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import { AuditTrailService } from '../../infrastructure/audit/audit-trail.service';
import {
  GROUP_MEMBER_ROLE_INPUTS,
  normalizeGroupMemberRole,
} from '../../common/group-member-roles';
import {
  buildPaginatedResponse,
  paginateSortedItems,
} from '../../common/pagination';
import {
  toConversationSummary,
  toGroupBan,
  toGroupInviteLink,
  toGroupMetadata,
  toMembership,
} from '../../common/mappers';
import type {
  StoredConversation,
  StoredGroupAuditEvent,
  StoredGroupBan,
  StoredGroupInviteCodeLookup,
  StoredGroupInviteLink,
  StoredGroup,
  StoredMembership,
} from '../../common/storage-records';
import {
  ensureLocationCode,
  ensureObject,
  optionalBoolean,
  optionalEnum,
  optionalQueryString,
  parseLocationCodeQuery,
  optionalString,
  parseBooleanQuery,
  parseLimit,
  requiredEnum,
  requiredString,
} from '../../common/validation';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { ChatRealtimeService } from '../conversations/chat-realtime.service';
import { ConversationsService } from '../conversations/conversations.service';
import { GroupCleanupService } from './group-cleanup.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly usersService: UsersService,
    private readonly groupCleanupService: GroupCleanupService,
    private readonly auditTrailService: AuditTrailService,
    private readonly chatRealtimeService: ChatRealtimeService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    private readonly config: AppConfigService,
  ) {}

  async createGroup(
    actor: AuthenticatedUser,
    payload: unknown,
  ): Promise<GroupMetadata> {
    const body = ensureObject(payload);
    const groupName = requiredString(body, 'groupName', {
      minLength: 1,
      maxLength: 100,
    });
    const groupType = requiredEnum(body, 'groupType', GROUP_TYPES);
    const locationCode = ensureLocationCode(
      requiredString(body, 'locationCode'),
    );
    const description = optionalString(body, 'description', { maxLength: 500 });
    const isOfficial = optionalBoolean(body, 'isOfficial') ?? false;
    const messagePolicy =
      optionalEnum(body, 'messagePolicy', GROUP_MESSAGE_POLICIES) ??
      'ALL_MEMBERS';

    if (
      !this.authorizationService.canCreateGroup(
        actor,
        groupType,
        locationCode,
        isOfficial,
      )
    ) {
      throw new ForbiddenException('You cannot create this group.');
    }

    const now = nowIso();
    const groupId = createUlid();
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_CREATED',
      actorUserId: actor.id,
      groupId,
      summary: `${actor.fullName} created a group.`,
      metadata: {
        groupType,
        locationCode,
        messagePolicy,
        isOfficial,
      },
    });
    const group: StoredGroup = {
      PK: makeGroupPk(groupId),
      SK: makeGroupMetadataSk(),
      entityType: 'GROUP_METADATA',
      GSI1PK: makeGroupTypeLocationKey(groupType, locationCode),
      groupId,
      groupName,
      groupType,
      messagePolicy,
      locationCode,
      createdBy: actor.id,
      description,
      memberCount: 1,
      isOfficial,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const ownerMembership: StoredMembership = {
      PK: makeGroupPk(groupId),
      SK: makeMembershipSk(actor.id),
      entityType: 'GROUP_MEMBERSHIP',
      GSI1PK: makeUserGroupsKey(actor.id),
      GSI1SK: makeUserGroupsSk(groupId, now),
      groupId,
      userId: actor.id,
      roleInGroup: 'OWNER',
      joinedAt: now,
      deletedAt: null,
      updatedAt: now,
    };

    await this.repository.transactPut([
      {
        tableName: this.config.dynamodbGroupsTableName,
        item: group,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        tableName: this.config.dynamodbMembershipsTableName,
        item: ownerMembership,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        tableName: this.config.dynamodbGroupsTableName,
        item: auditRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);

    return toGroupMetadata(group);
  }

  async listGroups(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<GroupMetadata[], ApiResponseMeta>> {
    const mine = parseBooleanQuery(query.mine, 'mine') ?? false;
    const groupType = optionalQueryString(query.groupType, 'groupType');
    const locationCode = parseLocationCodeQuery(
      query.locationCode,
      'locationCode',
    );
    const keyword = optionalQueryString(query.q, 'q')?.toLowerCase();
    const limit = parseLimit(query.limit);
    const actorMemberships = await this.getMembershipsForUser(actor.id);
    const actorMembershipIds = new Set(
      actorMemberships.map((membership) => membership.groupId),
    );
    let groups: StoredGroup[];

    if (mine) {
      groups = await this.getGroupsFromMemberships(actorMemberships);
    } else {
      const indexedGroups = await this.tryListGroupsViaLocationIndex(
        actor,
        groupType as GroupType | undefined,
        locationCode,
      );

      if (indexedGroups) {
        groups = this.mergeGroupsById([
          ...(await this.getGroupsFromMemberships(actorMemberships)),
          ...indexedGroups,
        ]);
      } else {
        groups = await this.repository.scanAll<StoredGroup>(
          this.config.dynamodbGroupsTableName,
        );
      }
    }

    const filtered = groups
      .filter((group) => group.entityType === 'GROUP_METADATA')
      .filter((group) => !group.deletedAt)
      .filter((group) =>
        this.authorizationService.canReadGroup(
          actor,
          group,
          actorMembershipIds.has(group.groupId),
        ),
      )
      .filter((group) => {
        if (groupType && group.groupType !== groupType) {
          return false;
        }

        if (locationCode && group.locationCode !== locationCode) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        return [group.groupName, group.description ?? '']
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      });
    const page = paginateSortedItems(
      filtered,
      limit,
      query.cursor,
      (group) => group.createdAt,
      (group) => group.groupId,
    );

    return buildPaginatedResponse(
      page.items.map(toGroupMetadata),
      page.nextCursor,
    );
  }

  private async tryListGroupsViaLocationIndex(
    actor: AuthenticatedUser,
    groupType: GroupType | undefined,
    locationCode: string | undefined,
  ): Promise<StoredGroup[] | undefined> {
    const indexedGroupTypes = this.getIndexedBrowseGroupTypes(actor, groupType);

    if (locationCode) {
      return this.listGroupsByLocationIndex(indexedGroupTypes, locationCode);
    }

    if (actor.role === 'CITIZEN' || actor.role === 'WARD_OFFICER') {
      return this.listGroupsByLocationIndex(
        indexedGroupTypes,
        actor.locationCode,
      );
    }

    return undefined;
  }

  private getIndexedBrowseGroupTypes(
    actor: AuthenticatedUser,
    groupType: GroupType | undefined,
  ): GroupType[] {
    if (groupType) {
      if (groupType === 'PRIVATE' && actor.role !== 'ADMIN') {
        return [];
      }

      return [groupType];
    }

    if (actor.role === 'ADMIN') {
      return [...GROUP_TYPES];
    }

    return GROUP_TYPES.filter(
      (candidateType): candidateType is GroupType =>
        candidateType !== 'PRIVATE',
    );
  }

  private async listGroupsByLocationIndex(
    groupTypes: GroupType[],
    locationCode: string,
  ): Promise<StoredGroup[]> {
    if (groupTypes.length === 0) {
      return [];
    }

    const keys = (
      await Promise.all(
        groupTypes.map((candidateType) =>
          this.repository.queryByIndex<{
            PK: string;
            SK: string;
          }>(
            this.config.dynamodbGroupsTableName,
            this.config.dynamodbGroupsTypeLocationIndexName,
            'GSI1PK',
            'createdAt',
            makeGroupTypeLocationKey(candidateType, locationCode),
          ),
        ),
      )
    ).flat();

    if (keys.length === 0) {
      return [];
    }

    return this.repository.batchGet<StoredGroup>(
      this.config.dynamodbGroupsTableName,
      keys,
    );
  }

  private mergeGroupsById(groups: StoredGroup[]): StoredGroup[] {
    return Array.from(
      new Map(groups.map((group) => [group.groupId, group])).values(),
    );
  }

  async getGroup(
    actor: AuthenticatedUser,
    groupId: string,
  ): Promise<GroupMetadata> {
    const group = await this.getGroupOrThrow(groupId);
    const membership = await this.getMembership(groupId, actor.id);

    if (
      !this.authorizationService.canReadGroup(
        actor,
        group,
        Boolean(membership && !membership.deletedAt),
      )
    ) {
      throw new ForbiddenException('You cannot access this group.');
    }

    return toGroupMetadata(group);
  }

  async updateGroup(
    actor: AuthenticatedUser,
    groupId: string,
    payload: unknown,
  ): Promise<GroupMetadata> {
    const body = ensureObject(payload);
    const group = await this.getGroupOrThrow(groupId);
    const membership = await this.getMembership(groupId, actor.id);
    const roleInGroup = this.getMembershipRole(membership);

    if (!this.authorizationService.canManageGroup(actor, group, roleInGroup)) {
      throw new ForbiddenException('You cannot update this group.');
    }

    const groupName = optionalString(body, 'groupName', {
      minLength: 1,
      maxLength: 100,
    });
    const description = optionalString(body, 'description', { maxLength: 500 });
    const groupType = optionalEnum(body, 'groupType', GROUP_TYPES);
    const locationCodeInput = optionalString(body, 'locationCode');
    const isOfficial = optionalBoolean(body, 'isOfficial');
    const messagePolicyInput = optionalEnum(
      body,
      'messagePolicy',
      GROUP_MESSAGE_POLICIES,
    );
    const nextLocationCode = locationCodeInput
      ? ensureLocationCode(locationCodeInput)
      : group.locationCode;
    const nextGroupType: GroupType = groupType ?? group.groupType;
    const nextIsOfficial = isOfficial ?? group.isOfficial;
    const currentMessagePolicy: GroupMessagePolicy =
      group.messagePolicy ?? 'ALL_MEMBERS';
    const nextMessagePolicy: GroupMessagePolicy =
      messagePolicyInput ?? currentMessagePolicy;
    const isRenamingGroup =
      typeof groupName === 'string' && groupName !== group.groupName;

    if (
      isRenamingGroup &&
      !this.authorizationService.canRenameGroup(actor, roleInGroup)
    ) {
      throw new ForbiddenException('Only the owner can rename the group.');
    }

    if (
      messagePolicyInput &&
      nextMessagePolicy !== currentMessagePolicy &&
      !this.authorizationService.canChangeGroupMessagePolicy(actor, roleInGroup)
    ) {
      throw new ForbiddenException(
        'Only the owner can change the group message policy.',
      );
    }

    if (
      !this.authorizationService.canCreateGroup(
        actor,
        nextGroupType,
        nextLocationCode,
        nextIsOfficial,
      )
    ) {
      throw new ForbiddenException('Updated group scope is invalid.');
    }

    const nextGroup: StoredGroup = {
      ...group,
      GSI1PK: makeGroupTypeLocationKey(nextGroupType, nextLocationCode),
      groupName: groupName ?? group.groupName,
      description: description ?? group.description,
      groupType: nextGroupType,
      messagePolicy: nextMessagePolicy,
      locationCode: nextLocationCode,
      isOfficial: nextIsOfficial,
      updatedAt: nowIso(),
    };
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_UPDATED',
      actorUserId: actor.id,
      groupId,
      summary: `${actor.fullName} updated group details.`,
      metadata: {
        groupType: nextGroupType,
        locationCode: nextLocationCode,
        messagePolicy: nextMessagePolicy,
        isOfficial: nextIsOfficial,
      },
    });

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbGroupsTableName,
          item: nextGroup,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': group.updatedAt,
          },
        },
        {
          tableName: this.config.dynamodbGroupsTableName,
          item: auditRecord,
          conditionExpression:
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Group changed. Please retry.');
      }

      throw error;
    }

    if (isRenamingGroup) {
      await this.syncGroupConversationNames(
        group.groupId,
        nextGroup.groupName,
        nextGroup.updatedAt,
      );
      await this.emitGroupLifecycleSystemMessage(
        actor,
        groupId,
        `${actor.fullName} renamed the group to ${nextGroup.groupName}.`,
      );
    }

    if (messagePolicyInput && nextMessagePolicy !== currentMessagePolicy) {
      await this.emitGroupLifecycleSystemMessage(
        actor,
        groupId,
        `${actor.fullName} changed message permissions to ${this.describeMessagePolicy(nextMessagePolicy)}.`,
      );
    }

    return toGroupMetadata(nextGroup);
  }

  async deleteGroup(
    actor: AuthenticatedUser,
    groupId: string,
  ): Promise<GroupMetadata> {
    const group = await this.getGroupOrThrow(groupId);
    const membership = await this.getMembership(groupId, actor.id);

    if (
      !this.authorizationService.canDeleteGroup(
        actor,
        group,
        this.getMembershipRole(membership),
      )
    ) {
      throw new ForbiddenException('You cannot delete this group.');
    }

    const deletedAt = nowIso();
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_DELETED',
      actorUserId: actor.id,
      groupId,
      summary: `${actor.fullName} deleted the group.`,
      metadata: {
        groupType: group.groupType,
        locationCode: group.locationCode,
      },
    });
    const nextGroup: StoredGroup = {
      ...group,
      deletedAt,
      memberCount: 0,
      updatedAt: deletedAt,
    };
    const cleanupTask = this.groupCleanupService.buildGroupDeleteCleanupTask(
      groupId,
      deletedAt,
    );

    try {
      await this.repository.transactWrite([
        {
          kind: 'put',
          tableName: this.config.dynamodbGroupsTableName,
          item: nextGroup,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': group.updatedAt,
          },
        },
        {
          kind: 'put',
          tableName: this.config.dynamodbGroupsTableName,
          item: cleanupTask,
          conditionExpression:
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
        {
          kind: 'put',
          tableName: this.config.dynamodbGroupsTableName,
          item: auditRecord,
          conditionExpression:
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Group changed. Please retry.');
      }

      throw error;
    }

    try {
      await this.groupCleanupService.processTask(cleanupTask);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.logger.warn(
        'Group cleanup deferred for ' + groupId + ': ' + message,
      );
    }

    return toGroupMetadata(nextGroup);
  }

  async joinGroup(
    actor: AuthenticatedUser,
    groupId: string,
  ): Promise<GroupMembership> {
    const group = await this.getGroupOrThrow(groupId);
    const existingMembership = await this.getMembership(groupId, actor.id);
    const activeBan = await this.getActiveBan(groupId, actor.id);

    if (existingMembership && !existingMembership.deletedAt) {
      return toMembership(existingMembership);
    }

    if (activeBan) {
      throw new ForbiddenException('You are banned from this group.');
    }

    if (!this.authorizationService.canJoinGroup(actor, group)) {
      throw new ForbiddenException('You cannot join this group.');
    }

    const now = nowIso();
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_MEMBER_ADDED',
      actorUserId: actor.id,
      groupId,
      targetUserId: actor.id,
      summary: `${actor.fullName} joined the group.`,
      metadata: {
        roleInGroup: existingMembership?.roleInGroup ?? 'MEMBER',
      },
    });
    const membership: StoredMembership = {
      PK: makeGroupPk(groupId),
      SK: makeMembershipSk(actor.id),
      entityType: 'GROUP_MEMBERSHIP',
      GSI1PK: makeUserGroupsKey(actor.id),
      GSI1SK: makeUserGroupsSk(groupId, now),
      groupId,
      userId: actor.id,
      roleInGroup: existingMembership?.roleInGroup ?? 'MEMBER',
      joinedAt: now,
      deletedAt: null,
      updatedAt: now,
    };

    const nextGroup: StoredGroup = {
      ...group,
      memberCount: group.memberCount + 1,
      updatedAt: now,
    };

    await this.writeGroupMembershipTransaction({
      group,
      nextGroup,
      membership,
      membershipConditionExpression: existingMembership
        ? 'attribute_exists(PK) AND attribute_exists(SK) AND deletedAt = :expectedDeletedAt'
        : 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      membershipExpressionAttributeValues: existingMembership
        ? {
            ':expectedDeletedAt': existingMembership.deletedAt,
          }
        : undefined,
      auditRecord,
    });

    await this.emitGroupLifecycleSystemMessage(
      actor,
      groupId,
      `${actor.fullName} joined the group.`,
    );

    return toMembership(membership);
  }

  async leaveGroup(
    actor: AuthenticatedUser,
    groupId: string,
    payload?: unknown,
  ): Promise<GroupMembership> {
    const body = payload == null ? {} : ensureObject(payload);
    const successorUserId = optionalString(body, 'successorUserId', {
      minLength: 5,
      maxLength: 50,
    });
    const group = await this.getGroupOrThrow(groupId);
    const membership = await this.getMembership(groupId, actor.id);

    if (!membership || membership.deletedAt) {
      throw new NotFoundException('Membership not found.');
    }

    if (this.getMembershipRole(membership) === 'OWNER') {
      if (!successorUserId || successorUserId === actor.id) {
        throw new BadRequestException(
          'Owner must choose another active member as the new owner before leaving.',
        );
      }

      const successorUser =
        await this.usersService.getActiveByIdOrThrow(successorUserId);
      const successorMembership = await this.getMembership(
        groupId,
        successorUserId,
      );

      if (!successorMembership || successorMembership.deletedAt) {
        throw new NotFoundException('Membership not found.');
      }

      const occurredAt = nowIso();
      const auditRecord = this.auditTrailService.buildGroupEvent({
        action: 'GROUP_OWNERSHIP_TRANSFERRED',
        actorUserId: actor.id,
        groupId,
        targetUserId: successorUserId,
        summary: `${actor.fullName} transferred ownership.`,
        metadata: {
          successorUserId,
        },
      });
      const nextMembership: StoredMembership = {
        ...membership,
        deletedAt: occurredAt,
        updatedAt: occurredAt,
      };
      const nextSuccessorMembership: StoredMembership = {
        ...successorMembership,
        roleInGroup: 'OWNER',
        updatedAt: occurredAt,
      };
      const nextGroup: StoredGroup = {
        ...group,
        memberCount: Math.max(group.memberCount - 1, 0),
        updatedAt: occurredAt,
      };

      try {
        await this.repository.transactWrite([
          {
            kind: 'put',
            tableName: this.config.dynamodbMembershipsTableName,
            item: nextMembership,
            conditionExpression:
              'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
            expressionAttributeValues: {
              ':expectedUpdatedAt': membership.updatedAt,
              ':expectedDeletedAt': null,
            },
          },
          {
            kind: 'put',
            tableName: this.config.dynamodbMembershipsTableName,
            item: nextSuccessorMembership,
            conditionExpression:
              'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
            expressionAttributeValues: {
              ':expectedUpdatedAt': successorMembership.updatedAt,
              ':expectedDeletedAt': null,
            },
          },
          {
            kind: 'put',
            tableName: this.config.dynamodbGroupsTableName,
            item: nextGroup,
            conditionExpression:
              'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
            expressionAttributeValues: {
              ':expectedUpdatedAt': group.updatedAt,
            },
          },
          {
            kind: 'put',
            tableName: this.config.dynamodbGroupsTableName,
            item: auditRecord,
            conditionExpression:
              'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          },
        ]);
      } catch (error) {
        if (this.isConditionalWriteConflict(error)) {
          throw new ConflictException('Group ownership changed. Please retry.');
        }

        throw error;
      }

      await this.emitGroupLifecycleSystemMessage(
        actor,
        groupId,
        `Ownership was transferred from ${actor.fullName} to ${this.getUserDisplayName(successorUser, successorUserId)}.`,
      );

      await this.removeGroupConversationAccess(actor.id, groupId, occurredAt);

      return toMembership(nextMembership);
    }

    const nextMembership: StoredMembership = {
      ...membership,
      deletedAt: nowIso(),
      updatedAt: nowIso(),
    };
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_MEMBER_LEFT',
      actorUserId: actor.id,
      groupId,
      targetUserId: actor.id,
      summary: `${actor.fullName} left the group.`,
    });

    const nextGroup: StoredGroup = {
      ...group,
      memberCount: Math.max(group.memberCount - 1, 0),
      updatedAt: nextMembership.updatedAt,
    };

    await this.writeGroupMembershipTransaction({
      group,
      nextGroup,
      membership: nextMembership,
      membershipConditionExpression:
        'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
      membershipExpressionAttributeValues: {
        ':expectedUpdatedAt': membership.updatedAt,
        ':expectedDeletedAt': null,
      },
      auditRecord,
    });
    await this.emitGroupLifecycleSystemMessage(
      actor,
      groupId,
      `${actor.fullName} left the group.`,
    );
    await this.removeGroupConversationAccess(
      actor.id,
      groupId,
      nextMembership.updatedAt,
    );

    return toMembership(nextMembership);
  }

  async listMembers(
    actor: AuthenticatedUser,
    groupId: string,
  ): Promise<GroupMembership[]> {
    const group = await this.getGroupOrThrow(groupId);
    const actorMembership = await this.getMembership(groupId, actor.id);

    if (
      !this.authorizationService.canReadGroup(
        actor,
        group,
        Boolean(actorMembership && !actorMembership.deletedAt),
      )
    ) {
      throw new ForbiddenException('You cannot access members of this group.');
    }

    return (await this.queryGroupMemberships(groupId))
      .filter((membership) => !membership.deletedAt)
      .map(toMembership);
  }

  async listAuditEvents(
    actor: AuthenticatedUser,
    groupId: string,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<AuditEventItem[], ApiResponseMeta>> {
    await this.getManageGroupContext(actor, groupId);

    return this.auditTrailService.listGroupEvents(groupId, query);
  }

  async listBans(
    actor: AuthenticatedUser,
    groupId: string,
  ): Promise<GroupBan[]> {
    await this.getManageGroupContext(actor, groupId);

    return (await this.queryGroupBans(groupId))
      .filter((ban) => this.isBanActive(ban))
      .map(toGroupBan);
  }

  async banMember(
    actor: AuthenticatedUser,
    groupId: string,
    userId: string,
    payload: unknown,
  ): Promise<GroupBan> {
    const body = ensureObject(payload ?? {});
    const reason = optionalString(body, 'reason', { maxLength: 500 });
    const expiresAtInput = optionalString(body, 'expiresAt', {
      minLength: 20,
      maxLength: 30,
    });
    const expiresAt = this.parseBanExpiresAt(expiresAtInput);
    const { group, actorMembership } = await this.getManageGroupContext(
      actor,
      groupId,
    );

    if (userId === actor.id) {
      throw new BadRequestException('You cannot ban yourself from the group.');
    }

    const targetUser = await this.usersService.getByIdOrThrow(userId);

    const existingBan = await this.getActiveBan(groupId, userId);

    if (existingBan) {
      return toGroupBan(existingBan);
    }

    const targetMembership = await this.getMembership(groupId, userId);
    const actorRoleInGroup = this.getMembershipRole(actorMembership);
    const targetRoleInGroup = this.getMembershipRole(targetMembership);

    if (targetRoleInGroup === 'OWNER') {
      throw new ForbiddenException('The group owner cannot be banned.');
    }

    if (
      actor.role !== 'ADMIN' &&
      actorRoleInGroup === 'DEPUTY' &&
      targetRoleInGroup &&
      targetRoleInGroup !== 'MEMBER'
    ) {
      throw new ForbiddenException('Deputies can only ban regular members.');
    }

    const occurredAt = nowIso();
    const nextBan: StoredGroupBan = {
      PK: makeGroupPk(groupId),
      SK: makeGroupBanSk(userId),
      entityType: 'GROUP_BAN',
      groupId,
      userId,
      bannedByUserId: actor.id,
      reason,
      expiresAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [
      {
        kind: 'put',
        tableName: this.config.dynamodbMembershipsTableName,
        item: nextBan,
      },
    ];

    if (targetMembership && !targetMembership.deletedAt) {
      const nextMembership: StoredMembership = {
        ...targetMembership,
        deletedAt: occurredAt,
        updatedAt: occurredAt,
      };
      const nextGroup: StoredGroup = {
        ...group,
        memberCount: Math.max(group.memberCount - 1, 0),
        updatedAt: occurredAt,
      };

      transactionItems.push(
        {
          kind: 'put',
          tableName: this.config.dynamodbMembershipsTableName,
          item: nextMembership,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': targetMembership.updatedAt,
            ':expectedDeletedAt': null,
          },
        },
        {
          kind: 'put',
          tableName: this.config.dynamodbGroupsTableName,
          item: nextGroup,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': group.updatedAt,
          },
        },
      );
    }

    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_MEMBER_BANNED',
      actorUserId: actor.id,
      groupId,
      targetUserId: userId,
      summary: `${actor.fullName} banned a member from the group.`,
      metadata: {
        reason: reason ?? null,
        expiresAt,
      },
    });

    transactionItems.push({
      kind: 'put',
      tableName: this.config.dynamodbGroupsTableName,
      item: auditRecord,
      conditionExpression:
        'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    });

    try {
      await this.repository.transactWrite(transactionItems);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Group ban changed. Please retry.');
      }

      throw error;
    }

    if (targetMembership && !targetMembership.deletedAt) {
      await this.removeGroupConversationAccess(userId, groupId, occurredAt);
    }

    await this.emitGroupLifecycleSystemMessage(
      actor,
      groupId,
      `${actor.fullName} banned ${this.getUserDisplayName(targetUser, userId)} from the group.`,
    );

    return toGroupBan(nextBan);
  }

  async unbanMember(
    actor: AuthenticatedUser,
    groupId: string,
    userId: string,
  ): Promise<GroupBan> {
    await this.getManageGroupContext(actor, groupId);
    const existingBan = await this.getActiveBan(groupId, userId);
    const targetUserName = await this.resolveUserDisplayName(userId);

    if (!existingBan) {
      throw new NotFoundException('Group ban not found.');
    }

    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_MEMBER_UNBANNED',
      actorUserId: actor.id,
      groupId,
      targetUserId: userId,
      summary: `${actor.fullName} unbanned a member from the group.`,
    });

    await this.repository.transactWrite([
      {
        kind: 'delete',
        tableName: this.config.dynamodbMembershipsTableName,
        key: {
          PK: existingBan.PK,
          SK: existingBan.SK,
        },
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbGroupsTableName,
        item: auditRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);

    await this.emitGroupLifecycleSystemMessage(
      actor,
      groupId,
      `${actor.fullName} unbanned ${targetUserName}.`,
    );

    return toGroupBan(existingBan);
  }

  async listInviteLinks(
    actor: AuthenticatedUser,
    groupId: string,
  ): Promise<GroupInviteLink[]> {
    await this.getManageGroupContext(actor, groupId);

    return (await this.queryGroupInviteLinks(groupId)).map(toGroupInviteLink);
  }

  async createInviteLink(
    actor: AuthenticatedUser,
    groupId: string,
    payload: unknown,
  ): Promise<GroupInviteLink> {
    const body = ensureObject(payload ?? {});
    const expiresAt = this.parseInviteExpiresAt(
      optionalString(body, 'expiresAt', {
        minLength: 20,
        maxLength: 30,
      }),
    );
    const maxUses = this.parseInviteMaxUses(body.maxUses);
    await this.getManageGroupContext(actor, groupId);

    const occurredAt = nowIso();
    const inviteId = createUlid();
    const code = createUlid().toLowerCase();
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_INVITE_CREATED',
      actorUserId: actor.id,
      groupId,
      inviteId,
      summary: `${actor.fullName} created an invite link.`,
      metadata: {
        expiresAt,
        maxUses,
      },
    });
    const inviteLink: StoredGroupInviteLink = {
      PK: makeGroupPk(groupId),
      SK: makeGroupInviteLinkSk(inviteId),
      entityType: 'GROUP_INVITE_LINK',
      groupId,
      inviteId,
      code,
      createdByUserId: actor.id,
      expiresAt,
      maxUses,
      usedCount: 0,
      disabledAt: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const codeLookup: StoredGroupInviteCodeLookup = {
      PK: makeGroupInviteCodeLookupPk(code),
      SK: makeGroupInviteCodeLookupSk(),
      entityType: 'GROUP_INVITE_CODE_LOOKUP',
      code,
      groupId,
      inviteId,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    await this.repository.transactWrite([
      {
        kind: 'put',
        tableName: this.config.dynamodbGroupsTableName,
        item: inviteLink,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbGroupsTableName,
        item: codeLookup,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbGroupsTableName,
        item: auditRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);

    return toGroupInviteLink(inviteLink);
  }

  async revokeInviteLink(
    actor: AuthenticatedUser,
    groupId: string,
    inviteId: string,
  ): Promise<GroupInviteLink> {
    await this.getManageGroupContext(actor, groupId);
    const inviteLink = await this.getInviteLink(groupId, inviteId);

    if (!inviteLink) {
      throw new NotFoundException('Invite link not found.');
    }

    if (inviteLink.disabledAt) {
      return toGroupInviteLink(inviteLink);
    }

    const occurredAt = nowIso();
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_INVITE_REVOKED',
      actorUserId: actor.id,
      groupId,
      inviteId,
      summary: `${actor.fullName} revoked an invite link.`,
      metadata: {
        code: inviteLink.code,
      },
    });
    const nextInviteLink: StoredGroupInviteLink = {
      ...inviteLink,
      disabledAt: occurredAt,
      updatedAt: occurredAt,
    };

    try {
      await this.repository.transactWrite([
        {
          kind: 'put',
          tableName: this.config.dynamodbGroupsTableName,
          item: nextInviteLink,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': inviteLink.updatedAt,
          },
        },
        {
          kind: 'delete',
          tableName: this.config.dynamodbGroupsTableName,
          key: {
            PK: makeGroupInviteCodeLookupPk(inviteLink.code),
            SK: makeGroupInviteCodeLookupSk(),
          },
        },
        {
          kind: 'put',
          tableName: this.config.dynamodbGroupsTableName,
          item: auditRecord,
          conditionExpression:
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Invite link changed. Please retry.');
      }

      throw error;
    }

    return toGroupInviteLink(nextInviteLink);
  }

  async joinGroupByInvite(
    actor: AuthenticatedUser,
    code: string,
  ): Promise<GroupMembership> {
    const inviteLookup = await this.getInviteCodeLookup(code);

    if (!inviteLookup) {
      throw new NotFoundException('Invite link not found.');
    }

    const group = await this.getGroupOrThrow(inviteLookup.groupId);
    const activeBan = await this.getActiveBan(group.groupId, actor.id);

    if (activeBan) {
      throw new ForbiddenException('You are banned from this group.');
    }

    const inviteLink = await this.getInviteLink(
      inviteLookup.groupId,
      inviteLookup.inviteId,
    );

    if (!inviteLink) {
      throw new NotFoundException('Invite link not found.');
    }

    if (inviteLink.disabledAt) {
      throw new ForbiddenException('Invite link is no longer active.');
    }

    if (inviteLink.expiresAt && inviteLink.expiresAt <= nowIso()) {
      throw new ForbiddenException('Invite link has expired.');
    }

    if (
      inviteLink.maxUses !== null &&
      inviteLink.usedCount >= inviteLink.maxUses
    ) {
      throw new ForbiddenException('Invite link has reached its usage limit.');
    }

    const existingMembership = await this.getMembership(
      group.groupId,
      actor.id,
    );

    if (existingMembership && !existingMembership.deletedAt) {
      return toMembership(existingMembership);
    }

    const occurredAt = nowIso();
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_INVITE_REDEEMED',
      actorUserId: actor.id,
      groupId: group.groupId,
      inviteId: inviteLink.inviteId,
      targetUserId: actor.id,
      summary: `${actor.fullName} joined using an invite link.`,
      metadata: {
        code,
      },
    });
    const membership: StoredMembership = {
      PK: makeGroupPk(group.groupId),
      SK: makeMembershipSk(actor.id),
      entityType: 'GROUP_MEMBERSHIP',
      GSI1PK: makeUserGroupsKey(actor.id),
      GSI1SK: makeUserGroupsSk(group.groupId, occurredAt),
      groupId: group.groupId,
      userId: actor.id,
      roleInGroup: 'MEMBER',
      joinedAt: existingMembership?.joinedAt ?? occurredAt,
      deletedAt: null,
      updatedAt: occurredAt,
    };
    const nextGroup: StoredGroup = {
      ...group,
      memberCount: group.memberCount + 1,
      updatedAt: occurredAt,
    };
    const nextInviteLink: StoredGroupInviteLink = {
      ...inviteLink,
      usedCount: inviteLink.usedCount + 1,
      updatedAt: occurredAt,
    };

    try {
      await this.repository.transactWrite([
        {
          kind: 'put',
          tableName: this.config.dynamodbMembershipsTableName,
          item: membership,
          conditionExpression: existingMembership
            ? 'attribute_exists(PK) AND attribute_exists(SK) AND deletedAt = :expectedDeletedAt'
            : 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          expressionAttributeValues: existingMembership
            ? {
                ':expectedDeletedAt': existingMembership.deletedAt,
              }
            : undefined,
        },
        {
          kind: 'put',
          tableName: this.config.dynamodbGroupsTableName,
          item: nextGroup,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': group.updatedAt,
          },
        },
        {
          kind: 'put',
          tableName: this.config.dynamodbGroupsTableName,
          item: nextInviteLink,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND disabledAt = :expectedDisabledAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': inviteLink.updatedAt,
            ':expectedDisabledAt': inviteLink.disabledAt,
          },
        },
        {
          kind: 'put',
          tableName: this.config.dynamodbGroupsTableName,
          item: auditRecord,
          conditionExpression:
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Invite link changed. Please retry.');
      }

      throw error;
    }

    await this.emitGroupLifecycleSystemMessage(
      actor,
      group.groupId,
      `${actor.fullName} joined the group via invite link.`,
    );

    return toMembership(membership);
  }

  async addMember(
    actor: AuthenticatedUser,
    groupId: string,
    payload: unknown,
  ): Promise<GroupMembership> {
    const body = ensureObject(payload);
    const userId = requiredString(body, 'userId', {
      minLength: 5,
      maxLength: 50,
    });
    const roleInGroup =
      normalizeGroupMemberRole(
        optionalEnum(body, 'roleInGroup', GROUP_MEMBER_ROLE_INPUTS),
      ) ?? undefined;
    const { group, actorMembership } = await this.getManageGroupContext(
      actor,
      groupId,
    );

    return this.addMemberInternal(
      actor,
      group,
      actorMembership,
      userId,
      roleInGroup,
    );
  }

  async updateMemberRole(
    actor: AuthenticatedUser,
    groupId: string,
    userId: string,
    payload: unknown,
  ): Promise<GroupMembership> {
    const body = ensureObject(payload);
    const roleInGroup =
      normalizeGroupMemberRole(
        requiredEnum(body, 'roleInGroup', GROUP_MEMBER_ROLES),
      ) ?? undefined;
    const { group, actorMembership } = await this.getManageGroupContext(
      actor,
      groupId,
    );

    return this.updateMemberRoleInternal(
      actor,
      group,
      actorMembership,
      userId,
      roleInGroup,
    );
  }

  async removeMember(
    actor: AuthenticatedUser,
    groupId: string,
    userId: string,
  ): Promise<GroupMembership> {
    const { group, actorMembership } = await this.getManageGroupContext(
      actor,
      groupId,
    );

    return this.removeMemberInternal(actor, group, actorMembership, userId);
  }

  async manageMember(
    actor: AuthenticatedUser,
    groupId: string,
    userId: string,
    payload: unknown,
  ): Promise<GroupMembership> {
    const body = ensureObject(payload);
    const action = requiredString(body, 'action', {
      minLength: 3,
      maxLength: 20,
    });
    const roleInGroup =
      normalizeGroupMemberRole(
        optionalEnum(body, 'roleInGroup', GROUP_MEMBER_ROLE_INPUTS),
      ) ?? undefined;
    const { group, actorMembership } = await this.getManageGroupContext(
      actor,
      groupId,
    );

    if (action === 'add') {
      return this.addMemberInternal(
        actor,
        group,
        actorMembership,
        userId,
        roleInGroup,
      );
    }

    if (action === 'update') {
      return this.updateMemberRoleInternal(
        actor,
        group,
        actorMembership,
        userId,
        roleInGroup,
      );
    }

    if (action === 'remove') {
      return this.removeMemberInternal(actor, group, actorMembership, userId);
    }

    throw new BadRequestException('Unsupported action.');
  }

  private async getManageGroupContext(
    actor: AuthenticatedUser,
    groupId: string,
  ): Promise<{
    group: StoredGroup;
    actorMembership?: StoredMembership;
  }> {
    const group = await this.getGroupOrThrow(groupId);
    const actorMembership = await this.getMembership(groupId, actor.id);

    if (
      !this.authorizationService.canManageGroup(
        actor,
        group,
        this.getMembershipRole(actorMembership),
      )
    ) {
      throw new ForbiddenException('You cannot manage members of this group.');
    }

    return { group, actorMembership };
  }

  private async addMemberInternal(
    actor: AuthenticatedUser,
    group: StoredGroup,
    _actorMembership: StoredMembership | undefined,
    userId: string,
    roleInGroup?: GroupMemberRole,
  ): Promise<GroupMembership> {
    const existingMembership = await this.getMembership(group.groupId, userId);
    const activeBan = await this.getActiveBan(group.groupId, userId);
    const targetUser = await this.usersService.getActiveByIdOrThrow(userId);

    if (activeBan) {
      throw new ForbiddenException('This user is banned from the group.');
    }

    if (
      actor.role === 'CITIZEN' &&
      userId !== actor.id &&
      !(await this.usersService.areFriends(actor.id, userId))
    ) {
      throw new ForbiddenException(
        'Citizens can only add their friends to groups.',
      );
    }

    if (existingMembership && !existingMembership.deletedAt) {
      throw new BadRequestException('Membership already exists.');
    }

    if (roleInGroup === 'OWNER') {
      throw new ForbiddenException(
        'Owner role cannot be assigned via member management.',
      );
    }

    const now = nowIso();
    const existingRoleInGroup =
      typeof existingMembership?.roleInGroup === 'string'
        ? normalizeGroupMemberRole(existingMembership.roleInGroup)
        : undefined;
    const membership: StoredMembership = {
      PK: makeGroupPk(group.groupId),
      SK: makeMembershipSk(userId),
      entityType: 'GROUP_MEMBERSHIP',
      GSI1PK: makeUserGroupsKey(userId),
      GSI1SK: makeUserGroupsSk(group.groupId, now),
      groupId: group.groupId,
      userId,
      roleInGroup: roleInGroup ?? existingRoleInGroup ?? 'MEMBER',
      joinedAt: existingMembership?.joinedAt ?? now,
      deletedAt: null,
      updatedAt: now,
    };

    const nextGroup: StoredGroup = {
      ...group,
      memberCount: group.memberCount + 1,
      updatedAt: now,
    };
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_MEMBER_ADDED',
      actorUserId: actor.id,
      groupId: group.groupId,
      targetUserId: userId,
      summary: `${actor.fullName} added a member to the group.`,
      metadata: {
        roleInGroup: membership.roleInGroup,
      },
    });

    await this.writeGroupMembershipTransaction({
      group,
      nextGroup,
      membership,
      membershipConditionExpression: existingMembership
        ? 'attribute_exists(PK) AND attribute_exists(SK) AND deletedAt = :expectedDeletedAt'
        : 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      membershipExpressionAttributeValues: existingMembership
        ? {
            ':expectedDeletedAt': existingMembership.deletedAt,
          }
        : undefined,
      auditRecord,
    });

    await this.emitGroupLifecycleSystemMessage(
      actor,
      group.groupId,
      `${actor.fullName} added ${this.getUserDisplayName(targetUser, userId)} to the group.`,
    );

    return toMembership(membership);
  }

  private async updateMemberRoleInternal(
    actor: AuthenticatedUser,
    group: StoredGroup,
    _actorMembership: StoredMembership | undefined,
    userId: string,
    roleInGroup?: GroupMemberRole,
  ): Promise<GroupMembership> {
    const existingMembership = await this.getMembership(group.groupId, userId);

    const targetUser = await this.usersService.getActiveByIdOrThrow(userId);
    if (!existingMembership || existingMembership.deletedAt) {
      throw new NotFoundException('Membership not found.');
    }

    if (!roleInGroup) {
      throw new BadRequestException(
        'roleInGroup is required for update action.',
      );
    }

    if (roleInGroup === 'OWNER') {
      throw new ForbiddenException(
        'Owner role cannot be assigned via member management.',
      );
    }

    if (existingMembership.roleInGroup === 'OWNER') {
      throw new BadRequestException(
        'Owner role cannot be changed via member management.',
      );
    }

    const nextMembership: StoredMembership = {
      ...existingMembership,
      roleInGroup,
      updatedAt: nowIso(),
    };
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_ROLE_UPDATED',
      actorUserId: actor.id,
      groupId: group.groupId,
      targetUserId: userId,
      summary: `${actor.fullName} updated a member role.`,
      metadata: {
        roleInGroup,
      },
    });

    await this.writeGroupMembershipTransaction({
      group,
      membership: nextMembership,
      membershipConditionExpression:
        'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
      membershipExpressionAttributeValues: {
        ':expectedUpdatedAt': existingMembership.updatedAt,
        ':expectedDeletedAt': null,
      },
      auditRecord,
    });

    await this.emitGroupLifecycleSystemMessage(
      actor,
      group.groupId,
      `${actor.fullName} changed ${this.getUserDisplayName(targetUser, userId)}'s role to ${roleInGroup}.`,
    );

    return toMembership(nextMembership);
  }

  private async removeMemberInternal(
    actor: AuthenticatedUser,
    group: StoredGroup,
    _actorMembership: StoredMembership | undefined,
    userId: string,
  ): Promise<GroupMembership> {
    const existingMembership = await this.getMembership(group.groupId, userId);

    const targetUser = await this.usersService.getByIdOrThrow(userId);
    if (!existingMembership || existingMembership.deletedAt) {
      throw new NotFoundException('Membership not found.');
    }

    if (existingMembership.roleInGroup === 'OWNER') {
      throw new BadRequestException('Owner cannot be removed directly.');
    }

    const nextMembership: StoredMembership = {
      ...existingMembership,
      deletedAt: nowIso(),
      updatedAt: nowIso(),
    };
    const auditRecord = this.auditTrailService.buildGroupEvent({
      action: 'GROUP_MEMBER_REMOVED',
      actorUserId: actor.id,
      groupId: group.groupId,
      targetUserId: userId,
      summary: `${actor.fullName} removed a member from the group.`,
    });

    const nextGroup: StoredGroup = {
      ...group,
      memberCount: Math.max(group.memberCount - 1, 0),
      updatedAt: nextMembership.updatedAt,
    };

    await this.writeGroupMembershipTransaction({
      group,
      nextGroup,
      membership: nextMembership,
      membershipConditionExpression:
        'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
      membershipExpressionAttributeValues: {
        ':expectedUpdatedAt': existingMembership.updatedAt,
        ':expectedDeletedAt': null,
      },
      auditRecord,
    });
    await this.removeGroupConversationAccess(
      userId,
      group.groupId,
      nextMembership.updatedAt,
    );

    await this.emitGroupLifecycleSystemMessage(
      actor,
      group.groupId,
      `${actor.fullName} removed ${this.getUserDisplayName(targetUser, userId)} from the group.`,
    );

    return toMembership(nextMembership);
  }

  private async emitGroupLifecycleSystemMessage(
    actor: AuthenticatedUser,
    groupId: string,
    content: string,
  ): Promise<void> {
    try {
      const participantIds = (await this.queryGroupMemberships(groupId))
        .filter((membership) => !membership.deletedAt)
        .map((membership) => membership.userId);

      if (participantIds.length === 0) {
        return;
      }

      await this.conversationsService.sendGroupSystemMessage(
        actor,
        groupId,
        participantIds,
        content,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.logger.warn(
        `Failed to persist group lifecycle system message for group ${groupId}: ${message}`,
      );
    }
  }

  private getUserDisplayName(user: unknown, fallbackUserId: string): string {
    if (
      user &&
      typeof user === 'object' &&
      'fullName' in user &&
      typeof user.fullName === 'string'
    ) {
      const trimmedName = user.fullName.trim();
      if (trimmedName.length > 0) {
        return trimmedName;
      }
    }

    return fallbackUserId;
  }

  private async resolveUserDisplayName(userId: string): Promise<string> {
    try {
      return this.getUserDisplayName(
        await this.usersService.getByIdOrThrow(userId),
        userId,
      );
    } catch {
      return userId;
    }
  }

  private describeMessagePolicy(policy: GroupMessagePolicy): string {
    switch (policy) {
      case 'OWNER_ONLY':
        return 'Owner only';
      case 'OWNER_AND_DEPUTIES':
        return 'Owner and Deputies only';
      case 'ALL_MEMBERS':
      default:
        return 'All members';
    }
  }

  private async writeGroupMembershipTransaction(input: {
    group: StoredGroup;
    nextGroup?: StoredGroup;
    membership: StoredMembership;
    membershipConditionExpression: string;
    membershipExpressionAttributeValues?: Record<string, unknown>;
    auditRecord?: StoredGroupAuditEvent;
  }): Promise<void> {
    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [
      {
        kind: 'put',
        tableName: this.config.dynamodbMembershipsTableName,
        item: input.membership,
        conditionExpression: input.membershipConditionExpression,
        expressionAttributeValues: input.membershipExpressionAttributeValues,
      },
    ];

    if (input.nextGroup) {
      transactionItems.push({
        kind: 'put',
        tableName: this.config.dynamodbGroupsTableName,
        item: input.nextGroup,
        conditionExpression:
          'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
        expressionAttributeValues: {
          ':expectedUpdatedAt': input.group.updatedAt,
        },
      });
    }

    if (input.auditRecord) {
      transactionItems.push({
        kind: 'put',
        tableName: this.config.dynamodbGroupsTableName,
        item: input.auditRecord,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      });
    }

    try {
      await this.repository.transactWrite(transactionItems);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Group membership changed. Please retry.');
      }

      throw error;
    }
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

  async getMembership(
    groupId: string,
    userId: string,
  ): Promise<StoredMembership | undefined> {
    return this.repository.get<StoredMembership>(
      this.config.dynamodbMembershipsTableName,
      makeGroupPk(groupId),
      makeMembershipSk(userId),
    );
  }

  private getMembershipRole(
    membership?: StoredMembership,
  ): GroupMemberRole | undefined {
    const roleInGroup =
      typeof membership?.roleInGroup === 'string'
        ? membership.roleInGroup
        : undefined;

    return normalizeGroupMemberRole(roleInGroup);
  }

  private async getGroupOrThrow(groupId: string): Promise<StoredGroup> {
    const group = await this.repository.get<StoredGroup>(
      this.config.dynamodbGroupsTableName,
      makeGroupPk(groupId),
      makeGroupMetadataSk(),
    );

    if (!group || group.deletedAt) {
      throw new NotFoundException('Group not found.');
    }

    return group;
  }

  private async getMembershipsForUser(
    userId: string,
  ): Promise<StoredMembership[]> {
    const items = await this.repository.queryByGsi1<{ PK: string; SK: string }>(
      this.config.dynamodbMembershipsTableName,
      this.config.dynamodbMembershipsUserGroupsIndexName,
      makeUserGroupsKey(userId),
    );
    const memberships = await this.repository.batchGet<StoredMembership>(
      this.config.dynamodbMembershipsTableName,
      items,
    );

    return memberships.filter((membership) => !membership.deletedAt);
  }

  private async getGroupsFromMemberships(
    memberships: StoredMembership[],
  ): Promise<StoredGroup[]> {
    return this.repository.batchGet<StoredGroup>(
      this.config.dynamodbGroupsTableName,
      memberships.map((membership) => ({
        PK: makeGroupPk(membership.groupId),
        SK: makeGroupMetadataSk(),
      })),
    );
  }

  private async queryGroupMemberships(
    groupId: string,
  ): Promise<StoredMembership[]> {
    return this.repository.queryByPk<StoredMembership>(
      this.config.dynamodbMembershipsTableName,
      makeGroupPk(groupId),
      {
        beginsWith: 'MEMBER#',
      },
    );
  }

  private async queryGroupBans(groupId: string): Promise<StoredGroupBan[]> {
    return this.repository.queryByPk<StoredGroupBan>(
      this.config.dynamodbMembershipsTableName,
      makeGroupPk(groupId),
      {
        beginsWith: 'BAN#',
      },
    );
  }

  private async queryGroupInviteLinks(
    groupId: string,
  ): Promise<StoredGroupInviteLink[]> {
    return this.repository.queryByPk<StoredGroupInviteLink>(
      this.config.dynamodbGroupsTableName,
      makeGroupPk(groupId),
      {
        beginsWith: 'INVITE#',
      },
    );
  }

  private async getInviteLink(
    groupId: string,
    inviteId: string,
  ): Promise<StoredGroupInviteLink | undefined> {
    return this.repository.get<StoredGroupInviteLink>(
      this.config.dynamodbGroupsTableName,
      makeGroupPk(groupId),
      makeGroupInviteLinkSk(inviteId),
    );
  }

  private async getInviteCodeLookup(
    code: string,
  ): Promise<StoredGroupInviteCodeLookup | undefined> {
    return this.repository.get<StoredGroupInviteCodeLookup>(
      this.config.dynamodbGroupsTableName,
      makeGroupInviteCodeLookupPk(code),
      makeGroupInviteCodeLookupSk(),
    );
  }

  async getActiveBan(
    groupId: string,
    userId: string,
  ): Promise<StoredGroupBan | undefined> {
    const ban = await this.repository.get<StoredGroupBan>(
      this.config.dynamodbMembershipsTableName,
      makeGroupPk(groupId),
      makeGroupBanSk(userId),
    );

    return this.isBanActive(ban) ? ban : undefined;
  }

  private isBanActive(ban?: StoredGroupBan): ban is StoredGroupBan {
    if (!ban) {
      return false;
    }

    if (ban.expiresAt && ban.expiresAt <= nowIso()) {
      return false;
    }

    return true;
  }

  private parseBanExpiresAt(expiresAt?: string): string | null {
    if (!expiresAt) {
      return null;
    }

    const parsed = Date.parse(expiresAt);

    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('expiresAt must be a valid ISO timestamp.');
    }

    const normalized = new Date(parsed).toISOString();

    if (normalized <= nowIso()) {
      throw new BadRequestException('expiresAt must be in the future.');
    }

    return normalized;
  }

  private parseInviteExpiresAt(expiresAt?: string): string | null {
    if (!expiresAt) {
      return null;
    }

    const parsed = Date.parse(expiresAt);

    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('expiresAt must be a valid ISO timestamp.');
    }

    const normalized = new Date(parsed).toISOString();

    if (normalized <= nowIso()) {
      throw new BadRequestException('expiresAt must be in the future.');
    }

    return normalized;
  }

  private parseInviteMaxUses(maxUses: unknown): number | null {
    if (maxUses === undefined || maxUses === null) {
      return null;
    }

    if (
      typeof maxUses !== 'number' ||
      !Number.isInteger(maxUses) ||
      maxUses < 1 ||
      maxUses > 1000
    ) {
      throw new BadRequestException(
        'maxUses must be an integer between 1 and 1000.',
      );
    }

    return maxUses;
  }

  private async syncGroupConversationNames(
    groupId: string,
    groupName: string,
    occurredAt: string,
  ): Promise<void> {
    const conversationKey = `GRP#${groupId}`;
    const eventId = createUlid();
    const activeMemberships = (
      await this.queryGroupMemberships(groupId)
    ).filter((membership) => !membership.deletedAt);

    for (const membership of activeMemberships) {
      const summaries = await this.repository.queryByPk<StoredConversation>(
        this.config.dynamodbConversationsTableName,
        makeInboxPk(membership.userId),
        {
          beginsWith: `CONV#${conversationKey}#LAST#`,
          limit: 1,
          scanForward: false,
        },
      );
      const existingConversation = summaries.find(
        (summary) =>
          summary.entityType === 'CONVERSATION' && !summary.deletedAt,
      );

      if (
        !existingConversation ||
        existingConversation.groupName === groupName
      ) {
        continue;
      }

      const nextConversation: StoredConversation = {
        ...existingConversation,
        groupName,
      };

      await this.repository.put(
        this.config.dynamodbConversationsTableName,
        nextConversation,
      );

      const payload: ChatConversationUpdatedEvent = {
        eventId,
        conversationId: `group:${groupId}`,
        conversationKey,
        summary: {
          ...toConversationSummary(nextConversation),
          conversationId: `group:${groupId}`,
        },
        reason: 'conversation.metadata.updated',
        occurredAt,
      };

      this.chatRealtimeService.emitToUser(
        membership.userId,
        CHAT_SOCKET_EVENTS.CONVERSATION_UPDATED,
        payload,
      );
    }
  }

  private async removeGroupConversationAccess(
    userId: string,
    groupId: string,
    removedAt: string,
  ): Promise<void> {
    const conversationId = `GRP#${groupId}`;
    const summaries = await this.repository.queryByPk<StoredConversation>(
      this.config.dynamodbConversationsTableName,
      makeInboxPk(userId),
      {
        beginsWith: `CONV#${conversationId}#LAST#`,
      },
    );

    for (const summary of summaries) {
      if (summary.entityType !== 'CONVERSATION') {
        continue;
      }

      await this.repository.delete(
        this.config.dynamodbConversationsTableName,
        summary.PK,
        summary.SK,
      );
    }

    this.chatRealtimeService.leaveConversationForUser(userId, conversationId);
    this.chatRealtimeService.emitToUser(
      userId,
      CHAT_SOCKET_EVENTS.CONVERSATION_REMOVED,
      {
        eventId: createUlid(),
        conversationId: `group:${groupId}`,
        conversationKey: conversationId,
        reason: 'conversation.deleted',
        occurredAt: removedAt,
      },
    );
  }
}
