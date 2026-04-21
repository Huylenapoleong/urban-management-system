import { CanActivate, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { makeUserPk, makeUserProfileSk } from '@urban/shared-utils';
import type { AuthenticatedUser } from '@urban/shared-types';
import { toAuthenticatedUser } from '../mappers';
import type { StoredUser } from '../storage-records';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { MediaAssetService } from '../../infrastructure/storage/media-asset.service';
import { JwtTokenService } from '../../infrastructure/security/jwt-token.service';
import { RefreshSessionService } from '../../infrastructure/security/refresh-session.service';
import { ChatPresenceService } from '../../infrastructure/realtime/chat-presence.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
    private readonly repository: UrbanTableRepository,
    private readonly config: AppConfigService,
    private readonly refreshSessionService: RefreshSessionService,
    private readonly mediaAssetService: MediaAssetService,
    private readonly chatPresenceService: ChatPresenceService,
  ) {}

  async canActivate(
    context: import('@nestjs/common').ExecutionContext,
  ): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthenticatedUser;
      authClaims?: import('@urban/shared-types').JwtClaims;
    }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const token = authHeader.slice('Bearer '.length);
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

    request.user = await this.mediaAssetService.resolveAvatarFields(
      toAuthenticatedUser(user),
    );
    request.authClaims = claims;
    await this.chatPresenceService.recordHttpActivity(user.userId);
    return true;
  }
}
