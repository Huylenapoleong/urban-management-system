import { Injectable, UnauthorizedException } from '@nestjs/common';
import { makeUserPk, makeUserProfileSk } from '@urban/shared-utils';
import type { AuthenticatedUser, JwtClaims } from '@urban/shared-types';
import type { Socket } from 'socket.io';
import { toAuthenticatedUser } from '../../common/mappers';
import type { StoredUser } from '../../common/storage-records';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { JwtTokenService } from '../../infrastructure/security/jwt-token.service';
import { RefreshSessionService } from '../../infrastructure/security/refresh-session.service';

export interface SocketAuthenticationContext {
  claims: JwtClaims;
  sessionId?: string;
  token: string;
  user: AuthenticatedUser;
}

@Injectable()
export class ChatSocketAuthService {
  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly repository: UrbanTableRepository,
    private readonly config: AppConfigService,
    private readonly refreshSessionService: RefreshSessionService,
  ) {}

  async authenticate(client: Socket): Promise<SocketAuthenticationContext> {
    const token = this.extractToken(client);
    const claims = this.jwtTokenService.verifyAccessToken(token);
    await this.refreshSessionService.assertActiveSessionForAccessToken(claims);
    const user = await this.repository.get<StoredUser>(
      this.config.dynamodbUsersTableName,
      makeUserPk(claims.sub),
      makeUserProfileSk(),
    );

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is unavailable.');
    }

    return {
      claims,
      sessionId: claims.sid?.trim() || undefined,
      token,
      user: toAuthenticatedUser(user),
    };
  }

  private extractToken(client: Socket): string {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const authToken =
      this.pickString(auth?.token) ?? this.pickString(auth?.accessToken);
    const headerToken = this.extractBearerToken(
      this.pickString(client.handshake.headers.authorization),
    );
    const queryToken =
      this.extractBearerToken(this.pickString(client.handshake.query.token)) ??
      this.extractBearerToken(
        this.pickString(client.handshake.query.accessToken),
      );

    const token = authToken ?? headerToken ?? queryToken;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return this.extractBearerToken(token) ?? token;
  }

  private extractBearerToken(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.startsWith('Bearer ')
      ? value.slice('Bearer '.length).trim()
      : value.trim();
  }

  private pickString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      return value
        .find(
          (entry): entry is string =>
            typeof entry === 'string' && !!entry.trim(),
        )
        ?.trim();
    }

    return undefined;
  }
}
