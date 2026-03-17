import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { JwtClaims } from '@urban/shared-types';
import {
  makeUserPk,
  makeUserRefreshSessionSk,
  nowIso,
} from '@urban/shared-utils';
import type {
  StoredRefreshSession,
  StoredRefreshTokenRevocation,
} from '../../common/storage-records';
import { AppConfigService } from '../config/app-config.service';
import { UrbanTableRepository } from '../dynamodb/urban-table.repository';
import { JwtTokenService } from './jwt-token.service';

interface SessionRefreshResolution {
  claims: JwtClaims;
  legacy: false;
  session: StoredRefreshSession;
}

interface LegacyRefreshResolution {
  claims: JwtClaims;
  legacy: true;
}

export type RefreshTokenResolution =
  | SessionRefreshResolution
  | LegacyRefreshResolution;

@Injectable()
export class RefreshSessionService {
  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly jwtTokenService: JwtTokenService,
    private readonly config: AppConfigService,
  ) {}

  async persistIssuedRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<StoredRefreshSession> {
    const claims = this.jwtTokenService.verifyRefreshToken(refreshToken);

    if (claims.sub !== userId) {
      throw new UnauthorizedException('Refresh token subject is invalid.');
    }

    const session = this.buildSessionRecord(userId, claims, refreshToken);
    await this.repository.put(this.config.dynamodbUsersTableName, session);
    return session;
  }

  async resolveRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenResolution> {
    const claims = this.jwtTokenService.verifyRefreshToken(refreshToken);

    if (!claims.sid?.trim()) {
      await this.assertLegacyRefreshTokenIsUsable(claims.sub, refreshToken);
      return {
        claims,
        legacy: true,
      };
    }

    const session = await this.assertActiveSessionForClaims(claims);
    this.assertTokenMatches(session, refreshToken);

    return {
      claims,
      legacy: false,
      session,
    };
  }

  async assertActiveSessionForAccessToken(claims: JwtClaims): Promise<void> {
    if (!claims.sid?.trim()) {
      throw new UnauthorizedException(
        'Legacy access tokens are no longer accepted. Please refresh your session.',
      );
    }

    await this.assertActiveSessionForClaims(claims);
  }

  async rotateRefreshSession(
    currentSession: StoredRefreshSession,
    nextRefreshToken: string,
  ): Promise<StoredRefreshSession> {
    const claims = this.jwtTokenService.verifyRefreshToken(nextRefreshToken);

    if (claims.sub !== currentSession.userId) {
      throw new UnauthorizedException('Refresh token subject is invalid.');
    }

    const nextSession = this.buildSessionRecord(
      currentSession.userId,
      claims,
      nextRefreshToken,
    );
    const now = nowIso();
    const revokedSession: StoredRefreshSession = {
      ...currentSession,
      revokedAt: now,
      replacedBySessionId: nextSession.sessionId,
      updatedAt: now,
    };

    await this.repository.transactPut([
      {
        tableName: this.config.dynamodbUsersTableName,
        item: revokedSession,
        conditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      },
      {
        tableName: this.config.dynamodbUsersTableName,
        item: nextSession,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);

    return nextSession;
  }

  async migrateLegacyRefreshToken(
    userId: string,
    legacyRefreshToken: string,
    nextRefreshToken: string,
  ): Promise<StoredRefreshSession> {
    const legacyClaims =
      this.jwtTokenService.verifyRefreshToken(legacyRefreshToken);

    if (legacyClaims.sub !== userId) {
      throw new UnauthorizedException('Refresh token subject is invalid.');
    }

    if (legacyClaims.sid?.trim()) {
      throw new UnauthorizedException(
        'Refresh token is already session-based.',
      );
    }

    const revocation = this.buildLegacyRevocationRecord(
      userId,
      legacyRefreshToken,
      legacyClaims,
    );
    const nextClaims =
      this.jwtTokenService.verifyRefreshToken(nextRefreshToken);
    const nextSession = this.buildSessionRecord(
      userId,
      nextClaims,
      nextRefreshToken,
    );

    await this.repository.transactPut([
      {
        tableName: this.config.dynamodbUsersTableName,
        item: revocation,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        tableName: this.config.dynamodbUsersTableName,
        item: nextSession,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);

    return nextSession;
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    let claims: JwtClaims;

    try {
      claims = this.jwtTokenService.verifyRefreshToken(refreshToken);
    } catch {
      return;
    }

    if (!claims.sid?.trim()) {
      const existingRevocation = await this.getLegacyRevocation(
        claims.sub,
        refreshToken,
      );

      if (existingRevocation) {
        return;
      }

      await this.repository.put(
        this.config.dynamodbUsersTableName,
        this.buildLegacyRevocationRecord(claims.sub, refreshToken, claims),
      );
      return;
    }

    const session = await this.getSessionForClaims(claims, false);

    if (!session || session.revokedAt) {
      return;
    }

    this.assertTokenMatches(session, refreshToken, false);
    const now = nowIso();
    const nextSession: StoredRefreshSession = {
      ...session,
      revokedAt: now,
      updatedAt: now,
    };

    await this.repository.put(this.config.dynamodbUsersTableName, nextSession);
  }

  private async assertActiveSessionForClaims(
    claims: JwtClaims,
  ): Promise<StoredRefreshSession> {
    const session = await this.getSessionForClaims(claims);

    if (!session) {
      throw new UnauthorizedException(
        'Refresh token session is unavailable. Please sign in again.',
      );
    }

    if (session.revokedAt) {
      throw new UnauthorizedException(
        'Refresh token session has been revoked.',
      );
    }

    if (session.expiresAt <= nowIso()) {
      throw new UnauthorizedException('Refresh token session has expired.');
    }

    return session;
  }

  private buildSessionRecord(
    userId: string,
    claims: JwtClaims,
    refreshToken: string,
  ): StoredRefreshSession {
    const sessionId = this.requireSessionId(claims);
    const now = nowIso();

    return {
      PK: makeUserPk(userId),
      SK: makeUserRefreshSessionSk(sessionId),
      entityType: 'USER_REFRESH_SESSION',
      userId,
      sessionId,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private buildLegacyRevocationRecord(
    userId: string,
    refreshToken: string,
    claims: JwtClaims,
  ): StoredRefreshTokenRevocation {
    const tokenHash = this.hashToken(refreshToken);
    const now = nowIso();

    return {
      PK: makeUserPk(userId),
      SK: this.makeLegacyRefreshRevocationSk(tokenHash),
      entityType: 'USER_REFRESH_TOKEN_REVOCATION',
      userId,
      tokenHash,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      revokedAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  private async assertLegacyRefreshTokenIsUsable(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const revocation = await this.getLegacyRevocation(userId, refreshToken);

    if (!revocation) {
      return;
    }

    if (revocation.expiresAt > nowIso()) {
      throw new UnauthorizedException(
        'Legacy refresh token has already been migrated or revoked.',
      );
    }
  }

  private async getLegacyRevocation(
    userId: string,
    refreshToken: string,
  ): Promise<StoredRefreshTokenRevocation | undefined> {
    const tokenHash = this.hashToken(refreshToken);
    return this.repository.get<StoredRefreshTokenRevocation>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      this.makeLegacyRefreshRevocationSk(tokenHash),
    );
  }

  private async getSessionForClaims(
    claims: JwtClaims,
    required = true,
  ): Promise<StoredRefreshSession | undefined> {
    const sessionId = this.requireSessionId(claims);
    const session = await this.repository.get<StoredRefreshSession>(
      this.config.dynamodbUsersTableName,
      makeUserPk(claims.sub),
      makeUserRefreshSessionSk(sessionId),
    );

    if (!session && required) {
      throw new UnauthorizedException(
        'Refresh token session is unavailable. Please sign in again.',
      );
    }

    return session;
  }

  private requireSessionId(claims: JwtClaims): string {
    const sessionId = claims.sid?.trim();

    if (!sessionId) {
      throw new UnauthorizedException(
        'Refresh token session id is missing. Please refresh with a supported token.',
      );
    }

    return sessionId;
  }

  private assertTokenMatches(
    session: StoredRefreshSession,
    refreshToken: string,
    strict = true,
  ): void {
    const providedHash = Buffer.from(this.hashToken(refreshToken), 'hex');
    const storedHash = Buffer.from(session.tokenHash, 'hex');

    if (
      providedHash.length !== storedHash.length ||
      !timingSafeEqual(providedHash, storedHash)
    ) {
      if (strict) {
        throw new UnauthorizedException('Refresh token is invalid.');
      }
    }
  }

  private hashToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private makeLegacyRefreshRevocationSk(tokenHash: string): string {
    return `REVOKED_REFRESH#${tokenHash}`;
  }
}
