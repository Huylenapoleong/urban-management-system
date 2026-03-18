import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  AuthTokenPair,
  AuthenticatedUser,
  JwtClaims,
} from '@urban/shared-types';
import { AppConfigService } from '../config/app-config.service';

interface TokenPayload extends JwtClaims {
  iat: number;
  exp: number;
}

@Injectable()
export class JwtTokenService {
  constructor(private readonly config: AppConfigService) {}

  issueTokenPair(user: AuthenticatedUser, sessionId?: string): AuthTokenPair {
    return {
      accessToken: this.signToken(user, 'access', sessionId),
      refreshToken: this.signToken(user, 'refresh', sessionId),
      expiresIn: this.config.accessTokenTtlSeconds,
      refreshExpiresIn: this.config.refreshTokenTtlSeconds,
      tokenType: 'Bearer',
    };
  }

  verifyAccessToken(token: string): JwtClaims {
    return this.verifyToken(token, 'access');
  }

  verifyRefreshToken(token: string): JwtClaims {
    return this.verifyToken(token, 'refresh');
  }

  private signToken(
    user: AuthenticatedUser,
    tokenType: 'access' | 'refresh',
    sessionId?: string,
  ): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const ttl =
      tokenType === 'access'
        ? this.config.accessTokenTtlSeconds
        : this.config.refreshTokenTtlSeconds;
    const payload: TokenPayload = {
      sub: user.id,
      role: user.role,
      locationCode: user.locationCode,
      tokenType,
      sid: sessionId,
      iss: this.config.jwtIssuer,
      iat: issuedAt,
      exp: issuedAt + ttl,
    };
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url',
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = this.createSignature(unsignedToken, tokenType);

    return `${unsignedToken}.${signature}`;
  }

  private verifyToken(
    token: string,
    expectedType: 'access' | 'refresh',
  ): JwtClaims {
    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token.');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = this.createSignature(unsignedToken, expectedType);
    const providedBuffer = Buffer.from(encodedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Token signature is invalid.');
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as TokenPayload;

    if (
      payload.tokenType !== expectedType ||
      payload.iss !== this.config.jwtIssuer ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('Token has expired or is invalid.');
    }

    return payload;
  }

  private createSignature(
    unsignedToken: string,
    tokenType: 'access' | 'refresh',
  ): string {
    const secret =
      tokenType === 'access'
        ? this.config.accessTokenSecret
        : this.config.refreshTokenSecret;

    return createHmac('sha256', secret)
      .update(unsignedToken)
      .digest('base64url');
  }
}
