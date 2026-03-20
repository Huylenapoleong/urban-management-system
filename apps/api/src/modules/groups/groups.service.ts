import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GROUP_MEMBER_ROLES,
  GROUP_TYPES,
  type GroupMemberRole,
  type GroupType,
} from '@urban/shared-constants';
import type {
  ApiResponseMeta,
  ApiSuccessResponse,
  AuthenticatedUser,
  GroupMembership,
  GroupMetadata,
} from '@urban/shared-types';
import {
  createUlid,
  makeGroupMetadataSk,
  makeGroupPk,
  makeGroupTypeLocationKey,
  makeMembershipSk,
  makeUserGroupsKey,
  makeUserGroupsSk,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import {
  buildPaginatedResponse,
  paginateSortedItems,
} from '../../common/pagination';
import { toGroupMetadata, toMembership } from '../../common/mappers';
import type {
  StoredGroup,
  StoredMembership,
} from '../../common/storage-records';
import {
  ensureLocationCode,
  ensureObject,
  optionalBoolean,
  optionalEnum,
  optionalQueryString,
  optionalString,
  parseBooleanQuery,
  parseLimit,
  requiredEnum,
  requiredString,
} from '../../common/validation';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
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
    const group: StoredGroup = {
      PK: makeGroupPk(groupId),
      SK: makeGroupMetadataSk(),
      entityType: 'GROUP_METADATA',
      GSI1PK: makeGroupTypeLocationKey(groupType, locationCode),
      groupId,
      groupName,
      groupType,
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
    ]);

    return toGroupMetadata(group);
  }

  async listGroups(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<GroupMetadata[], ApiResponseMeta>> {
    const mine = parseBooleanQuery(query.mine, 'mine') ?? false;
    const groupType = optionalQueryString(query.groupType, 'groupType');
    const locationCode = optionalQueryString(
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
    } else if (groupType && locationCode) {
      const items = await this.repository.queryByIndex<{
        PK: string;
        SK: string;
      }>(
        this.config.dynamodbGroupsTableName,
        this.config.dynamodbGroupsTypeLocationIndexName,
        'GSI1PK',
        'createdAt',
        makeGroupTypeLocationKey(
          groupType as (typeof GROUP_TYPES)[number],
          locationCode,
        ),
      );
      groups = await this.repository.batchGet<StoredGroup>(
        this.config.dynamodbGroupsTableName,
        items,
      );
    } else {
      groups = await this.repository.scanAll<StoredGroup>(
        this.config.dynamodbGroupsTableName,
      );
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

    if (
      !this.authorizationService.canManageGroup(
        actor,
        group,
        this.getMembershipRole(membership),
      )
    ) {
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
    const nextLocationCode = locationCodeInput
      ? ensureLocationCode(locationCodeInput)
      : group.locationCode;
    const nextGroupType: GroupType = groupType ?? group.groupType;
    const nextIsOfficial = isOfficial ?? group.isOfficial;

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
      locationCode: nextLocationCode,
      isOfficial: nextIsOfficial,
      updatedAt: nowIso(),
    };

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
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('Group changed. Please retry.');
      }

      throw error;
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

    if (existingMembership && !existingMembership.deletedAt) {
      return toMembership(existingMembership);
    }

    if (!this.authorizationService.canJoinGroup(actor, group)) {
      throw new ForbiddenException('You cannot join this group.');
    }

    const now = nowIso();
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
    });

    return toMembership(membership);
  }

  async leaveGroup(
    actor: AuthenticatedUser,
    groupId: string,
  ): Promise<GroupMembership> {
    const group = await this.getGroupOrThrow(groupId);
    const membership = await this.getMembership(groupId, actor.id);

    if (!membership || membership.deletedAt) {
      throw new NotFoundException('Membership not found.');
    }

    if (membership.roleInGroup === 'OWNER') {
      throw new BadRequestException('Owner cannot leave the group directly.');
    }

    const nextMembership: StoredMembership = {
      ...membership,
      deletedAt: nowIso(),
      updatedAt: nowIso(),
    };

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
    });

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
    const roleInGroup = optionalEnum(body, 'roleInGroup', GROUP_MEMBER_ROLES);
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

    const existingMembership = await this.getMembership(groupId, userId);

    if (action === 'add') {
      await this.usersService.getActiveByIdOrThrow(userId);
      if (existingMembership && !existingMembership.deletedAt) {
        throw new BadRequestException('Membership already exists.');
      }

      if (roleInGroup === 'OWNER') {
        throw new ForbiddenException(
          'Owner role cannot be assigned via member management.',
        );
      }

      const now = nowIso();
      const membership: StoredMembership = {
        PK: makeGroupPk(groupId),
        SK: makeMembershipSk(userId),
        entityType: 'GROUP_MEMBERSHIP',
        GSI1PK: makeUserGroupsKey(userId),
        GSI1SK: makeUserGroupsSk(groupId, now),
        groupId,
        userId,
        roleInGroup: roleInGroup ?? existingMembership?.roleInGroup ?? 'MEMBER',
        joinedAt: existingMembership?.joinedAt ?? now,
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
      });
      return toMembership(membership);
    }

    if (!existingMembership || existingMembership.deletedAt) {
      throw new NotFoundException('Membership not found.');
    }

    if (action === 'update') {
      await this.usersService.getActiveByIdOrThrow(userId);
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

      await this.writeGroupMembershipTransaction({
        group,
        membership: nextMembership,
        membershipConditionExpression:
          'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt AND deletedAt = :expectedDeletedAt',
        membershipExpressionAttributeValues: {
          ':expectedUpdatedAt': existingMembership.updatedAt,
          ':expectedDeletedAt': null,
        },
      });
      return toMembership(nextMembership);
    }

    if (action === 'remove') {
      await this.usersService.getByIdOrThrow(userId);
      if (existingMembership.roleInGroup === 'OWNER') {
        throw new BadRequestException('Owner cannot be removed directly.');
      }

      const nextMembership: StoredMembership = {
        ...existingMembership,
        deletedAt: nowIso(),
        updatedAt: nowIso(),
      };

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
      });
      return toMembership(nextMembership);
    }

    throw new BadRequestException('Unsupported action.');
  }
  private async writeGroupMembershipTransaction(input: {
    group: StoredGroup;
    nextGroup?: StoredGroup;
    membership: StoredMembership;
    membershipConditionExpression: string;
    membershipExpressionAttributeValues?: Record<string, unknown>;
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
    if (membership?.roleInGroup === 'OWNER') {
      return 'OWNER';
    }

    if (membership?.roleInGroup === 'OFFICER') {
      return 'OFFICER';
    }

    if (membership?.roleInGroup === 'MEMBER') {
      return 'MEMBER';
    }

    return undefined;
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
}
