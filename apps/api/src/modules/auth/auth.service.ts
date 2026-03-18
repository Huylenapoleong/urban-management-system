import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthSessionInfo,
  AuthenticatedUser,
  JwtClaims,
} from '@urban/shared-types';
import {
  createUlid,
  normalizeEmail,
  normalizePhone,
  nowIso,
} from '@urban/shared-utils';
import { ensureObject, requiredString } from '../../common/validation';
import { JwtTokenService } from '../../infrastructure/security/jwt-token.service';
import { ObservabilityService } from '../../infrastructure/observability/observability.service';
import { PasswordService } from '../../infrastructure/security/password.service';
import {
  toAuthenticatedUser,
  toAuthSessionInfo,
  toUserProfile,
} from '../../common/mappers';
import type { StoredUser } from '../../common/storage-records';
import { UsersService } from '../users/users.service';
import { RefreshSessionService } from '../../infrastructure/security/refresh-session.service';
import { ChatRealtimeService } from '../conversations/chat-realtime.service';
import type { SessionClientMetadata } from '../../common/request-session-metadata';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly refreshSessionService: RefreshSessionService,
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  async register(payload: unknown, metadata?: SessionClientMetadata) {
    const user = await this.usersService.registerCitizen(payload);
    const storedUser = await this.usersService.getByIdOrThrow(user.id);
    const tokens = await this.issueTokenPairForUser(storedUser, metadata);

    return {
      tokens,
      user,
    };
  }

  async login(payload: unknown, metadata?: SessionClientMetadata) {
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
      tokens: await this.issueTokenPairForUser(user, metadata),
      user: toUserProfile(user),
    };
  }

  async refresh(payload: unknown, metadata?: SessionClientMetadata) {
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
        metadata,
      );
      this.observabilityService.recordSessionRevocations(
        'legacy_refresh_migration',
        1,
      );
    } else {
      await this.refreshSessionService.rotateRefreshSession(
        resolution.session,
        tokens.refreshToken,
        metadata,
      );
      this.chatRealtimeService.disconnectSessionSockets(
        resolution.session.sessionId,
      );
      this.observabilityService.recordSessionRevocations('refresh_rotation', 1);
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
    let claims: ReturnType<JwtTokenService['verifyRefreshToken']> | undefined;

    try {
      claims = this.jwtTokenService.verifyRefreshToken(refreshToken);
    } catch {
      claims = undefined;
    }

    await this.refreshSessionService.revokeRefreshToken(refreshToken);
    if (claims?.sub) {
      this.observabilityService.recordSessionRevocations('logout', 1);
    }

    if (claims?.sid?.trim()) {
      this.chatRealtimeService.disconnectSessionSockets(claims.sid);
    } else if (claims?.sub) {
      this.chatRealtimeService.disconnectUserSockets(claims.sub);
    }

    return {
      loggedOut: true,
    };
  }

  async listSessions(
    user: AuthenticatedUser,
    claims: JwtClaims,
  ): Promise<AuthSessionInfo[]> {
    this.assertActorClaims(user, claims);
    const currentSessionId = claims.sid?.trim() || undefined;
    const sessions = await this.refreshSessionService.listSessionsForUser(
      user.id,
    );
    const sessionInfos: AuthSessionInfo[] = sessions.map(
      (session): AuthSessionInfo =>
        toAuthSessionInfo(session, currentSessionId),
    );

    return sessionInfos.sort(
      (left: AuthSessionInfo, right: AuthSessionInfo): number => {
        if (left.isCurrent !== right.isCurrent) {
          return left.isCurrent ? -1 : 1;
        }

        if (Boolean(left.revokedAt) !== Boolean(right.revokedAt)) {
          return left.revokedAt ? 1 : -1;
        }

        const leftUsedAt = left.lastUsedAt || left.updatedAt || left.createdAt;
        const rightUsedAt =
          right.lastUsedAt || right.updatedAt || right.createdAt;
        return rightUsedAt.localeCompare(leftUsedAt);
      },
    );
  }

  async revokeSession(
    user: AuthenticatedUser,
    claims: JwtClaims,
    sessionId: string,
  ) {
    this.assertActorClaims(user, claims);
    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      throw new BadRequestException('sessionId is required.');
    }

    const session = await this.refreshSessionService.revokeSessionById(
      user.id,
      normalizedSessionId,
    );

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    this.chatRealtimeService.disconnectSessionSockets(normalizedSessionId);
    this.observabilityService.recordSessionRevocations('session_revoke', 1);

    return {
      sessionId: normalizedSessionId,
      revokedAt: session.revokedAt ?? session.updatedAt,
      currentSessionRevoked: claims.sid === normalizedSessionId,
    };
  }

  async logoutAll(user: AuthenticatedUser, claims: JwtClaims) {
    this.assertActorClaims(user, claims);
    const revokedAt = nowIso();
    const revokedSessionCount =
      await this.refreshSessionService.revokeAllSessionsForUser(user.id);

    this.chatRealtimeService.disconnectUserSockets(user.id);

    this.observabilityService.recordSessionRevocations(
      'logout_all',
      revokedSessionCount,
    );

    return {
      revokedSessionCount,
      revokedAt,
      currentSessionRevoked: Boolean(claims.sid?.trim()),
    };
  }

  async me(user: AuthenticatedUser) {
    if (!user?.id) {
      throw new BadRequestException('Authenticated user is required.');
    }

    return this.usersService.getUser(user, user.id);
  }

  private async issueTokenPairForUser(
    user: StoredUser,
    metadata?: SessionClientMetadata,
  ) {
    const sessionId = createUlid();
    const tokens = this.jwtTokenService.issueTokenPair(
      this.toAuthUser(user),
      sessionId,
    );

    await this.refreshSessionService.persistIssuedRefreshToken(
      user.userId,
      tokens.refreshToken,
      metadata,
    );

    return tokens;
  }

  private toAuthUser(user: StoredUser): AuthenticatedUser {
    return toAuthenticatedUser(user);
  }

  private assertActorClaims(user: AuthenticatedUser, claims: JwtClaims): void {
    if (!user?.id || !claims?.sub || user.id !== claims.sub) {
      throw new UnauthorizedException('Authenticated session is invalid.');
    }
  }
}
