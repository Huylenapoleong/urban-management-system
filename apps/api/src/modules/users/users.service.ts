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
  PushDevice,
  UserProfile,
} from '@urban/shared-types';
import {
  createUlid,
  makeUserPk,
  makeUserProfileSk,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import {
  buildPaginatedResponse,
  paginateSortedItems,
} from '../../common/pagination';
import { toUserProfile } from '../../common/mappers';
import type {
  StoredUser,
  StoredUserIdentityClaim,
} from '../../common/storage-records';
import {
  ensureLocationCode,
  ensureObject,
  optionalQueryString,
  optionalString,
  parseLimit,
  requirePhoneOrEmail,
  requiredEnum,
  requiredString,
} from '../../common/validation';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { ChatPresenceService } from '../../infrastructure/realtime/chat-presence.service';
import { ChatRealtimeService } from '../../modules/conversations/chat-realtime.service';
import { PasswordService } from '../../infrastructure/security/password.service';
import { RefreshSessionService } from '../../infrastructure/security/refresh-session.service';
import { PushNotificationService } from '../../infrastructure/notifications/push-notification.service';
import { ObservabilityService } from '../../infrastructure/observability/observability.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly passwordService: PasswordService,
    private readonly authorizationService: AuthorizationService,
    private readonly chatPresenceService: ChatPresenceService,
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly refreshSessionService: RefreshSessionService,
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
      minLength: 8,
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
      role: 'CITIZEN',
      locationCode,
      unit: undefined,
      avatarUrl,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.assertUniqueIdentity(user.phone, user.email);
    await this.persistUserWithIdentityClaims({
      nextUser: user,
    });
    return toUserProfile(user);
  }

  async createUser(
    actor: AuthenticatedUser,
    payload: unknown,
  ): Promise<UserProfile> {
    const body = ensureObject(payload);
    const identity = requirePhoneOrEmail(body);
    const password = requiredString(body, 'password', {
      minLength: 8,
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
    const avatarUrl = optionalString(body, 'avatarUrl', { maxLength: 500 });

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
      avatarUrl,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.assertUniqueIdentity(user.phone, user.email);
    await this.persistUserWithIdentityClaims({
      nextUser: user,
    });
    return toUserProfile(user);
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
    const locationCode = optionalQueryString(
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
      page.items.map(toUserProfile),
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

    return toUserProfile(target);
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
      throw new NotFoundException('Không tìm thấy người dùng với thông tin này.');
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
    const avatarUrl = optionalString(body, 'avatarUrl', { maxLength: 500 });
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
      avatarUrl: avatarUrl ?? current.avatarUrl,
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
    return toUserProfile(nextUser);
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

    return toUserProfile(nextUser);
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
