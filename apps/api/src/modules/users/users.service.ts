import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { USER_ROLES, USER_STATUSES } from '@urban/shared-constants';
import type { AuthenticatedUser, UserProfile } from '@urban/shared-types';
import {
  createUlid,
  makeUserPk,
  makeUserProfileSk,
  nowIso,
} from '@urban/shared-utils';
import { AuthorizationService } from '../../common/authorization.service';
import { toUserProfile } from '../../common/mappers';
import type { StoredUser } from '../../common/storage-records';
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
import { PasswordService } from '../../infrastructure/security/password.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly passwordService: PasswordService,
    private readonly authorizationService: AuthorizationService,
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

    await this.assertUniqueIdentity(identity.phone, identity.email);

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

    await this.repository.put(this.config.dynamodbUsersTableName, user);
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
      throw new ForbiddenException('You cannot create this role.');
    }

    await this.assertUniqueIdentity(identity.phone, identity.email);

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

    await this.repository.put(this.config.dynamodbUsersTableName, user);
    return toUserProfile(user);
  }

  async listUsers(
    actor: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<UserProfile[]> {
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

    return filtered
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map(toUserProfile);
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

    if (
      locationCodeInput &&
      actor.role !== 'ADMIN' &&
      actor.role !== 'CITIZEN' &&
      !this.authorizationService.canAccessLocationScope(
        actor,
        locationCodeInput,
      )
    ) {
      throw new ForbiddenException('locationCode is outside of your scope.');
    }

    await this.assertUniqueIdentity(
      identity.phone,
      identity.email,
      current.userId,
    );

    const nextUser: StoredUser = {
      ...current,
      GSI1SK: 'USER',
      phone: identity.phone,
      email: identity.email,
      fullName: fullName ?? current.fullName,
      unit: unit ?? current.unit,
      avatarUrl: avatarUrl ?? current.avatarUrl,
      locationCode: locationCodeInput
        ? ensureLocationCode(locationCodeInput)
        : current.locationCode,
      updatedAt: nowIso(),
    };

    await this.repository.put(this.config.dynamodbUsersTableName, nextUser);
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

    await this.repository.put(this.config.dynamodbUsersTableName, nextUser);
    return toUserProfile(nextUser);
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
