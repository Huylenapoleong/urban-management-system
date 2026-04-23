import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { nowIso } from '@urban/shared-utils';
import type { createClient } from 'redis';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { RealtimeRedisService } from '../../infrastructure/realtime/realtime-redis.service';
import type { ResolvedConversationAccess } from './conversations.service';

type ChatCallSessionStatus = 'RINGING' | 'ACTIVE';

interface ChatCallSession {
  acceptedByUserIds: string[];
  acceptedAt: string | null;
  conversationId: string;
  conversationKey: string;
  createdAt: string;
  endedByUserIds: string[];
  initiatedByUserId: string;
  isGroup: boolean;
  isVideo: boolean;
  participantUserIds: string[];
  rejectedByUserIds: string[];
  status: ChatCallSessionStatus;
  updatedAt: string;
}

interface MemoryChatCallSessionEntry {
  expiresAtMs: number;
  session: ChatCallSession;
}

interface ChatCallTransitionResult {
  session?: ChatCallSession;
  shouldEmit: boolean;
}

export interface ChatCallSessionAccess {
  conversationId: string;
  conversationKey: string;
  isGroup: boolean;
  participants: string[];
}

@Injectable()
export class ChatCallSessionService {
  private readonly logger = new Logger(ChatCallSessionService.name);
  private readonly memorySessions = new Map<
    string,
    MemoryChatCallSessionEntry
  >();
  private redisFallbackLogged = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly realtimeRedisService: RealtimeRedisService,
  ) {}

  async initiateCall(
    access: ResolvedConversationAccess,
    callerUserId: string,
    isVideo: boolean,
  ): Promise<ChatCallTransitionResult> {
    const existingSession = await this.getSession(access.conversationKey);

    if (existingSession) {
      throw new ConflictException(
        'Another call is already active in this conversation.',
      );
    }

    const createdAt = nowIso();
    const session: ChatCallSession = {
      acceptedByUserIds: access.isGroup ? [callerUserId] : [],
      acceptedAt: null,
      conversationId: access.conversationId,
      conversationKey: access.conversationKey,
      createdAt,
      endedByUserIds: [],
      initiatedByUserId: callerUserId,
      isGroup: access.isGroup,
      isVideo,
      participantUserIds: Array.from(new Set(access.participants)),
      rejectedByUserIds: [],
      status: 'RINGING',
      updatedAt: createdAt,
    };

    const created = await this.createSessionIfAbsent(
      session,
      this.config.chatCallInviteTtlSeconds,
    );

    if (!created) {
      const concurrentSession = await this.getSession(access.conversationKey);

      throw new ConflictException(
        'Another call is already active in this conversation.',
      );
    }

    return {
      shouldEmit: true,
      session,
    };
  }

  async acceptCall(
    access: ResolvedConversationAccess,
    calleeUserId: string,
  ): Promise<ChatCallTransitionResult> {
    const session = await this.requireSession(access.conversationKey);

    if (!session.isGroup && session.initiatedByUserId === calleeUserId) {
      throw new BadRequestException(
        'The caller cannot accept their own direct call.',
      );
    }

    if (!session.participantUserIds.includes(calleeUserId)) {
      throw new ConflictException(
        'This user is not part of the active call session.',
      );
    }

    if (session.acceptedByUserIds.includes(calleeUserId)) {
      return {
        shouldEmit: false,
        session,
      };
    }

    const acceptedAt = session.acceptedAt ?? nowIso();
    session.acceptedByUserIds = Array.from(
      new Set([...session.acceptedByUserIds, calleeUserId]),
    );
    session.acceptedAt = acceptedAt;
    session.endedByUserIds = session.endedByUserIds.filter(
      (userId) => userId !== calleeUserId,
    );
    session.rejectedByUserIds = session.rejectedByUserIds.filter(
      (userId) => userId !== calleeUserId,
    );
    session.status = 'ACTIVE';
    session.updatedAt = nowIso();

    await this.persistSession(session, this.config.chatCallActiveTtlSeconds);

    return {
      shouldEmit: true,
      session,
    };
  }

  async rejectCall(
    access: ResolvedConversationAccess,
    calleeUserId: string,
  ): Promise<ChatCallTransitionResult> {
    const session = await this.getSession(access.conversationKey);

    if (!session) {
      return { shouldEmit: false };
    }

    if (!session.isGroup && session.initiatedByUserId === calleeUserId) {
      throw new BadRequestException(
        'The caller must end their direct call instead of rejecting it.',
      );
    }

    if (!session.participantUserIds.includes(calleeUserId)) {
      throw new ConflictException(
        'This user is not part of the active call session.',
      );
    }

    if (!session.isGroup) {
      await this.deleteSession(access.conversationKey);
      return {
        shouldEmit: true,
        session,
      };
    }

    if (session.rejectedByUserIds.includes(calleeUserId)) {
      return {
        shouldEmit: false,
        session,
      };
    }

    session.rejectedByUserIds = Array.from(
      new Set([...session.rejectedByUserIds, calleeUserId]),
    );
    session.acceptedByUserIds = session.acceptedByUserIds.filter(
      (userId) => userId !== calleeUserId,
    );
    session.updatedAt = nowIso();

    const ttlSeconds =
      session.status === 'ACTIVE'
        ? this.config.chatCallActiveTtlSeconds
        : this.config.chatCallInviteTtlSeconds;
    await this.persistSession(session, ttlSeconds);

    return {
      shouldEmit: true,
      session,
    };
  }

  async endCall(
    access: ResolvedConversationAccess,
    userId: string,
  ): Promise<ChatCallTransitionResult> {
    const session = await this.getSession(access.conversationKey);

    if (!session) {
      return { shouldEmit: false };
    }

    if (!session.participantUserIds.includes(userId)) {
      throw new ConflictException(
        'This user is not part of the active call session.',
      );
    }

    if (!session.isGroup) {
      await this.deleteSession(access.conversationKey);

      return {
        shouldEmit: true,
        session,
      };
    }

    if (session.endedByUserIds.includes(userId)) {
      return {
        shouldEmit: false,
        session,
      };
    }

    session.acceptedByUserIds = session.acceptedByUserIds.filter(
      (participantId) => participantId !== userId,
    );
    session.rejectedByUserIds = session.rejectedByUserIds.filter(
      (participantId) => participantId !== userId,
    );
    session.endedByUserIds = Array.from(
      new Set([...session.endedByUserIds, userId]),
    );

    if (session.acceptedByUserIds.length === 0) {
      await this.deleteSession(access.conversationKey);

      return {
        shouldEmit: true,
        session,
      };
    }

    session.updatedAt = nowIso();
    await this.persistSession(session, this.config.chatCallActiveTtlSeconds);

    return {
      shouldEmit: true,
      session,
    };
  }

  async touchSignalingSession(
    access: ResolvedConversationAccess,
    userId: string,
  ): Promise<ChatCallSession> {
    const session = await this.requireSession(access.conversationKey);

    if (!session.participantUserIds.includes(userId)) {
      throw new ConflictException(
        'This user is not part of the active call session.',
      );
    }

    if (session.status !== 'ACTIVE') {
      throw new ConflictException('The call has not been accepted yet.');
    }

    if (session.isGroup && !session.acceptedByUserIds.includes(userId)) {
      throw new ConflictException(
        'Only accepted participants can exchange media for this call.',
      );
    }

    session.updatedAt = nowIso();
    await this.persistSession(session, this.config.chatCallActiveTtlSeconds);
    return session;
  }

  async listMediaRecipientUserIds(
    conversationKey: string,
    actorUserId: string,
  ): Promise<string[] | undefined> {
    const session = await this.getSession(conversationKey);

    if (!session) {
      return undefined;
    }

    const recipients = (
      session.isGroup ? session.acceptedByUserIds : session.participantUserIds
    ).filter((userId) => userId !== actorUserId);

    return Array.from(new Set(recipients));
  }

  async getDirectSessionAccess(
    conversationKey: string,
    actorUserId: string,
  ): Promise<ChatCallSessionAccess | undefined> {
    const session = await this.getSession(conversationKey);

    if (!session || session.isGroup) {
      return undefined;
    }

    if (!session.participantUserIds.includes(actorUserId)) {
      return undefined;
    }

    return {
      conversationId: session.conversationId,
      conversationKey: session.conversationKey,
      isGroup: false,
      participants: [...session.participantUserIds],
    };
  }

  private async requireSession(
    conversationKey: string,
  ): Promise<ChatCallSession> {
    const session = await this.getSession(conversationKey);

    if (!session) {
      throw new ConflictException(
        'There is no active call for this conversation.',
      );
    }

    return session;
  }

  private async getSession(
    conversationKey: string,
  ): Promise<ChatCallSession | undefined> {
    const redisClient = this.getRedisClient();

    if (redisClient) {
      const serializedSession = await redisClient.get(
        this.makeSessionKey(conversationKey),
      );

      if (!serializedSession) {
        return undefined;
      }

      return this.parseSerializedSession(conversationKey, serializedSession);
    }

    const entry = this.memorySessions.get(conversationKey);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAtMs <= Date.now()) {
      this.memorySessions.delete(conversationKey);
      return undefined;
    }

    return entry.session;
  }

  private async createSessionIfAbsent(
    session: ChatCallSession,
    ttlSeconds: number,
  ): Promise<boolean> {
    const redisClient = this.getRedisClient();

    if (redisClient) {
      const result = await redisClient.set(
        this.makeSessionKey(session.conversationKey),
        JSON.stringify(session),
        {
          EX: ttlSeconds,
          NX: true,
        },
      );

      return result === 'OK';
    }

    const existingSession = await this.getSession(session.conversationKey);

    if (existingSession) {
      return false;
    }

    this.memorySessions.set(session.conversationKey, {
      expiresAtMs: Date.now() + ttlSeconds * 1000,
      session,
    });
    return true;
  }

  private async persistSession(
    session: ChatCallSession,
    ttlSeconds: number,
  ): Promise<void> {
    const redisClient = this.getRedisClient();

    if (redisClient) {
      await redisClient.set(
        this.makeSessionKey(session.conversationKey),
        JSON.stringify(session),
        {
          EX: ttlSeconds,
        },
      );
      return;
    }

    this.memorySessions.set(session.conversationKey, {
      expiresAtMs: Date.now() + ttlSeconds * 1000,
      session,
    });
  }

  private async deleteSession(conversationKey: string): Promise<void> {
    const redisClient = this.getRedisClient();

    if (redisClient) {
      await redisClient.del(this.makeSessionKey(conversationKey));
      return;
    }

    this.memorySessions.delete(conversationKey);
  }

  private parseSerializedSession(
    conversationKey: string,
    serializedSession: string,
  ): ChatCallSession | undefined {
    try {
      const parsed = JSON.parse(serializedSession) as Partial<ChatCallSession>;

      if (
        (parsed.acceptedAt !== null && typeof parsed.acceptedAt !== 'string') ||
        typeof parsed.conversationId !== 'string' ||
        typeof parsed.conversationKey !== 'string' ||
        typeof parsed.createdAt !== 'string' ||
        (!Array.isArray(parsed.endedByUserIds) &&
          parsed.endedByUserIds !== undefined) ||
        typeof parsed.initiatedByUserId !== 'string' ||
        typeof parsed.isGroup !== 'boolean' ||
        typeof parsed.isVideo !== 'boolean' ||
        !Array.isArray(parsed.participantUserIds) ||
        !Array.isArray(parsed.acceptedByUserIds) ||
        !Array.isArray(parsed.rejectedByUserIds) ||
        (parsed.status !== 'RINGING' && parsed.status !== 'ACTIVE') ||
        typeof parsed.updatedAt !== 'string'
      ) {
        throw new Error('Call session payload is invalid.');
      }

      return {
        acceptedByUserIds: parsed.acceptedByUserIds.filter(
          (userId): userId is string => typeof userId === 'string',
        ),
        acceptedAt: parsed.acceptedAt ?? null,
        conversationId: parsed.conversationId,
        conversationKey: parsed.conversationKey,
        createdAt: parsed.createdAt,
        endedByUserIds: Array.isArray(parsed.endedByUserIds)
          ? parsed.endedByUserIds.filter(
              (userId): userId is string => typeof userId === 'string',
            )
          : [],
        initiatedByUserId: parsed.initiatedByUserId,
        isGroup: parsed.isGroup,
        isVideo: parsed.isVideo,
        participantUserIds: parsed.participantUserIds.filter(
          (userId): userId is string => typeof userId === 'string',
        ),
        rejectedByUserIds: parsed.rejectedByUserIds.filter(
          (userId): userId is string => typeof userId === 'string',
        ),
        status: parsed.status,
        updatedAt: parsed.updatedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.logger.warn(
        `Discarding invalid chat call session for ${conversationKey}: ${message}`,
      );
      void this.deleteSession(conversationKey);
      return undefined;
    }
  }

  private getRedisClient(): ReturnType<typeof createClient> | undefined {
    const client = this.realtimeRedisService.getClient();

    if (client) {
      return client;
    }

    if (this.realtimeRedisService.enabled && !this.redisFallbackLogged) {
      this.redisFallbackLogged = true;
      this.logger.warn(
        'Redis realtime client is unavailable. Falling back to in-memory call session tracking.',
      );
    }

    return undefined;
  }

  private makeSessionKey(conversationKey: string): string {
    return `${this.config.redisKeyPrefix}:chat:call-session:${conversationKey}`;
  }
}
