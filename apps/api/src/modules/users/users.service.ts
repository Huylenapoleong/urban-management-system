import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { USER_ROLES, USER_STATUSES } from '@urban/shared-constants';
import type {
  ApiResponseMeta,
  ApiSuccessResponse,
  AuthenticatedUser,
  ChatConversationUpdatedEvent,
  MediaAsset,
  PushDevice,
  UserContactAlias,
  UserBlockedItem,
  UserDirectoryItem,
  UserFriendItem,
  UserFriendRequestItem,
  UserProfile,
} from '@urban/shared-types';
import {
  createUlid,
  makeConversationSummarySk,
  makeDmConversationId,
  makeInboxPk,
  makeInboxStatsKey,
  makeUserContactAliasSk,
  makeUserPk,
  makeUserProfileSk,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import {
  buildPaginatedResponse,
  paginateSortedItems,
} from '../../common/pagination';
import {
  toConversationSummary,
  toUserFriendItem,
  toUserFriendRequestItem,
  toUserBlockedItem,
  toUserProfile,
} from '../../common/mappers';
import type {
  StoredConversation,
  StoredUserBlockEdge,
  StoredUserContactAlias,
  StoredUserFriendEdge,
  StoredUserFriendRequest,
  StoredDirectMessageRequest,
  StoredUser,
  StoredUserIdentityClaim,
} from '../../common/storage-records';
import {
  ensureLocationCode,
  ensureObject,
  optionalQueryString,
  parseLocationCodeQuery,
  optionalString,
  parseLimit,
  requirePhoneOrEmail,
  requiredEnum,
  requiredString,
} from '../../common/validation';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { ChatPresenceService } from '../../infrastructure/realtime/chat-presence.service';
import { MediaAssetService } from '../../infrastructure/storage/media-asset.service';
import { ChatRealtimeService } from '../../modules/conversations/chat-realtime.service';
import {
  PasswordPolicyService,
  type PasswordPolicyProfile,
} from '../../infrastructure/security/password-policy.service';
import { PasswordService } from '../../infrastructure/security/password.service';
import { RefreshSessionService } from '../../infrastructure/security/refresh-session.service';
import { PushNotificationService } from '../../infrastructure/notifications/push-notification.service';
import { ObservabilityService } from '../../infrastructure/observability/observability.service';

interface PreparedCitizenRegistrationInput {
  phone?: string;
  email?: string;
  passwordHash: string;
  fullName: string;
  locationCode: string;
  avatarUrl?: string;
}

const FRIEND_REQUEST_DIRECTIONS = ['INCOMING', 'OUTGOING'] as const;
type FriendRequestDirection = (typeof FRIEND_REQUEST_DIRECTIONS)[number];
const USER_DISCOVERY_MODES = ['all', 'chat', 'friend'] as const;
type UserDiscoveryMode = (typeof USER_DISCOVERY_MODES)[number];

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly passwordService: PasswordService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly authorizationService: AuthorizationService,
    private readonly chatPresenceService: ChatPresenceService,
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly refreshSessionService: RefreshSessionService,
    private readonly mediaAssetService: MediaAssetService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly observabilityService: ObservabilityService,
    private readonly config: AppConfigService,
  ) {}

  async findById(userId: string): Promise<StoredUser | undefined> {
    return this.repository.get<StoredUser>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      makeUserProfileSk(),
    );
  }

  async getByIdOrThrow(userId: string): Promise<StoredUser> {
    const user = await this.findById(userId);

    if (!user || user.deletedAt || user.status === 'DELETED') {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  async getActiveByIdOrThrow(userId: string): Promise<StoredUser> {
    const user = await this.getByIdOrThrow(userId);

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('User account is not active.');
    }

    return user;
  }

  async findByPhone(phone: string): Promise<StoredUser | undefined> {
    const claimedUser = await this.findByIdentityClaim('PHONE', phone);
    if (claimedUser) {
      return claimedUser;
    }

    const items = await this.repository.queryByIndex<{
      PK: string;
      SK: string;
    }>(
      this.config.dynamodbUsersTableName,
      this.config.dynamodbUsersPhoneIndexName,
      'phone',
      'GSI1SK',
      phone,
      { limit: 1, scanForward: true },
    );

    return this.hydrateFirst(items);
  }

  async findByEmail(email: string): Promise<StoredUser | undefined> {
    const claimedUser = await this.findByIdentityClaim('EMAIL', email);
    if (claimedUser) {
      return claimedUser;
    }

    const items = await this.repository.queryByIndex<{
      PK: string;
      SK: string;
    }>(
      this.config.dynamodbUsersTableName,
      this.config.dynamodbUsersEmailIndexName,
      'email',
      'GSI1SK',
      email,
      { limit: 1, scanForward: true },
    );

    return this.hydrateFirst(items);
  }

  async registerCitizen(payload: unknown): Promise<UserProfile> {
    const body = ensureObject(payload);
    const identity = requirePhoneOrEmail(body);
    const password = requiredString(body, 'password', {
      minLength: 10,
      maxLength: 100,
    });
    const fullName = requiredString(body, 'fullName', {
      minLength: 2,
      maxLength: 100,
    });
    const locationCode = ensureLocationCode(
      requiredString(body, 'locationCode'),
    );
    const avatarUrl = optionalString(body, 'avatarUrl', { maxLength: 500 });
    this.passwordPolicyService.validateOrThrow(
      password,
      {
        phone: identity.phone,
        email: identity.email,
        fullName,
      },
      'standard',
    );
    const passwordHash = await this.passwordService.hashPassword(password);

    return this.registerCitizenWithPreparedInput({
      phone: identity.phone,
      email: identity.email,
      passwordHash,
      fullName,
      locationCode,
      avatarUrl,
    });
  }

  async registerCitizenWithPreparedInput(
    input: PreparedCitizenRegistrationInput,
  ): Promise<UserProfile> {
    const locationCode = ensureLocationCode(input.locationCode);

    const now = nowIso();
    const userId = createUlid();
    const user: StoredUser = {
      PK: makeUserPk(userId),
      SK: makeUserProfileSk(),
      entityType: 'USER_PROFILE',
      GSI1SK: 'USER',
      userId,
      phone: input.phone,
      email: input.email,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      role: 'CITIZEN',
      locationCode,
      unit: undefined,
      avatarUrl: input.avatarUrl,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.assertUniqueIdentity(user.phone, user.email);
    await this.persistUserWithIdentityClaims({
      nextUser: user,
    });
    return this.serializeUserProfile(user);
  }

  async updatePassword(
    userId: string,
    passwordHash: string,
  ): Promise<StoredUser> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const current = await this.getByIdOrThrow(userId);
      const nextUser: StoredUser = {
        ...current,
        passwordHash,
        updatedAt: nowIso(),
      };

      try {
        await this.repository.transactPut([
          {
            tableName: this.config.dynamodbUsersTableName,
            item: nextUser,
            conditionExpression:
              'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
            expressionAttributeValues: {
              ':expectedUpdatedAt': current.updatedAt,
            },
          },
        ]);
        return nextUser;
      } catch (error) {
        if (!this.isConditionalWriteConflict(error)) {
          throw error;
        }

        if (attempt === maxAttempts - 1) {
          throw new ConflictException(
            'User profile was changed by another request. Please retry.',
          );
        }
      }
    }

    throw new ConflictException(
      'User profile was changed by another request. Please retry.',
    );
  }

  async deactivateOwnAccount(userId: string): Promise<StoredUser> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const current = await this.getByIdOrThrow(userId);

      if (current.status === 'DEACTIVATED') {
        return current;
      }

      if (current.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Only active accounts can be deactivated.',
        );
      }

      const nextUser: StoredUser = {
        ...current,
        status: 'DEACTIVATED',
        deletedAt: null,
        updatedAt: nowIso(),
      };

      try {
        await this.repository.transactPut([
          {
            tableName: this.config.dynamodbUsersTableName,
            item: nextUser,
            conditionExpression:
              'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
            expressionAttributeValues: {
              ':expectedUpdatedAt': current.updatedAt,
            },
          },
        ]);
        return nextUser;
      } catch (error) {
        if (!this.isConditionalWriteConflict(error)) {
          throw error;
        }

        if (attempt === maxAttempts - 1) {
          throw new ConflictException(
            'User profile was changed by another request. Please retry.',
          );
        }
      }
    }

    throw new ConflictException(
      'User profile was changed by another request. Please retry.',
    );
  }

  async reactivateOwnAccount(userId: string): Promise<StoredUser> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const current = await this.getByIdOrThrow(userId);

      if (current.status === 'ACTIVE') {
        return current;
      }

      if (current.status !== 'DEACTIVATED') {
        throw new BadRequestException(
          'Only deactivated accounts can be reactivated.',
        );
      }

      const nextUser: StoredUser = {
        ...current,
        status: 'ACTIVE',
        deletedAt: null,
        updatedAt: nowIso(),
      };

      try {
        await this.repository.transactPut([
          {
            tableName: this.config.dynamodbUsersTableName,
            item: nextUser,
            conditionExpression:
              'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
            expressionAttributeValues: {
              ':expectedUpdatedAt': current.updatedAt,
            },
          },
        ]);
        return nextUser;
      } catch (error) {
        if (!this.isConditionalWriteConflict(error)) {
          throw error;
        }

        if (attempt === maxAttempts - 1) {
          throw new ConflictException(
            'User profile was changed by another request. Please retry.',
          );
        }
      }
    }

    throw new ConflictException(
      'User profile was changed by another request. Please retry.',
    );
  }

  async unlockOwnAccount(userId: string): Promise<StoredUser> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const current = await this.getByIdOrThrow(userId);

      if (current.status === 'ACTIVE') {
        return current;
      }

      if (current.status !== 'LOCKED') {
        throw new BadRequestException(
          'Only locked accounts can be unlocked.',
        );
      }

      const nextUser: StoredUser = {
        ...current,
        status: 'ACTIVE',
        deletedAt: null,
        updatedAt: nowIso(),
      };

      try {
        await this.repository.transactPut([
          {
            tableName: this.config.dynamodbUsersTableName,
            item: nextUser,
            conditionExpression:
              'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
            expressionAttributeValues: {
              ':expectedUpdatedAt': current.updatedAt,
            },
          },
        ]);
        return nextUser;
      } catch (error) {
        if (!this.isConditionalWriteConflict(error)) {
          throw error;
        }

        if (attempt === maxAttempts - 1) {
          throw new ConflictException(
            'User profile was changed by another request. Please retry.',
          );
        }
      }
    }

    throw new ConflictException(
      'User profile was changed by another request. Please retry.',
    );
  }

  async deleteOwnAccountPermanently(userId: string): Promise<StoredUser> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const current = await this.getByIdOrThrow(userId);

      if (current.status !== 'ACTIVE' && current.status !== 'DEACTIVATED') {
        throw new BadRequestException(
          'Only active or deactivated accounts can be permanently deleted.',
        );
      }

      const deletedAt = nowIso();
      const nextUser: StoredUser = {
        ...current,
        phone: undefined,
        email: undefined,
        passwordHash: `deleted#${createUlid()}`,
        fullName: 'Deleted User',
        unit: undefined,
        avatarAsset: undefined,
        avatarUrl: undefined,
        status: 'DELETED',
        deletedAt,
        updatedAt: deletedAt,
      };

      try {
        await this.writeUserWithIdentityClaims({
          nextUser,
          previousUser: current,
          expectedUpdatedAt: current.updatedAt,
        });
        return nextUser;
      } catch (error) {
        if (!this.isConditionalWriteConflict(error)) {
          throw error;
        }

        if (attempt === maxAttempts - 1) {
          throw new ConflictException(
            'User profile was changed by another request. Please retry.',
          );
        }
      }
    }

    throw new ConflictException(
      'User profile was changed by another request. Please retry.',
    );
  }

  async createUser(
    actor: AuthenticatedUser,
    payload: unknown,
  ): Promise<UserProfile> {
    const body = ensureObject(payload);
    const identity = requirePhoneOrEmail(body);
    const password = requiredString(body, 'password', {
      minLength: 10,
      maxLength: 100,
    });
    const fullName = requiredString(body, 'fullName', {
      minLength: 2,
      maxLength: 100,
    });
    const role = requiredEnum(body, 'role', USER_ROLES);
    const locationCode = ensureLocationCode(
      requiredString(body, 'locationCode'),
    );
    const unit = optionalString(body, 'unit', { maxLength: 200 });
    const avatarInput = this.resolveAvatarInput(body, actor.id);
    this.passwordPolicyService.validateOrThrow(
      password,
      {
        phone: identity.phone,
        email: identity.email,
        fullName,
      },
      this.resolvePasswordPolicyProfile(role),
    );

    if (
      !this.authorizationService.canCreateUserRole(actor, role, locationCode)
    ) {
      throw new ForbiddenException('You cannot create this user role.');
    }

    const now = nowIso();
    const userId = createUlid();
    const user: StoredUser = {
      PK: makeUserPk(userId),
      SK: makeUserProfileSk(),
      entityType: 'USER_PROFILE',
      GSI1SK: 'USER',
      userId,
      phone: identity.phone,
      email: identity.email,
      passwordHash: await this.passwordService.hashPassword(password),
      fullName,
      role,
      locationCode,
      unit,
      avatarAsset: avatarInput.asset,
      avatarUrl: avatarInput.url,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.assertUniqueIdentity(user.phone, user.email);
    await this.persistUserWithIdentityClaims({
      nextUser: user,
    });
    return this.serializeUserProfile(user);
  }

  async listUsers(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<UserProfile[], ApiResponseMeta>> {
    const users = (
      await this.repository.scanAll<StoredUser>(
        this.config.dynamodbUsersTableName,
      )
    )
      .filter((user) => user.entityType === 'USER_PROFILE')
      .filter((user) => !user.deletedAt && user.status !== 'DELETED')
      .filter((user) => this.authorizationService.canReadUser(actor, user));
    const role = optionalQueryString(query.role, 'role');
    const status = optionalQueryString(query.status, 'status');
    const locationCode = parseLocationCodeQuery(
      query.locationCode,
      'locationCode',
    );
    const keyword = optionalQueryString(query.q, 'q')?.toLowerCase();
    const limit = parseLimit(query.limit);

    const filtered = users.filter((user) => {
      if (role && user.role !== role) {
        return false;
      }

      if (status && user.status !== status) {
        return false;
      }

      if (locationCode && user.locationCode !== locationCode) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystacks = [user.fullName, user.phone ?? '', user.email ?? '']
        .join(' ')
        .toLowerCase();

      return haystacks.includes(keyword);
    });
    const page = paginateSortedItems(
      filtered,
      limit,
      query.cursor,
      (user) => user.createdAt,
      (user) => user.userId,
    );

    return buildPaginatedResponse(
      await Promise.all(
        page.items.map((item) => this.serializeUserProfile(item)),
      ),
      page.nextCursor,
    );
  }

  async getUser(
    actor: AuthenticatedUser,
    userId: string,
  ): Promise<UserProfile> {
    const target = await this.getByIdOrThrow(userId);

    if (!this.authorizationService.canReadUser(actor, target)) {
      throw new ForbiddenException('You cannot access this profile.');
    }

    return this.serializeUserProfile(target);
  }

  async searchExact(
    actor: AuthenticatedUser,
    query: string,
  ): Promise<UserProfile> {
    const q = query?.trim() ?? '';
    if (!q) {
      throw new BadRequestException('Search query is required.');
    }

    let user: StoredUser | undefined;
    if (q.includes('@')) {
      user = await this.findByEmail(q);
    } else {
      user = await this.findByPhone(q);
    }

    if (!user || user.deletedAt || user.status === 'DELETED') {
      throw new NotFoundException(
        'No user matched the provided phone or email.',
      );
    }

    return toUserProfile(user);
  }

  async updateProfile(
    actor: AuthenticatedUser,
    payload: unknown,
  ): Promise<UserProfile> {
    const body = ensureObject(payload);
    const current = await this.getByIdOrThrow(actor.id);
    const fullName = optionalString(body, 'fullName', {
      minLength: 2,
      maxLength: 100,
    });
    const avatarInput = this.resolveAvatarInput(body, actor.id, actor.id);
    const unit = optionalString(body, 'unit', { maxLength: 200 });
    const locationCodeInput = optionalString(body, 'locationCode');
    const identity = requirePhoneOrEmail({
      phone: body.phone ?? current.phone,
      email: body.email ?? current.email,
    });

    const nextLocationCode = locationCodeInput
      ? ensureLocationCode(locationCodeInput)
      : current.locationCode;

    if (locationCodeInput && actor.role === 'CITIZEN') {
      throw new ForbiddenException('Citizens cannot change locationCode.');
    }

    if (
      locationCodeInput &&
      actor.role !== 'ADMIN' &&
      !this.authorizationService.canAccessLocationScope(actor, nextLocationCode)
    ) {
      throw new ForbiddenException('locationCode is outside of your scope.');
    }

    const nextUser: StoredUser = {
      ...current,
      GSI1SK: 'USER',
      phone: identity.phone,
      email: identity.email,
      fullName: fullName ?? current.fullName,
      unit: unit ?? current.unit,
      avatarAsset:
        avatarInput.asset !== undefined
          ? avatarInput.asset
          : current.avatarAsset,
      avatarUrl: Object.prototype.hasOwnProperty.call(body, 'avatarKey')
        ? undefined
        : avatarInput.url !== undefined
          ? avatarInput.url
          : current.avatarUrl,
      locationCode: nextLocationCode,
      updatedAt: nowIso(),
    };

    await this.assertUniqueIdentity(
      nextUser.phone,
      nextUser.email,
      current.userId,
    );
    await this.persistUserWithIdentityClaims({
      nextUser,
      previousUser: current,
      expectedUpdatedAt: current.updatedAt,
    });
    return this.serializeUserProfile(nextUser);
  }

  async clearCurrentAvatar(actor: AuthenticatedUser): Promise<UserProfile> {
    const current = await this.getByIdOrThrow(actor.id);

    if (!current.avatarAsset && !current.avatarUrl) {
      return this.serializeUserProfile(current);
    }

    const nextUser: StoredUser = {
      ...current,
      GSI1SK: 'USER',
      avatarAsset: undefined,
      avatarUrl: undefined,
      updatedAt: nowIso(),
    };

    await this.persistUserWithIdentityClaims({
      nextUser,
      previousUser: current,
      expectedUpdatedAt: current.updatedAt,
    });

    return this.serializeUserProfile(nextUser);
  }

  async updateStatus(
    actor: AuthenticatedUser,
    userId: string,
    payload: unknown,
  ): Promise<UserProfile> {
    const body = ensureObject(payload);
    const status = requiredEnum(body, 'status', USER_STATUSES);
    const target = await this.getByIdOrThrow(userId);

    if (!this.authorizationService.canManageUser(actor, target)) {
      throw new ForbiddenException('You cannot change this user status.');
    }

    const nextUser: StoredUser = {
      ...target,
      status,
      deletedAt: status === 'DELETED' ? nowIso() : null,
      updatedAt: nowIso(),
    };

    try {
      await this.repository.transactPut([
        {
          tableName: this.config.dynamodbUsersTableName,
          item: nextUser,
          conditionExpression:
            'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt',
          expressionAttributeValues: {
            ':expectedUpdatedAt': target.updatedAt,
          },
        },
      ]);
    } catch (error) {
      if (this.isConditionalWriteConflict(error)) {
        throw new ConflictException('User changed. Please retry.');
      }

      throw error;
    }

    if (status !== 'ACTIVE') {
      const revokedSessionCount =
        await this.refreshSessionService.revokeAllSessionsForUser(
          target.userId,
        );
      this.chatRealtimeService.disconnectUserSockets(target.userId);
      this.observabilityService.recordSessionRevocations(
        'user_status',
        revokedSessionCount,
      );
    }

    return this.serializeUserProfile(nextUser);
  }

  async listPushDevices(
    actor: AuthenticatedUser,
  ): Promise<ApiSuccessResponse<PushDevice[], ApiResponseMeta>> {
    return this.pushNotificationService.listDevices(actor.id);
  }

  async registerPushDevice(
    actor: AuthenticatedUser,
    payload: unknown,
  ): Promise<PushDevice> {
    return this.pushNotificationService.registerDevice(actor.id, payload);
  }

  async deletePushDevice(
    actor: AuthenticatedUser,
    deviceId: string,
  ): Promise<{ deviceId: string; removedAt: string }> {
    return this.pushNotificationService.deleteDevice(actor.id, deviceId);
  }

  async getPresence(actor: AuthenticatedUser, userId: string) {
    const target = await this.getByIdOrThrow(userId);

    if (!this.authorizationService.canReadUser(actor, target)) {
      throw new ForbiddenException('You cannot access this profile.');
    }

    return this.chatPresenceService.getPresence(userId);
  }

  async listFriends(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<UserFriendItem[], ApiResponseMeta>> {
    await this.getActiveByIdOrThrow(actor.id);
    const limit = parseLimit(query.limit);
    const edges = (
      await this.repository.queryByPk<StoredUserFriendEdge>(
        this.config.dynamodbUsersTableName,
        makeUserPk(actor.id),
        {
          beginsWith: 'FRIEND#',
        },
      )
    )
      .filter((item) => item.entityType === 'USER_FRIEND_EDGE')
      .filter((item) => item.friendUserId !== actor.id);
    const page = paginateSortedItems(
      edges,
      limit,
      query.cursor,
      (edge) => edge.createdAt,
      (edge) => edge.friendUserId,
    );

    const friends = await this.getUsersByIds(
      page.items.map((item) => item.friendUserId),
    );
    const friendMap = new Map(friends.map((friend) => [friend.userId, friend]));
    const aliasMap = await this.getContactAliasMap(
      actor.id,
      page.items.map((item) => item.friendUserId),
    );
    const data = (
      await Promise.all(
        page.items.map(async (item) => {
          const friend = friendMap.get(item.friendUserId);

          if (
            !friend ||
            friend.deletedAt ||
            friend.status === 'DELETED' ||
            friend.status === 'LOCKED'
          ) {
            return undefined;
          }

          return this.serializeUserFriendItem(
            friend,
            item.createdAt,
            aliasMap.get(item.friendUserId)?.alias,
          );
        }),
      )
    ).filter((item): item is UserFriendItem => item !== undefined);

    return buildPaginatedResponse(data, page.nextCursor);
  }

  async listBlockedUsers(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<UserBlockedItem[], ApiResponseMeta>> {
    await this.getActiveByIdOrThrow(actor.id);
    const limit = parseLimit(query.limit);
    const edges = (
      await this.repository.queryByPk<StoredUserBlockEdge>(
        this.config.dynamodbUsersTableName,
        makeUserPk(actor.id),
        {
          beginsWith: 'BLOCK#',
        },
      )
    )
      .filter((item) => item.entityType === 'USER_BLOCK_EDGE')
      .filter((item) => item.direction === 'OUTGOING')
      .filter((item) => item.blockedUserId !== actor.id);
    const page = paginateSortedItems(
      edges,
      limit,
      query.cursor,
      (edge) => edge.createdAt,
      (edge) => edge.blockedUserId,
    );

    const users = await this.getUsersByIds(
      page.items.map((item) => item.blockedUserId),
    );
    const userMap = new Map(users.map((user) => [user.userId, user]));
    const aliasMap = await this.getContactAliasMap(
      actor.id,
      page.items.map((item) => item.blockedUserId),
    );
    const data = (
      await Promise.all(
        page.items.map(async (item) => {
          const blockedUser = userMap.get(item.blockedUserId);

          if (
            !blockedUser ||
            blockedUser.deletedAt ||
            blockedUser.status === 'DELETED' ||
            blockedUser.status === 'LOCKED'
          ) {
            return undefined;
          }

          return this.serializeUserBlockedItem(
            blockedUser,
            item.createdAt,
            aliasMap.get(item.blockedUserId)?.alias,
          );
        }),
      )
    ).filter((item): item is UserBlockedItem => item !== undefined);

    return buildPaginatedResponse(data, page.nextCursor);
  }

  async listFriendRequests(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<UserFriendRequestItem[], ApiResponseMeta>> {
    await this.getActiveByIdOrThrow(actor.id);
    const limit = parseLimit(query.limit);
    const directionRaw = optionalQueryString(query.direction, 'direction');
    let direction: FriendRequestDirection | undefined;

    if (directionRaw) {
      if (
        FRIEND_REQUEST_DIRECTIONS.includes(
          directionRaw as FriendRequestDirection,
        )
      ) {
        direction = directionRaw as FriendRequestDirection;
      } else {
        throw new BadRequestException('direction is invalid.');
      }
    }

    const requests = (
      await this.repository.queryByPk<StoredUserFriendRequest>(
        this.config.dynamodbUsersTableName,
        makeUserPk(actor.id),
        {
          beginsWith: 'FRIEND_REQUEST#',
        },
      )
    )
      .filter((item) => item.entityType === 'USER_FRIEND_REQUEST')
      .filter((item) => (direction ? item.direction === direction : true));
    const page = paginateSortedItems(
      requests,
      limit,
      query.cursor,
      (request) => request.createdAt,
      (request) =>
        request.direction === 'INCOMING'
          ? request.requesterUserId
          : request.targetUserId,
    );

    const counterpartIds = page.items.map((request) =>
      request.direction === 'INCOMING'
        ? request.requesterUserId
        : request.targetUserId,
    );
    const users = await this.getUsersByIds(counterpartIds);
    const userMap = new Map(users.map((user) => [user.userId, user]));
    const aliasMap = await this.getContactAliasMap(actor.id, counterpartIds);
    const data = (
      await Promise.all(
        page.items.map(async (request) => {
          const otherUserId =
            request.direction === 'INCOMING'
              ? request.requesterUserId
              : request.targetUserId;
          const user = userMap.get(otherUserId);

          if (
            !user ||
            user.deletedAt ||
            user.status === 'DELETED' ||
            user.status === 'LOCKED'
          ) {
            return undefined;
          }

          return this.serializeUserFriendRequestItem(
            user,
            request.direction,
            request.createdAt,
            aliasMap.get(otherUserId)?.alias,
          );
        }),
      )
    ).filter((item): item is UserFriendRequestItem => item !== undefined);

    return buildPaginatedResponse(data, page.nextCursor);
  }

  async searchUsersForChatAndFriend(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<ApiSuccessResponse<UserDirectoryItem[], ApiResponseMeta>> {
    await this.getActiveByIdOrThrow(actor.id);
    const keyword = optionalQueryString(query.q, 'q')?.toLowerCase();
    const limit = parseLimit(query.limit);
    const modeRaw = optionalQueryString(query.mode, 'mode') ?? 'all';

    if (!USER_DISCOVERY_MODES.includes(modeRaw as UserDiscoveryMode)) {
      throw new BadRequestException('mode is invalid.');
    }

    const mode = modeRaw as UserDiscoveryMode;
    const [allUsers, edges, requests, outgoingBlocks, incomingBlocks] =
      await Promise.all([
        this.repository.scanAll<StoredUser>(this.config.dynamodbUsersTableName),
        this.repository.queryByPk<StoredUserFriendEdge>(
          this.config.dynamodbUsersTableName,
          makeUserPk(actor.id),
          {
            beginsWith: 'FRIEND#',
          },
        ),
        this.repository.queryByPk<StoredUserFriendRequest>(
          this.config.dynamodbUsersTableName,
          makeUserPk(actor.id),
          {
            beginsWith: 'FRIEND_REQUEST#',
          },
        ),
        this.repository.queryByPk<StoredUserBlockEdge>(
          this.config.dynamodbUsersTableName,
          makeUserPk(actor.id),
          {
            beginsWith: 'BLOCK#',
          },
        ),
        this.repository.queryByPk<StoredUserBlockEdge>(
          this.config.dynamodbUsersTableName,
          makeUserPk(actor.id),
          {
            beginsWith: 'BLOCKED_BY#',
          },
        ),
      ]);

    const friendUserIds = new Set(
      edges
        .filter((edge) => edge.entityType === 'USER_FRIEND_EDGE')
        .map((edge) => edge.friendUserId),
    );
    const incomingRequestUserIds = new Set(
      requests
        .filter((request) => request.entityType === 'USER_FRIEND_REQUEST')
        .filter((request) => request.direction === 'INCOMING')
        .map((request) => request.requesterUserId),
    );
    const outgoingRequestUserIds = new Set(
      requests
        .filter((request) => request.entityType === 'USER_FRIEND_REQUEST')
        .filter((request) => request.direction === 'OUTGOING')
        .map((request) => request.targetUserId),
    );
    const blockedUserIds = new Set(
      outgoingBlocks
        .filter((block) => block.entityType === 'USER_BLOCK_EDGE')
        .filter((block) => block.direction === 'OUTGOING')
        .map((block) => block.blockedUserId),
    );
    const blockedByUserIds = new Set(
      incomingBlocks
        .filter((block) => block.entityType === 'USER_BLOCK_EDGE')
        .filter((block) => block.direction === 'INCOMING')
        .map((block) => block.blockerUserId),
    );
    const citizenCandidateIds = allUsers
      .filter((user) => user.entityType === 'USER_PROFILE')
      .filter((user) => !user.deletedAt && user.status === 'ACTIVE')
      .filter((user) => user.userId !== actor.id)
      .filter(
        (user) =>
          !blockedUserIds.has(user.userId) &&
          !blockedByUserIds.has(user.userId),
      )
      .filter((user) => user.role === 'CITIZEN')
      .map((user) => user.userId);
    const directMessageRequests =
      await this.repository.batchGet<StoredDirectMessageRequest>(
        this.config.dynamodbConversationsTableName,
        citizenCandidateIds.map((userId) => ({
          PK: `DMREQ#${makeDmConversationId(actor.id, userId)}`,
          SK: 'STATE',
        })),
      );
    const directMessageRequestByUserId = new Map<
      string,
      StoredDirectMessageRequest
    >();

    for (const request of directMessageRequests) {
      if (request.entityType !== 'DIRECT_MESSAGE_REQUEST') {
        continue;
      }

      const otherUserId =
        request.requesterUserId === actor.id
          ? request.targetUserId
          : request.requesterUserId;

      directMessageRequestByUserId.set(otherUserId, request);
    }

    const candidates = allUsers
      .filter((user) => user.entityType === 'USER_PROFILE')
      .filter((user) => !user.deletedAt && user.status === 'ACTIVE')
      .filter((user) => user.userId !== actor.id)
      .filter(
        (user) =>
          !blockedUserIds.has(user.userId) &&
          !blockedByUserIds.has(user.userId),
      )
      .filter((user) => this.canDiscoverUser(actor, user))
      .filter((user) => {
        if (!keyword) {
          return true;
        }

        return [user.fullName, user.phone ?? '', user.email ?? '']
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      })
      .map((user) => {
        const relationState = this.resolveFriendRelationState(
          user.userId,
          friendUserIds,
          incomingRequestUserIds,
          outgoingRequestUserIds,
        );
        const canAccessDirectConversation =
          this.authorizationService.canAccessDirectConversation(actor, user);
        const directMessageRequest = directMessageRequestByUserId.get(
          user.userId,
        );
        const canMessage =
          user.role === 'CITIZEN' && actor.role === 'CITIZEN'
            ? friendUserIds.has(user.userId) ||
              directMessageRequest?.status === 'ACCEPTED'
            : canAccessDirectConversation;
        const canSendFriendRequest =
          actor.role === 'CITIZEN' &&
          user.role === 'CITIZEN' &&
          relationState === 'NONE';
        const canSendMessageRequest =
          actor.role === 'CITIZEN' &&
          user.role === 'CITIZEN' &&
          relationState === 'NONE' &&
          canAccessDirectConversation &&
          directMessageRequest === undefined;

        return {
          userId: user.userId,
          fullName: user.fullName,
          role: user.role,
          locationCode: user.locationCode,
          avatarAsset: user.avatarAsset,
          avatarUrl: user.avatarUrl,
          status: user.status,
          relationState,
          canMessage,
          canSendFriendRequest,
          canSendMessageRequest,
          updatedAt: user.updatedAt,
        };
      })
      .filter((item) => {
        if (mode === 'chat') {
          return item.canMessage;
        }

        if (mode === 'friend') {
          return (
            item.relationState !== 'NONE' || item.canSendFriendRequest === true
          );
        }

        return true;
      });
    const page = paginateSortedItems(
      candidates,
      limit,
      query.cursor,
      (item) => item.updatedAt,
      (item) => item.userId,
    );
    const aliasMap = await this.getContactAliasMap(
      actor.id,
      page.items.map((item) => item.userId),
    );

    return buildPaginatedResponse(
      await Promise.all(
        page.items.map((item) =>
          this.serializeUserDirectoryItem({
            userId: item.userId,
            fullName: item.fullName,
            displayName: item.fullName,
            role: item.role,
            locationCode: item.locationCode,
            avatarAsset: item.avatarAsset,
            avatarUrl: item.avatarUrl,
            status: item.status,
            relationState: item.relationState,
            canMessage: item.canMessage,
            canSendFriendRequest: item.canSendFriendRequest,
            canSendMessageRequest: item.canSendMessageRequest,
            contactAlias: aliasMap.get(item.userId)?.alias,
          }),
        ),
      ),
      page.nextCursor,
    );
  }

  async sendFriendRequest(
    actor: AuthenticatedUser,
    targetUserId: string,
  ): Promise<UserFriendRequestItem> {
    const requester = await this.getActiveByIdOrThrow(actor.id);
    const target = await this.getActiveByIdOrThrow(targetUserId);
    this.assertFriendshipEligiblePair(requester, target);

    if (requester.userId === target.userId) {
      throw new BadRequestException(
        'Cannot send a friend request to yourself.',
      );
    }

    await this.ensureUsersAreNotBlocked(
      requester.userId,
      target.userId,
      'Friend requests are blocked between these users.',
    );

    const existingFriendship = await this.getFriendEdge(
      requester.userId,
      target.userId,
    );

    if (existingFriendship) {
      throw new BadRequestException('Users are already friends.');
    }

    const outgoingExisting = await this.getFriendRequest(
      requester.userId,
      requester.userId,
      target.userId,
      'OUTGOING',
    );

    if (outgoingExisting) {
      return this.serializeUserFriendRequestItem(
        target,
        'OUTGOING',
        outgoingExisting.createdAt,
      );
    }

    const incomingExisting = await this.getFriendRequest(
      requester.userId,
      target.userId,
      requester.userId,
      'INCOMING',
    );

    if (incomingExisting) {
      throw new ConflictException(
        'This user already sent you a friend request. Accept it instead.',
      );
    }

    const now = nowIso();
    const outgoingRequest = this.buildFriendRequestRecord({
      ownerUserId: requester.userId,
      requesterUserId: requester.userId,
      targetUserId: target.userId,
      direction: 'OUTGOING',
      occurredAt: now,
    });
    const incomingRequest = this.buildFriendRequestRecord({
      ownerUserId: target.userId,
      requesterUserId: requester.userId,
      targetUserId: target.userId,
      direction: 'INCOMING',
      occurredAt: now,
    });

    await this.repository.transactWrite([
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: outgoingRequest,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: incomingRequest,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);

    return this.serializeUserFriendRequestItem(target, 'OUTGOING', now);
  }

  async acceptFriendRequest(
    actor: AuthenticatedUser,
    requesterUserId: string,
  ): Promise<UserFriendItem> {
    const receiver = await this.getActiveByIdOrThrow(actor.id);
    const requester = await this.getActiveByIdOrThrow(requesterUserId);
    this.assertFriendshipEligiblePair(receiver, requester);

    if (receiver.userId === requester.userId) {
      throw new BadRequestException('Cannot accept your own friend request.');
    }

    await this.ensureUsersAreNotBlocked(
      receiver.userId,
      requester.userId,
      'Friend requests are blocked between these users.',
    );

    const incomingRequest = await this.getFriendRequest(
      receiver.userId,
      requester.userId,
      receiver.userId,
      'INCOMING',
    );

    if (!incomingRequest) {
      throw new NotFoundException('Friend request not found.');
    }

    const outgoingRequest = await this.getFriendRequest(
      requester.userId,
      requester.userId,
      receiver.userId,
      'OUTGOING',
    );
    const existingEdge = await this.getFriendEdge(
      receiver.userId,
      requester.userId,
    );
    const now = existingEdge?.createdAt ?? nowIso();
    const receiverEdge = this.buildFriendEdgeRecord(
      receiver.userId,
      requester.userId,
      now,
    );
    const requesterEdge = this.buildFriendEdgeRecord(
      requester.userId,
      receiver.userId,
      now,
    );
    const friendConversationId = makeDmConversationId(
      receiver.userId,
      requester.userId,
    );
    const bootstrapConversationItems =
      await this.buildFriendConversationBootstrapWrites(
        receiver,
        requester,
        friendConversationId,
        now,
      );
    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: receiverEdge,
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: requesterEdge,
      },
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: incomingRequest.PK,
          SK: incomingRequest.SK,
        },
      },
      ...bootstrapConversationItems,
    ];

    if (outgoingRequest) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: outgoingRequest.PK,
          SK: outgoingRequest.SK,
        },
      });
    }

    await this.repository.transactWrite(transactionItems);
    return this.serializeUserFriendItem(requester, now);
  }

  async rejectIncomingFriendRequest(
    actor: AuthenticatedUser,
    requesterUserId: string,
  ): Promise<{ userId: string; action: 'REJECTED'; occurredAt: string }> {
    await this.getActiveByIdOrThrow(actor.id);
    await this.getByIdOrThrow(requesterUserId);

    const incomingRequest = await this.getFriendRequest(
      actor.id,
      requesterUserId,
      actor.id,
      'INCOMING',
    );

    if (!incomingRequest) {
      throw new NotFoundException('Friend request not found.');
    }

    const outgoingRequest = await this.getFriendRequest(
      requesterUserId,
      requesterUserId,
      actor.id,
      'OUTGOING',
    );
    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: incomingRequest.PK,
          SK: incomingRequest.SK,
        },
      },
    ];

    if (outgoingRequest) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: outgoingRequest.PK,
          SK: outgoingRequest.SK,
        },
      });
    }

    await this.repository.transactWrite(transactionItems);
    return {
      userId: requesterUserId,
      action: 'REJECTED',
      occurredAt: nowIso(),
    };
  }

  async cancelOutgoingFriendRequest(
    actor: AuthenticatedUser,
    targetUserId: string,
  ): Promise<{ userId: string; action: 'CANCELED'; occurredAt: string }> {
    await this.getActiveByIdOrThrow(actor.id);
    await this.getByIdOrThrow(targetUserId);

    const outgoingRequest = await this.getFriendRequest(
      actor.id,
      actor.id,
      targetUserId,
      'OUTGOING',
    );

    if (!outgoingRequest) {
      throw new NotFoundException('Friend request not found.');
    }

    const incomingRequest = await this.getFriendRequest(
      targetUserId,
      actor.id,
      targetUserId,
      'INCOMING',
    );
    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: outgoingRequest.PK,
          SK: outgoingRequest.SK,
        },
      },
    ];

    if (incomingRequest) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: incomingRequest.PK,
          SK: incomingRequest.SK,
        },
      });
    }

    await this.repository.transactWrite(transactionItems);
    return {
      userId: targetUserId,
      action: 'CANCELED',
      occurredAt: nowIso(),
    };
  }

  async removeFriend(
    actor: AuthenticatedUser,
    friendUserId: string,
  ): Promise<{ userId: string; removedAt: string }> {
    await this.getActiveByIdOrThrow(actor.id);
    await this.getByIdOrThrow(friendUserId);

    if (actor.id === friendUserId) {
      throw new BadRequestException('Cannot remove yourself from friends.');
    }

    const currentEdge = await this.getFriendEdge(actor.id, friendUserId);

    if (!currentEdge) {
      throw new NotFoundException('Friend not found.');
    }

    const reverseEdge = await this.getFriendEdge(friendUserId, actor.id);
    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: currentEdge.PK,
          SK: currentEdge.SK,
        },
      },
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makeUserPk(actor.id),
          SK: this.makeOutgoingFriendRequestSk(friendUserId),
        },
      },
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makeUserPk(actor.id),
          SK: this.makeIncomingFriendRequestSk(friendUserId),
        },
      },
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makeUserPk(friendUserId),
          SK: this.makeOutgoingFriendRequestSk(actor.id),
        },
      },
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makeUserPk(friendUserId),
          SK: this.makeIncomingFriendRequestSk(actor.id),
        },
      },
    ];

    if (reverseEdge) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: reverseEdge.PK,
          SK: reverseEdge.SK,
        },
      });
    }

    await this.repository.transactWrite(transactionItems);

    return {
      userId: friendUserId,
      removedAt: nowIso(),
    };
  }

  async blockUser(
    actor: AuthenticatedUser,
    targetUserId: string,
  ): Promise<{ userId: string; blockedAt: string }> {
    const blocker = await this.getActiveByIdOrThrow(actor.id);
    const target = await this.getActiveByIdOrThrow(targetUserId);

    if (blocker.userId === target.userId) {
      throw new BadRequestException('Cannot block yourself.');
    }

    const existingBlock = await this.getBlockEdge(
      blocker.userId,
      target.userId,
      'OUTGOING',
    );

    if (existingBlock) {
      return {
        userId: target.userId,
        blockedAt: existingBlock.createdAt,
      };
    }

    const occurredAt = nowIso();
    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: this.buildBlockEdgeRecord(
          blocker.userId,
          target.userId,
          'OUTGOING',
          occurredAt,
        ),
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: this.buildBlockEdgeRecord(
          blocker.userId,
          target.userId,
          'INCOMING',
          occurredAt,
        ),
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ];

    this.pushFriendshipCleanupWrites(
      transactionItems,
      blocker.userId,
      target.userId,
      await this.getFriendEdge(blocker.userId, target.userId),
      await this.getFriendEdge(target.userId, blocker.userId),
    );

    await this.repository.transactWrite(transactionItems);

    return {
      userId: target.userId,
      blockedAt: occurredAt,
    };
  }

  async unblockUser(
    actor: AuthenticatedUser,
    targetUserId: string,
  ): Promise<{ userId: string; unblockedAt: string }> {
    await this.getActiveByIdOrThrow(actor.id);
    await this.getByIdOrThrow(targetUserId);

    const outgoingBlock = await this.getBlockEdge(
      actor.id,
      targetUserId,
      'OUTGOING',
    );

    if (!outgoingBlock) {
      throw new NotFoundException('Blocked user not found.');
    }

    const incomingBlock = await this.getBlockEdge(
      actor.id,
      targetUserId,
      'INCOMING',
    );
    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: outgoingBlock.PK,
          SK: outgoingBlock.SK,
        },
      },
    ];

    if (incomingBlock) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: incomingBlock.PK,
          SK: incomingBlock.SK,
        },
      });
    }

    await this.repository.transactWrite(transactionItems);

    return {
      userId: targetUserId,
      unblockedAt: nowIso(),
    };
  }

  async setContactAlias(
    actor: AuthenticatedUser,
    targetUserId: string,
    payload: unknown,
  ): Promise<UserContactAlias> {
    await this.getActiveByIdOrThrow(actor.id);
    const target = await this.getActiveByIdOrThrow(targetUserId);

    if (actor.id === target.userId) {
      throw new BadRequestException('Cannot set an alias for yourself.');
    }

    const body = ensureObject(payload);
    const alias = requiredString(body, 'alias', {
      minLength: 1,
      maxLength: 100,
    });
    const existingAlias = await this.getContactAlias(actor.id, target.userId);
    const directSummary = await this.getDirectConversationSummary(
      actor.id,
      target.userId,
    );
    const friends = await this.areFriends(actor.id, target.userId);

    if (!friends && !directSummary) {
      throw new ForbiddenException(
        'You can only set an alias for friends or existing direct conversations.',
      );
    }

    const occurredAt = nowIso();
    const nextAlias: StoredUserContactAlias = {
      PK: makeUserPk(actor.id),
      SK: makeUserContactAliasSk(target.userId),
      entityType: 'USER_CONTACT_ALIAS',
      ownerUserId: actor.id,
      targetUserId: target.userId,
      alias,
      createdAt: existingAlias?.createdAt ?? occurredAt,
      updatedAt: occurredAt,
    };

    await this.repository.put(this.config.dynamodbUsersTableName, nextAlias);
    await this.syncDirectConversationAlias(
      actor.id,
      target.userId,
      alias,
      target.fullName,
      occurredAt,
    );

    return {
      userId: target.userId,
      alias,
      updatedAt: occurredAt,
    };
  }

  async clearContactAlias(
    actor: AuthenticatedUser,
    targetUserId: string,
  ): Promise<{ userId: string; clearedAt: string }> {
    await this.getActiveByIdOrThrow(actor.id);
    const existingAlias = await this.getContactAlias(actor.id, targetUserId);

    if (!existingAlias) {
      throw new NotFoundException('Contact alias not found.');
    }

    const clearedAt = nowIso();
    const target = await this.findById(targetUserId);
    await this.repository.delete(
      this.config.dynamodbUsersTableName,
      existingAlias.PK,
      existingAlias.SK,
    );
    await this.syncDirectConversationAlias(
      actor.id,
      targetUserId,
      undefined,
      target?.fullName ?? targetUserId,
      clearedAt,
    );

    return {
      userId: targetUserId,
      clearedAt,
    };
  }

  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    if (userId === otherUserId) {
      return false;
    }

    const edge = await this.getFriendEdge(userId, otherUserId);
    return Boolean(edge);
  }

  async canStartCitizenDm(
    actor: AuthenticatedUser,
    target: StoredUser,
  ): Promise<boolean> {
    if (actor.role !== 'CITIZEN' || target.role !== 'CITIZEN') {
      return true;
    }

    return this.areFriends(actor.id, target.userId);
  }

  async isInteractionBlocked(
    userId: string,
    otherUserId: string,
  ): Promise<boolean> {
    if (userId === otherUserId) {
      return false;
    }

    const [outgoingBlock, incomingBlock] = await Promise.all([
      this.getBlockEdge(userId, otherUserId, 'OUTGOING'),
      this.getBlockEdge(userId, otherUserId, 'INCOMING'),
    ]);

    return Boolean(outgoingBlock || incomingBlock);
  }

  private async hydrateFirst(
    items: Array<{ PK: string; SK: string }>,
  ): Promise<StoredUser | undefined> {
    if (items.length === 0) {
      return undefined;
    }

    const [user] = await this.repository.batchGet<StoredUser>(
      this.config.dynamodbUsersTableName,
      [
        {
          PK: items[0].PK,
          SK: items[0].SK,
        },
      ],
    );

    return user;
  }

  private async findByIdentityClaim(
    identityType: 'PHONE' | 'EMAIL',
    identityValue: string,
  ): Promise<StoredUser | undefined> {
    const claim = await this.repository.get<StoredUserIdentityClaim>(
      this.config.dynamodbUsersTableName,
      this.makeIdentityClaimPk(identityType, identityValue.trim()),
      this.makeIdentityClaimSk(),
    );

    if (!claim || claim.entityType !== 'USER_IDENTITY_CLAIM') {
      return undefined;
    }

    const claimedUser = await this.findById(claim.userId);

    if (
      claimedUser &&
      !claimedUser.deletedAt &&
      claimedUser.status !== 'DELETED'
    ) {
      return claimedUser;
    }

    await this.cleanupStaleIdentityClaim(claim);
    return undefined;
  }

  private async cleanupStaleIdentityClaim(
    claim: StoredUserIdentityClaim,
  ): Promise<void> {
    try {
      await this.repository.transactWrite([
        {
          kind: 'delete',
          tableName: this.config.dynamodbUsersTableName,
          key: {
            PK: claim.PK,
            SK: claim.SK,
          },
          conditionExpression:
            'entityType = :expectedEntityType AND userId = :expectedUserId',
          expressionAttributeValues: {
            ':expectedEntityType': 'USER_IDENTITY_CLAIM',
            ':expectedUserId': claim.userId,
          },
        },
      ]);
    } catch (error) {
      if (!this.isConditionalWriteConflict(error)) {
        throw error;
      }
    }
  }

  private resolveFriendRelationState(
    userId: string,
    friendUserIds: Set<string>,
    incomingRequestUserIds: Set<string>,
    outgoingRequestUserIds: Set<string>,
  ): 'FRIEND' | 'INCOMING_REQUEST' | 'OUTGOING_REQUEST' | 'NONE' {
    if (friendUserIds.has(userId)) {
      return 'FRIEND';
    }

    if (incomingRequestUserIds.has(userId)) {
      return 'INCOMING_REQUEST';
    }

    if (outgoingRequestUserIds.has(userId)) {
      return 'OUTGOING_REQUEST';
    }

    return 'NONE';
  }

  private canDiscoverUser(
    actor: AuthenticatedUser,
    target: StoredUser,
  ): boolean {
    if (actor.role === 'CITIZEN' && target.role === 'CITIZEN') {
      return true;
    }

    return this.authorizationService.canAccessDirectConversation(actor, target);
  }

  private async getUsersByIds(userIds: string[]): Promise<StoredUser[]> {
    const uniqueIds = Array.from(
      new Set(userIds.filter((userId) => userId.trim().length > 0)),
    );

    if (uniqueIds.length === 0) {
      return [];
    }

    const users = await this.repository.batchGet<StoredUser>(
      this.config.dynamodbUsersTableName,
      uniqueIds.map((userId) => ({
        PK: makeUserPk(userId),
        SK: makeUserProfileSk(),
      })),
    );

    return users.filter((user) => user.entityType === 'USER_PROFILE');
  }

  private assertFriendshipEligiblePair(
    leftUser: StoredUser,
    rightUser: StoredUser,
  ): void {
    if (leftUser.role !== 'CITIZEN' || rightUser.role !== 'CITIZEN') {
      throw new BadRequestException(
        'Friend requests are only supported between citizen accounts.',
      );
    }
  }

  private buildFriendEdgeRecord(
    userId: string,
    friendUserId: string,
    occurredAt: string,
  ): StoredUserFriendEdge {
    return {
      PK: makeUserPk(userId),
      SK: this.makeFriendEdgeSk(friendUserId),
      entityType: 'USER_FRIEND_EDGE',
      userId,
      friendUserId,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
  }

  private buildFriendRequestRecord(input: {
    ownerUserId: string;
    requesterUserId: string;
    targetUserId: string;
    direction: FriendRequestDirection;
    occurredAt: string;
  }): StoredUserFriendRequest {
    return {
      PK: makeUserPk(input.ownerUserId),
      SK:
        input.direction === 'INCOMING'
          ? this.makeIncomingFriendRequestSk(input.requesterUserId)
          : this.makeOutgoingFriendRequestSk(input.targetUserId),
      entityType: 'USER_FRIEND_REQUEST',
      requesterUserId: input.requesterUserId,
      targetUserId: input.targetUserId,
      direction: input.direction,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    };
  }

  private buildBlockEdgeRecord(
    blockerUserId: string,
    blockedUserId: string,
    direction: 'OUTGOING' | 'INCOMING',
    occurredAt: string,
  ): StoredUserBlockEdge {
    return {
      PK: makeUserPk(direction === 'OUTGOING' ? blockerUserId : blockedUserId),
      SK:
        direction === 'OUTGOING'
          ? this.makeOutgoingBlockSk(blockedUserId)
          : this.makeIncomingBlockSk(blockerUserId),
      entityType: 'USER_BLOCK_EDGE',
      blockerUserId,
      blockedUserId,
      direction,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
  }

  private pushFriendshipCleanupWrites(
    transactionItems: Parameters<UrbanTableRepository['transactWrite']>[0],
    leftUserId: string,
    rightUserId: string,
    leftToRightEdge?: StoredUserFriendEdge,
    rightToLeftEdge?: StoredUserFriendEdge,
  ): void {
    if (leftToRightEdge) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: leftToRightEdge.PK,
          SK: leftToRightEdge.SK,
        },
      });
    }

    if (rightToLeftEdge) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: rightToLeftEdge.PK,
          SK: rightToLeftEdge.SK,
        },
      });
    }

    transactionItems.push(
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makeUserPk(leftUserId),
          SK: this.makeOutgoingFriendRequestSk(rightUserId),
        },
      },
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makeUserPk(leftUserId),
          SK: this.makeIncomingFriendRequestSk(rightUserId),
        },
      },
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makeUserPk(rightUserId),
          SK: this.makeOutgoingFriendRequestSk(leftUserId),
        },
      },
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: makeUserPk(rightUserId),
          SK: this.makeIncomingFriendRequestSk(leftUserId),
        },
      },
    );
  }

  private async ensureUsersAreNotBlocked(
    leftUserId: string,
    rightUserId: string,
    message: string,
  ): Promise<void> {
    if (await this.isInteractionBlocked(leftUserId, rightUserId)) {
      throw new ForbiddenException(message);
    }
  }

  private async buildFriendConversationBootstrapWrites(
    receiver: StoredUser,
    requester: StoredUser,
    conversationId: string,
    occurredAt: string,
  ): Promise<Parameters<UrbanTableRepository['transactWrite']>[0]> {
    const receiverConversation = await this.getConversationSummaryRecord(
      receiver.userId,
      conversationId,
    );
    const requesterConversation = await this.getConversationSummaryRecord(
      requester.userId,
      conversationId,
    );

    return [
      ...this.buildFriendConversationSummaryWriteItems(
        receiver.userId,
        requester.fullName,
        conversationId,
        occurredAt,
        receiverConversation,
      ),
      ...this.buildFriendConversationSummaryWriteItems(
        requester.userId,
        receiver.fullName,
        conversationId,
        occurredAt,
        requesterConversation,
      ),
    ];
  }

  private buildFriendConversationSummaryWriteItems(
    ownerUserId: string,
    counterpartName: string,
    conversationId: string,
    occurredAt: string,
    existingConversation?: StoredConversation,
  ): Parameters<UrbanTableRepository['transactWrite']>[0] {
    const nextConversation = this.buildFriendConversationSummary(
      ownerUserId,
      counterpartName,
      conversationId,
      occurredAt,
      existingConversation,
    );

    if (!nextConversation) {
      return [];
    }

    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [];

    if (
      existingConversation &&
      existingConversation.SK !== nextConversation.SK
    ) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbConversationsTableName,
        key: {
          PK: existingConversation.PK,
          SK: existingConversation.SK,
        },
      });
    }

    transactionItems.push({
      kind: 'put',
      tableName: this.config.dynamodbConversationsTableName,
      item: nextConversation,
    });

    return transactionItems;
  }

  private buildFriendConversationSummary(
    ownerUserId: string,
    counterpartName: string,
    conversationId: string,
    occurredAt: string,
    existingConversation?: StoredConversation,
  ): StoredConversation | undefined {
    if (
      existingConversation &&
      !existingConversation.deletedAt &&
      !existingConversation.requestStatus &&
      !existingConversation.requestDirection &&
      !existingConversation.requestRequestedAt &&
      !existingConversation.requestRespondedAt &&
      !existingConversation.requestRespondedByUserId
    ) {
      return undefined;
    }

    return {
      PK: makeInboxPk(ownerUserId),
      SK: makeConversationSummarySk(conversationId, occurredAt),
      entityType: 'CONVERSATION',
      GSI1PK: makeInboxStatsKey(ownerUserId, 'DM'),
      userId: ownerUserId,
      conversationId,
      groupName: existingConversation?.groupName ?? counterpartName,
      lastMessagePreview: existingConversation?.lastMessagePreview ?? '',
      lastSenderName: existingConversation?.lastSenderName ?? '',
      unreadCount: 0,
      isGroup: false,
      isPinned: existingConversation?.isPinned ?? false,
      archivedAt: existingConversation?.archivedAt ?? null,
      mutedUntil: existingConversation?.mutedUntil ?? null,
      requestStatus: null,
      requestDirection: null,
      requestRequestedAt: null,
      requestRespondedAt: null,
      requestRespondedByUserId: null,
      deletedAt: null,
      updatedAt: occurredAt,
      lastReadAt: existingConversation?.lastReadAt ?? null,
    };
  }

  private async getFriendEdge(
    userId: string,
    friendUserId: string,
  ): Promise<StoredUserFriendEdge | undefined> {
    const edge = await this.repository.get<StoredUserFriendEdge>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      this.makeFriendEdgeSk(friendUserId),
    );

    if (!edge || edge.entityType !== 'USER_FRIEND_EDGE') {
      return undefined;
    }

    return edge;
  }

  private async getFriendRequest(
    ownerUserId: string,
    requesterUserId: string,
    targetUserId: string,
    direction: FriendRequestDirection,
  ): Promise<StoredUserFriendRequest | undefined> {
    const sk =
      direction === 'INCOMING'
        ? this.makeIncomingFriendRequestSk(requesterUserId)
        : this.makeOutgoingFriendRequestSk(targetUserId);
    const request = await this.repository.get<StoredUserFriendRequest>(
      this.config.dynamodbUsersTableName,
      makeUserPk(ownerUserId),
      sk,
    );

    if (!request || request.entityType !== 'USER_FRIEND_REQUEST') {
      return undefined;
    }

    if (
      request.requesterUserId !== requesterUserId ||
      request.targetUserId !== targetUserId ||
      request.direction !== direction
    ) {
      return undefined;
    }

    return request;
  }

  private async getConversationSummaryRecord(
    userId: string,
    conversationId: string,
  ): Promise<StoredConversation | undefined> {
    const items = await this.repository.queryByPk<StoredConversation>(
      this.config.dynamodbConversationsTableName,
      makeInboxPk(userId),
      {
        beginsWith: `CONV#${conversationId}#LAST#`,
        limit: 1,
        scanForward: false,
      },
    );

    return items.find((item) => item.entityType === 'CONVERSATION');
  }

  private async getBlockEdge(
    ownerUserId: string,
    otherUserId: string,
    direction: 'OUTGOING' | 'INCOMING',
  ): Promise<StoredUserBlockEdge | undefined> {
    const block = await this.repository.get<StoredUserBlockEdge>(
      this.config.dynamodbUsersTableName,
      makeUserPk(ownerUserId),
      direction === 'OUTGOING'
        ? this.makeOutgoingBlockSk(otherUserId)
        : this.makeIncomingBlockSk(otherUserId),
    );

    if (!block || block.entityType !== 'USER_BLOCK_EDGE') {
      return undefined;
    }

    if (
      block.blockerUserId !==
        (direction === 'OUTGOING' ? ownerUserId : otherUserId) ||
      block.blockedUserId !==
        (direction === 'OUTGOING' ? otherUserId : ownerUserId) ||
      block.direction !== direction
    ) {
      return undefined;
    }

    return block;
  }

  private makeFriendEdgeSk(friendUserId: string): string {
    return `FRIEND#${friendUserId}`;
  }

  private makeIncomingFriendRequestSk(requesterUserId: string): string {
    return `FRIEND_REQUEST#FROM#${requesterUserId}`;
  }

  private makeOutgoingFriendRequestSk(targetUserId: string): string {
    return `FRIEND_REQUEST#TO#${targetUserId}`;
  }

  private makeOutgoingBlockSk(blockedUserId: string): string {
    return `BLOCK#${blockedUserId}`;
  }

  private makeIncomingBlockSk(blockerUserId: string): string {
    return `BLOCKED_BY#${blockerUserId}`;
  }

  private resolvePasswordPolicyProfile(
    role: StoredUser['role'],
  ): PasswordPolicyProfile {
    return role === 'CITIZEN' ? 'standard' : 'privileged';
  }

  private resolveAvatarInput(
    body: Record<string, unknown>,
    ownerUserId: string,
    entityId?: string,
  ): { asset?: MediaAsset; url?: string } {
    const avatarKey = optionalString(body, 'avatarKey', { maxLength: 500 });
    const avatarUrl = optionalString(body, 'avatarUrl', { maxLength: 500 });

    if (avatarKey) {
      return {
        asset: this.mediaAssetService.createOwnedAssetReference({
          key: avatarKey,
          target: 'AVATAR',
          ownerUserId,
          entityId,
        }),
        url: undefined,
      };
    }

    return {
      asset: undefined,
      url: avatarUrl,
    };
  }

  private async serializeUserProfile(user: StoredUser): Promise<UserProfile> {
    const profile = toUserProfile(user);
    const { asset, url } =
      await this.mediaAssetService.resolveAssetWithLegacyUrl(
        profile.avatarAsset,
        profile.avatarUrl,
      );

    return {
      ...profile,
      avatarAsset: asset,
      avatarUrl: url,
    };
  }

  private async serializeUserFriendItem(
    user: StoredUser,
    friendsSince: string,
    contactAlias?: string,
  ): Promise<UserFriendItem> {
    const item = toUserFriendItem(user, friendsSince);
    const { asset, url } =
      await this.mediaAssetService.resolveAssetWithLegacyUrl(
        item.avatarAsset,
        item.avatarUrl,
      );

    return {
      ...item,
      contactAlias,
      displayName: contactAlias ?? item.fullName,
      avatarAsset: asset,
      avatarUrl: url,
    };
  }

  private async serializeUserFriendRequestItem(
    user: StoredUser,
    direction: 'INCOMING' | 'OUTGOING',
    requestedAt: string,
    contactAlias?: string,
  ): Promise<UserFriendRequestItem> {
    const item = toUserFriendRequestItem(user, direction, requestedAt);
    const { asset, url } =
      await this.mediaAssetService.resolveAssetWithLegacyUrl(
        item.avatarAsset,
        item.avatarUrl,
      );

    return {
      ...item,
      contactAlias,
      displayName: contactAlias ?? item.fullName,
      avatarAsset: asset,
      avatarUrl: url,
    };
  }

  private async serializeUserBlockedItem(
    user: StoredUser,
    blockedAt: string,
    contactAlias?: string,
  ): Promise<UserBlockedItem> {
    const item = toUserBlockedItem(user, blockedAt);
    const { asset, url } =
      await this.mediaAssetService.resolveAssetWithLegacyUrl(
        item.avatarAsset,
        item.avatarUrl,
      );

    return {
      ...item,
      contactAlias,
      displayName: contactAlias ?? item.fullName,
      avatarAsset: asset,
      avatarUrl: url,
    };
  }

  private async serializeUserDirectoryItem(
    item: UserDirectoryItem,
  ): Promise<UserDirectoryItem> {
    const { asset, url } =
      await this.mediaAssetService.resolveAssetWithLegacyUrl(
        item.avatarAsset,
        item.avatarUrl,
      );

    return {
      ...item,
      displayName: item.contactAlias ?? item.fullName,
      avatarAsset: asset,
      avatarUrl: url,
    };
  }

  async resolveContactDisplayName(
    ownerUserId: string,
    targetUserId: string,
    fallbackFullName: string,
  ): Promise<string> {
    const alias = await this.getContactAlias(ownerUserId, targetUserId);
    return alias?.alias ?? fallbackFullName;
  }

  private async getContactAlias(
    ownerUserId: string,
    targetUserId: string,
  ): Promise<StoredUserContactAlias | undefined> {
    const alias = await this.repository.get<StoredUserContactAlias>(
      this.config.dynamodbUsersTableName,
      makeUserPk(ownerUserId),
      makeUserContactAliasSk(targetUserId),
    );

    if (!alias || alias.entityType !== 'USER_CONTACT_ALIAS') {
      return undefined;
    }

    return alias;
  }

  private async getContactAliasMap(
    ownerUserId: string,
    targetUserIds: string[],
  ): Promise<Map<string, StoredUserContactAlias>> {
    const uniqueTargetIds = Array.from(new Set(targetUserIds));

    if (uniqueTargetIds.length === 0) {
      return new Map();
    }

    const aliases = await this.repository.batchGet<StoredUserContactAlias>(
      this.config.dynamodbUsersTableName,
      uniqueTargetIds.map((targetUserId) => ({
        PK: makeUserPk(ownerUserId),
        SK: makeUserContactAliasSk(targetUserId),
      })),
    );

    return new Map(
      aliases
        .filter(
          (alias): alias is StoredUserContactAlias =>
            alias.entityType === 'USER_CONTACT_ALIAS',
        )
        .map((alias) => [alias.targetUserId, alias]),
    );
  }

  private async getDirectConversationSummary(
    ownerUserId: string,
    targetUserId: string,
  ): Promise<StoredConversation | undefined> {
    const conversationId = makeDmConversationId(ownerUserId, targetUserId);
    const summaries = await this.repository.queryByPk<StoredConversation>(
      this.config.dynamodbConversationsTableName,
      makeInboxPk(ownerUserId),
      {
        beginsWith: `CONV#${conversationId}#LAST#`,
        limit: 1,
        scanForward: false,
      },
    );

    return summaries.find(
      (summary) => summary.entityType === 'CONVERSATION' && !summary.deletedAt,
    );
  }

  private async syncDirectConversationAlias(
    ownerUserId: string,
    targetUserId: string,
    contactAlias: string | undefined,
    fallbackFullName: string,
    occurredAt: string,
  ): Promise<void> {
    const existingConversation = await this.getDirectConversationSummary(
      ownerUserId,
      targetUserId,
    );

    if (!existingConversation) {
      return;
    }

    const displayName = contactAlias ?? fallbackFullName;

    if (existingConversation.groupName === displayName) {
      return;
    }

    const nextConversation: StoredConversation = {
      ...existingConversation,
      groupName: displayName,
    };
    const conversationId = makeDmConversationId(ownerUserId, targetUserId);
    const payload: ChatConversationUpdatedEvent = {
      eventId: createUlid(),
      conversationId: `dm:${targetUserId}`,
      conversationKey: conversationId,
      summary: {
        ...toConversationSummary(nextConversation),
        conversationId: `dm:${targetUserId}`,
      },
      reason: 'conversation.metadata.updated',
      occurredAt,
    };

    await this.repository.put(
      this.config.dynamodbConversationsTableName,
      nextConversation,
    );
    this.chatRealtimeService.emitToUser(
      ownerUserId,
      'conversation.updated',
      payload,
    );
  }

  private async persistUserWithIdentityClaims(input: {
    nextUser: StoredUser;
    previousUser?: StoredUser;
    expectedUpdatedAt?: string;
  }): Promise<void> {
    try {
      await this.writeUserWithIdentityClaims(input);
    } catch (error) {
      await this.rethrowUserWriteConflict(
        error,
        input.nextUser.phone,
        input.nextUser.email,
        input.previousUser?.userId,
      );
    }
  }

  private async writeUserWithIdentityClaims(input: {
    nextUser: StoredUser;
    previousUser?: StoredUser;
    expectedUpdatedAt?: string;
  }): Promise<void> {
    const { nextUser, previousUser } = input;
    const claimTimestamp = nextUser.updatedAt;
    const transactionItems: Parameters<
      UrbanTableRepository['transactWrite']
    >[0] = [];

    transactionItems.push({
      kind: 'put',
      tableName: this.config.dynamodbUsersTableName,
      item: nextUser,
      conditionExpression: previousUser
        ? 'attribute_exists(PK) AND attribute_exists(SK) AND updatedAt = :expectedUpdatedAt'
        : 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      expressionAttributeValues: previousUser
        ? {
            ':expectedUpdatedAt':
              input.expectedUpdatedAt ?? previousUser.updatedAt,
          }
        : undefined,
    });

    const nextPhone = nextUser.phone?.trim();
    const previousPhone = previousUser?.phone?.trim();
    const nextEmail = nextUser.email?.trim();
    const previousEmail = previousUser?.email?.trim();

    if (nextPhone && nextPhone !== previousPhone) {
      transactionItems.push({
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: this.buildIdentityClaim(
          nextUser.userId,
          'PHONE',
          nextPhone,
          claimTimestamp,
        ),
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      });
    }

    if (nextEmail && nextEmail !== previousEmail) {
      transactionItems.push({
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: this.buildIdentityClaim(
          nextUser.userId,
          'EMAIL',
          nextEmail,
          claimTimestamp,
        ),
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      });
    }

    if (previousUser && previousPhone && previousPhone !== nextPhone) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: this.makeIdentityClaimPk('PHONE', previousPhone),
          SK: this.makeIdentityClaimSk(),
        },
        conditionExpression: 'attribute_not_exists(userId) OR userId = :userId',
        expressionAttributeValues: {
          ':userId': previousUser.userId,
        },
      });
    }

    if (previousUser && previousEmail && previousEmail !== nextEmail) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: this.makeIdentityClaimPk('EMAIL', previousEmail),
          SK: this.makeIdentityClaimSk(),
        },
        conditionExpression: 'attribute_not_exists(userId) OR userId = :userId',
        expressionAttributeValues: {
          ':userId': previousUser.userId,
        },
      });
    }

    await this.repository.transactWrite(transactionItems);
  }

  private buildIdentityClaim(
    userId: string,
    identityType: 'PHONE' | 'EMAIL',
    identityValue: string,
    timestamp: string,
  ): StoredUserIdentityClaim {
    return {
      PK: this.makeIdentityClaimPk(identityType, identityValue),
      SK: this.makeIdentityClaimSk(),
      entityType: 'USER_IDENTITY_CLAIM',
      userId,
      identityType,
      identityValue,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private makeIdentityClaimPk(
    identityType: 'PHONE' | 'EMAIL',
    identityValue: string,
  ): string {
    return ['IDENTITY', identityType, identityValue].join('#');
  }

  private makeIdentityClaimSk(): string {
    return 'CLAIM';
  }

  private async rethrowUserWriteConflict(
    error: unknown,
    phone: string | undefined,
    email: string | undefined,
    currentUserId?: string,
  ): Promise<never> {
    if (!this.isConditionalWriteConflict(error)) {
      throw error;
    }

    await this.assertUniqueIdentity(phone, email, currentUserId);
    throw new ConflictException(
      'User profile was changed by another request. Please retry.',
    );
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

  private async assertUniqueIdentity(
    phone?: string,
    email?: string,
    currentUserId?: string,
  ): Promise<void> {
    if (phone) {
      const existingByPhone = await this.findByPhone(phone);

      if (existingByPhone && existingByPhone.userId !== currentUserId) {
        throw new BadRequestException('phone already exists.');
      }
    }

    if (email) {
      const existingByEmail = await this.findByEmail(email);

      if (existingByEmail && existingByEmail.userId !== currentUserId) {
        throw new BadRequestException('email already exists.');
      }
    }
  }
}
