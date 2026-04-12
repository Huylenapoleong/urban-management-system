import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { SessionScope } from '@urban/shared-constants';
import type { JwtClaims } from '@urban/shared-types';
import {
  makeUserPk,
  makeUserRefreshSessionSk,
  makeUserSessionSlotSk,
  nowIso,
} from '@urban/shared-utils';
import type {
  StoredRefreshSession,
  StoredRefreshTokenRevocation,
  StoredUserSessionSlot,
} from '../../common/storage-records';
import { AppConfigService } from '../config/app-config.service';
import { UrbanTableRepository } from '../dynamodb/urban-table.repository';
import { JwtTokenService } from './jwt-token.service';
import {
  deriveSessionScope,
  type SessionClientMetadata,
} from '../../common/request-session-metadata';

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

export interface RefreshTokenRevocationResult {
  claims: JwtClaims;
  revoked: boolean;
  alreadyRevoked: boolean;
  legacy: boolean;
}

export interface PersistedRefreshSessionResult {
  session: StoredRefreshSession;
  replacedSessionId?: string;
}

interface ListSessionsOptions {
  includeDismissed?: boolean;
}

interface RevokeAllSessionsOptions {
  exceptSessionId?: string;
}

type TransactionWriteItem = Parameters<
  UrbanTableRepository['transactWrite']
>[0][number];

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
    metadata?: SessionClientMetadata,
  ): Promise<PersistedRefreshSessionResult> {
    const claims = this.jwtTokenService.verifyRefreshToken(refreshToken);

    if (claims.sub !== userId) {
      throw new UnauthorizedException('Refresh token subject is invalid.');
    }

    const session = this.buildSessionRecord(userId, claims, refreshToken, {
      metadata,
    });
    return this.persistSessionWithScope(session);
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
    metadata?: SessionClientMetadata,
  ): Promise<PersistedRefreshSessionResult> {
    const claims = this.jwtTokenService.verifyRefreshToken(nextRefreshToken);

    if (claims.sub !== currentSession.userId) {
      throw new UnauthorizedException('Refresh token subject is invalid.');
    }

    const nextSession = this.buildSessionRecord(
      currentSession.userId,
      claims,
      nextRefreshToken,
      {
        metadata,
        previousSession: currentSession,
      },
    );
    const now = nowIso();
    const revokedSession: StoredRefreshSession = {
      ...currentSession,
      lastUsedAt: currentSession.lastUsedAt ?? currentSession.updatedAt,
      revokedAt: now,
      replacedBySessionId: nextSession.sessionId,
      updatedAt: now,
    };
    const slot = await this.getSessionSlot(
      currentSession.userId,
      currentSession.sessionScope,
    );

    await this.repository.transactWrite([
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: revokedSession,
        conditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: nextSession,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: this.buildSessionSlotRecord(
          currentSession.userId,
          currentSession.sessionScope,
          nextSession.sessionId,
          slot?.createdAt,
        ),
        conditionExpression:
          'attribute_not_exists(PK) OR currentSessionId = :expectedCurrentSessionId',
        expressionAttributeValues: {
          ':expectedCurrentSessionId': currentSession.sessionId,
        },
      },
    ]);

    return {
      session: nextSession,
      replacedSessionId: currentSession.sessionId,
    };
  }

  async migrateLegacyRefreshToken(
    userId: string,
    legacyRefreshToken: string,
    nextRefreshToken: string,
    metadata?: SessionClientMetadata,
  ): Promise<PersistedRefreshSessionResult> {
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
      {
        metadata,
      },
    );

    return this.persistSessionWithScope(nextSession, [
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: revocation,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    ]);
  }

  async listSessionsForUser(
    userId: string,
    options: ListSessionsOptions = {},
  ): Promise<StoredRefreshSession[]> {
    const sessions = await this.repository.queryByPk<StoredRefreshSession>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      {
        beginsWith: 'SESSION#',
      },
    );

    return sessions
      .filter((session) => session.entityType === 'USER_REFRESH_SESSION')
      .filter((session) => options.includeDismissed || !session.dismissedAt)
      .map((session) => this.normalizeStoredSession(session));
  }

  async revokeSessionById(
    userId: string,
    sessionId: string,
  ): Promise<StoredRefreshSession | undefined> {
    const session = await this.repository.get<StoredRefreshSession>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      makeUserRefreshSessionSk(sessionId),
    );

    if (!session || session.entityType !== 'USER_REFRESH_SESSION') {
      return undefined;
    }

    const normalizedSession = this.normalizeStoredSession(session);

    if (normalizedSession.revokedAt) {
      await this.clearSessionSlotIfCurrent(normalizedSession);
      return {
        ...normalizedSession,
      };
    }

    const now = nowIso();
    const nextSession: StoredRefreshSession = {
      ...normalizedSession,
      revokedAt: now,
      updatedAt: now,
    };

    const transactionItems: TransactionWriteItem[] = [
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: nextSession,
        conditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      },
    ];
    const slot = await this.getSessionSlot(
      userId,
      normalizedSession.sessionScope,
    );

    if (slot?.currentSessionId === normalizedSession.sessionId) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: slot.PK,
          SK: slot.SK,
        },
        conditionExpression: 'currentSessionId = :expectedCurrentSessionId',
        expressionAttributeValues: {
          ':expectedCurrentSessionId': normalizedSession.sessionId,
        },
      });
    }

    await this.repository.transactWrite(transactionItems);
    return nextSession;
  }

  async revokeAllSessionsForUser(
    userId: string,
    options: RevokeAllSessionsOptions = {},
  ): Promise<number> {
    const sessions = await this.listSessionsForUser(userId);
    const slots = await this.listSessionSlotsForUser(userId);
    const exceptSessionId = options.exceptSessionId?.trim() || undefined;
    const revokedAt = nowIso();
    let revokedCount = 0;

    for (const session of sessions) {
      if (session.entityType !== 'USER_REFRESH_SESSION' || session.revokedAt) {
        continue;
      }

      const normalizedSession = this.normalizeStoredSession(session);
      if (exceptSessionId && normalizedSession.sessionId === exceptSessionId) {
        continue;
      }
      const nextSession: StoredRefreshSession = {
        ...normalizedSession,
        revokedAt,
        updatedAt: revokedAt,
      };

      await this.repository.put(
        this.config.dynamodbUsersTableName,
        nextSession,
      );
      revokedCount += 1;
    }

    for (const slot of slots) {
      if (exceptSessionId && slot.currentSessionId === exceptSessionId) {
        continue;
      }
      await this.repository.delete(
        this.config.dynamodbUsersTableName,
        slot.PK,
        slot.SK,
      );
    }

    return revokedCount;
  }

  async dismissSessionHistoryById(
    userId: string,
    sessionId: string,
  ): Promise<StoredRefreshSession | undefined> {
    const session = await this.repository.get<StoredRefreshSession>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      makeUserRefreshSessionSk(sessionId),
    );

    if (!session || session.entityType !== 'USER_REFRESH_SESSION') {
      return undefined;
    }

    const normalizedSession = this.normalizeStoredSession(session);

    if (!this.isSessionDismissible(normalizedSession)) {
      throw new UnauthorizedException(
        'Only revoked or expired sessions can be removed from history.',
      );
    }

    if (normalizedSession.dismissedAt) {
      return normalizedSession;
    }

    const dismissedAt = nowIso();
    const nextSession: StoredRefreshSession = {
      ...normalizedSession,
      dismissedAt,
      updatedAt: dismissedAt,
    };

    await this.repository.put(this.config.dynamodbUsersTableName, nextSession);
    return nextSession;
  }

  async revokeRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenRevocationResult> {
    const claims = this.jwtTokenService.verifyRefreshToken(refreshToken);

    if (!claims.sid?.trim()) {
      const existingRevocation = await this.getLegacyRevocation(
        claims.sub,
        refreshToken,
      );

      if (existingRevocation) {
        return {
          claims,
          revoked: false,
          alreadyRevoked: true,
          legacy: true,
        };
      }

      await this.repository.put(
        this.config.dynamodbUsersTableName,
        this.buildLegacyRevocationRecord(claims.sub, refreshToken, claims),
      );

      return {
        claims,
        revoked: true,
        alreadyRevoked: false,
        legacy: true,
      };
    }

    const session = await this.getSessionForClaims(claims);

    if (!session) {
      throw new UnauthorizedException(
        'Refresh token session is unavailable. Please sign in again.',
      );
    }

    const normalizedSession = this.normalizeStoredSession(session);
    this.assertTokenMatches(normalizedSession, refreshToken);

    if (normalizedSession.revokedAt) {
      await this.clearSessionSlotIfCurrent(normalizedSession);
      return {
        claims,
        revoked: false,
        alreadyRevoked: true,
        legacy: false,
      };
    }

    const now = nowIso();
    const nextSession: StoredRefreshSession = {
      ...normalizedSession,
      revokedAt: now,
      updatedAt: now,
    };

    const transactionItems: TransactionWriteItem[] = [
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: nextSession,
        conditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      },
    ];
    const slot = await this.getSessionSlot(
      normalizedSession.userId,
      normalizedSession.sessionScope,
    );

    if (slot?.currentSessionId === normalizedSession.sessionId) {
      transactionItems.push({
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: slot.PK,
          SK: slot.SK,
        },
        conditionExpression: 'currentSessionId = :expectedCurrentSessionId',
        expressionAttributeValues: {
          ':expectedCurrentSessionId': normalizedSession.sessionId,
        },
      });
    }

    await this.repository.transactWrite(transactionItems);

    return {
      claims,
      revoked: true,
      alreadyRevoked: false,
      legacy: false,
    };
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

    return this.normalizeStoredSession(session);
  }

  private async persistSessionWithScope(
    session: StoredRefreshSession,
    additionalWrites: TransactionWriteItem[] = [],
  ): Promise<PersistedRefreshSessionResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.persistSessionWithScopeOnce(
          session,
          additionalWrites,
        );
      } catch (error) {
        if (!this.isSessionScopeConflictError(error) || attempt === 1) {
          throw error;
        }
      }
    }

    return {
      session,
    };
  }

  private async persistSessionWithScopeOnce(
    session: StoredRefreshSession,
    additionalWrites: TransactionWriteItem[] = [],
  ): Promise<PersistedRefreshSessionResult> {
    const slot = await this.getSessionSlot(
      session.userId,
      session.sessionScope,
    );
    const existingSessionId = slot?.currentSessionId?.trim();
    const transactionItems: TransactionWriteItem[] = [
      ...additionalWrites,
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: session,
        conditionExpression:
          'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
      {
        kind: 'put',
        tableName: this.config.dynamodbUsersTableName,
        item: this.buildSessionSlotRecord(
          session.userId,
          session.sessionScope,
          session.sessionId,
          slot?.createdAt,
        ),
        conditionExpression: existingSessionId
          ? 'currentSessionId = :expectedCurrentSessionId'
          : 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        expressionAttributeValues: existingSessionId
          ? {
              ':expectedCurrentSessionId': existingSessionId,
            }
          : undefined,
      },
    ];

    if (existingSessionId && existingSessionId !== session.sessionId) {
      const existingSession = await this.repository.get<StoredRefreshSession>(
        this.config.dynamodbUsersTableName,
        makeUserPk(session.userId),
        makeUserRefreshSessionSk(existingSessionId),
      );

      if (
        existingSession &&
        existingSession.entityType === 'USER_REFRESH_SESSION' &&
        !existingSession.revokedAt
      ) {
        const revokedExistingSession: StoredRefreshSession = {
          ...this.normalizeStoredSession(existingSession),
          revokedAt: session.createdAt,
          replacedBySessionId: session.sessionId,
          updatedAt: session.createdAt,
        };

        transactionItems.unshift({
          kind: 'put',
          tableName: this.config.dynamodbUsersTableName,
          item: revokedExistingSession,
          conditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        });
      }
    }

    await this.repository.transactWrite(transactionItems);

    return {
      session,
      replacedSessionId:
        existingSessionId && existingSessionId !== session.sessionId
          ? existingSessionId
          : undefined,
    };
  }

  private async getSessionSlot(
    userId: string,
    sessionScope: SessionScope,
  ): Promise<StoredUserSessionSlot | undefined> {
    const slot = await this.repository.get<StoredUserSessionSlot>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      makeUserSessionSlotSk(sessionScope),
    );

    if (!slot || slot.entityType !== 'USER_SESSION_SLOT') {
      return undefined;
    }

    return slot;
  }

  private async listSessionSlotsForUser(
    userId: string,
  ): Promise<StoredUserSessionSlot[]> {
    const slots = await this.repository.queryByPk<StoredUserSessionSlot>(
      this.config.dynamodbUsersTableName,
      makeUserPk(userId),
      {
        beginsWith: 'SESSION_SLOT#',
      },
    );

    return slots.filter((slot) => slot.entityType === 'USER_SESSION_SLOT');
  }

  private buildSessionSlotRecord(
    userId: string,
    sessionScope: SessionScope,
    currentSessionId: string,
    createdAt = nowIso(),
  ): StoredUserSessionSlot {
    const updatedAt = nowIso();

    return {
      PK: makeUserPk(userId),
      SK: makeUserSessionSlotSk(sessionScope),
      entityType: 'USER_SESSION_SLOT',
      userId,
      sessionScope,
      currentSessionId,
      createdAt,
      updatedAt,
    };
  }

  private async clearSessionSlotIfCurrent(
    session: StoredRefreshSession,
  ): Promise<void> {
    const slot = await this.getSessionSlot(
      session.userId,
      session.sessionScope,
    );

    if (!slot || slot.currentSessionId !== session.sessionId) {
      return;
    }

    await this.repository.transactWrite([
      {
        kind: 'delete',
        tableName: this.config.dynamodbUsersTableName,
        key: {
          PK: slot.PK,
          SK: slot.SK,
        },
        conditionExpression: 'currentSessionId = :expectedCurrentSessionId',
        expressionAttributeValues: {
          ':expectedCurrentSessionId': session.sessionId,
        },
      },
    ]);
  }

  private buildSessionRecord(
    userId: string,
    claims: JwtClaims,
    refreshToken: string,
    options: {
      metadata?: SessionClientMetadata;
      previousSession?: StoredRefreshSession;
    } = {},
  ): StoredRefreshSession {
    const sessionId = this.requireSessionId(claims);
    const now = nowIso();
    const metadata = this.resolveSessionMetadata(
      options.metadata,
      options.previousSession,
    );

    return {
      PK: makeUserPk(userId),
      SK: makeUserRefreshSessionSk(sessionId),
      entityType: 'USER_REFRESH_SESSION',
      userId,
      sessionId,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      dismissedAt: null,
      revokedAt: null,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      deviceId: metadata.deviceId,
      appVariant: metadata.appVariant,
      sessionScope: metadata.sessionScope ?? 'UNKNOWN',
      lastUsedAt: now,
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

    return session ? this.normalizeStoredSession(session) : session;
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

  private normalizeStoredSession(
    session: StoredRefreshSession,
  ): StoredRefreshSession {
    const userAgent = session.userAgent;
    const appVariant = session.appVariant;

    return {
      ...session,
      sessionScope:
        session.sessionScope ??
        deriveSessionScope({
          userAgent,
          appVariant,
        }),
      dismissedAt: session.dismissedAt ?? null,
      lastUsedAt: session.lastUsedAt ?? session.updatedAt ?? session.createdAt,
    };
  }

  private isSessionDismissible(session: StoredRefreshSession): boolean {
    return Boolean(session.revokedAt) || session.expiresAt <= nowIso();
  }

  private hashToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private makeLegacyRefreshRevocationSk(tokenHash: string): string {
    return `REVOKED_REFRESH#${tokenHash}`;
  }

  private resolveSessionMetadata(
    metadata?: SessionClientMetadata,
    previousSession?: StoredRefreshSession,
  ): SessionClientMetadata {
    const userAgent = metadata?.userAgent ?? previousSession?.userAgent;
    const appVariant = metadata?.appVariant ?? previousSession?.appVariant;

    return {
      userAgent,
      ipAddress: metadata?.ipAddress ?? previousSession?.ipAddress,
      deviceId: metadata?.deviceId ?? previousSession?.deviceId,
      appVariant,
      sessionScope:
        previousSession?.sessionScope ??
        metadata?.sessionScope ??
        deriveSessionScope({
          userAgent,
          appVariant,
        }),
    };
  }

  private isSessionScopeConflictError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /conditional|transaction cancell?ed/i.test(error.message);
  }
}
