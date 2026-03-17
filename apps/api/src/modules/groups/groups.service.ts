import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GROUP_MEMBER_ROLES, GROUP_TYPES } from '@urban/shared-constants';
import type {
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
import { UsersService } from '../users/users.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly usersService: UsersService,
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

    await this.repository.put(this.config.dynamodbGroupsTableName, group);
    await this.repository.put(
      this.config.dynamodbMembershipsTableName,
      ownerMembership,
    );

    return toGroupMetadata(group);
  }

  async listGroups(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<GroupMetadata[]> {
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
        { limit },
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

    return groups
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
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map(toGroupMetadata);
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
        membership?.roleInGroup,
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
    const nextGroupType = groupType ?? group.groupType;
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

    await this.repository.put(this.config.dynamodbGroupsTableName, nextGroup);
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

    await this.repository.put(
      this.config.dynamodbMembershipsTableName,
      membership,
    );
    await this.syncMemberCount(group);

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

    await this.repository.put(
      this.config.dynamodbMembershipsTableName,
      nextMembership,
    );
    await this.syncMemberCount(group);

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
        actorMembership?.roleInGroup,
      )
    ) {
      throw new ForbiddenException('You cannot manage members of this group.');
    }

    await this.usersService.getByIdOrThrow(userId);

    if (action === 'add') {
      const now = nowIso();
      const membership: StoredMembership = {
        PK: makeGroupPk(groupId),
        SK: makeMembershipSk(userId),
        entityType: 'GROUP_MEMBERSHIP',
        GSI1PK: makeUserGroupsKey(userId),
        GSI1SK: makeUserGroupsSk(groupId, now),
        groupId,
        userId,
        roleInGroup: roleInGroup ?? 'MEMBER',
        joinedAt: now,
        deletedAt: null,
        updatedAt: now,
      };

      await this.repository.put(
        this.config.dynamodbMembershipsTableName,
        membership,
      );
      await this.syncMemberCount(group);
      return toMembership(membership);
    }

    const existingMembership = await this.getMembership(groupId, userId);

    if (!existingMembership || existingMembership.deletedAt) {
      throw new NotFoundException('Membership not found.');
    }

    if (action === 'update') {
      if (!roleInGroup) {
        throw new BadRequestException(
          'roleInGroup is required for update action.',
        );
      }

      const nextMembership: StoredMembership = {
        ...existingMembership,
        roleInGroup,
        updatedAt: nowIso(),
      };

      await this.repository.put(
        this.config.dynamodbMembershipsTableName,
        nextMembership,
      );
      return toMembership(nextMembership);
    }

    if (action === 'remove') {
      if (existingMembership.roleInGroup === 'OWNER') {
        throw new BadRequestException('Owner cannot be removed directly.');
      }

      const nextMembership: StoredMembership = {
        ...existingMembership,
        deletedAt: nowIso(),
        updatedAt: nowIso(),
      };

      await this.repository.put(
        this.config.dynamodbMembershipsTableName,
        nextMembership,
      );
      await this.syncMemberCount(group);
      return toMembership(nextMembership);
    }

    throw new BadRequestException('Unsupported action.');
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

  private async syncMemberCount(group: StoredGroup): Promise<void> {
    const activeMembers = (
      await this.queryGroupMemberships(group.groupId)
    ).filter((membership) => !membership.deletedAt);
    const nextGroup: StoredGroup = {
      ...group,
      memberCount: activeMembers.length,
      updatedAt: nowIso(),
    };

    await this.repository.put(this.config.dynamodbGroupsTableName, nextGroup);
  }
}
