import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@urban/shared-types';
import {
  createUlid,
  normalizeEmail,
  normalizePhone,
} from '@urban/shared-utils';
import { ensureObject, requiredString } from '../../common/validation';
import { JwtTokenService } from '../../infrastructure/security/jwt-token.service';
import { PasswordService } from '../../infrastructure/security/password.service';
import { toAuthenticatedUser, toUserProfile } from '../../common/mappers';
import type { StoredUser } from '../../common/storage-records';
import { UsersService } from '../users/users.service';
import { RefreshSessionService } from '../../infrastructure/security/refresh-session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly refreshSessionService: RefreshSessionService,
  ) {}

  async register(payload: unknown) {
    const user = await this.usersService.registerCitizen(payload);
    const storedUser = await this.usersService.getByIdOrThrow(user.id);
    const tokens = await this.issueTokenPairForUser(storedUser);

    return {
      tokens,
      user,
    };
  }

  async login(payload: unknown) {
    const body = ensureObject(payload);
    const login = requiredString(body, 'login', {
      minLength: 3,
      maxLength: 150,
    });
    const password = requiredString(body, 'password', {
      minLength: 8,
      maxLength: 100,
    });
    const user = login.includes('@')
      ? await this.usersService.findByEmail(normalizeEmail(login))
      : await this.usersService.findByPhone(normalizePhone(login));

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const validPassword = await this.passwordService.verifyPassword(
      password,
      user.passwordHash,
    );

    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return {
      tokens: await this.issueTokenPairForUser(user),
      user: toUserProfile(user),
    };
  }

  async refresh(payload: unknown) {
    const body = ensureObject(payload);
    const refreshToken = requiredString(body, 'refreshToken', {
      minLength: 10,
      maxLength: 5000,
    });
    const resolution =
      await this.refreshSessionService.resolveRefreshToken(refreshToken);
    const user = await this.usersService.getByIdOrThrow(resolution.claims.sub);

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is unavailable.');
    }

    const nextSessionId = createUlid();
    const tokens = this.jwtTokenService.issueTokenPair(
      this.toAuthUser(user),
      nextSessionId,
    );
    if (resolution.legacy) {
      await this.refreshSessionService.migrateLegacyRefreshToken(
        user.userId,
        refreshToken,
        tokens.refreshToken,
      );
    } else {
      await this.refreshSessionService.rotateRefreshSession(
        resolution.session,
        tokens.refreshToken,
      );
    }

    return {
      tokens,
      user: toUserProfile(user),
    };
  }

  async logout(payload: unknown) {
    const body = ensureObject(payload);
    const refreshToken = requiredString(body, 'refreshToken', {
      minLength: 10,
      maxLength: 5000,
    });

    await this.refreshSessionService.revokeRefreshToken(refreshToken);

    return {
      loggedOut: true,
    };
  }

  async me(user: AuthenticatedUser) {
    if (!user?.id) {
      throw new BadRequestException('Authenticated user is required.');
    }

    return this.usersService.getUser(user, user.id);
  }

  private async issueTokenPairForUser(user: StoredUser) {
    const sessionId = createUlid();
    const tokens = this.jwtTokenService.issueTokenPair(
      this.toAuthUser(user),
      sessionId,
    );

    await this.refreshSessionService.persistIssuedRefreshToken(
      user.userId,
      tokens.refreshToken,
    );

    return tokens;
  }

  private toAuthUser(user: StoredUser): AuthenticatedUser {
    return toAuthenticatedUser(user);
  }
}
