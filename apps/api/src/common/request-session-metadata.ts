import type { Request } from 'express';
import type { SessionScope } from '@urban/shared-constants';

export interface SessionClientMetadata {
  userAgent?: string;
  ipAddress?: string;
  deviceId?: string;
  appVariant?: string;
  sessionScope?: SessionScope;
}

type RequestLike = Pick<Request, 'headers' | 'ip'> & {
  socket?: {
    remoteAddress?: string | null;
  };
};

export function extractSessionClientMetadata(
  request: RequestLike,
): SessionClientMetadata {
  const userAgent = readHeader(request.headers['user-agent'], 500);
  const appVariant = readHeader(request.headers['x-app-variant'], 50);
  const forwardedFor = readHeader(request.headers['x-forwarded-for'], 200);
  const ipAddress =
    forwardedFor?.split(',')[0]?.trim() ||
    trimValue(request.ip, 100) ||
    trimValue(request.socket?.remoteAddress, 100);

  return {
    userAgent,
    ipAddress,
    deviceId: readHeader(request.headers['x-device-id'], 120),
    appVariant,
    sessionScope: deriveSessionScope({
      userAgent,
      appVariant,
    }),
  };
}

export function deriveSessionScope(input: {
  userAgent?: string;
  appVariant?: string;
}): SessionScope {
  const appVariant = input.appVariant?.trim().toLowerCase();
  const userAgent = input.userAgent?.trim().toLowerCase();
  const isMobileUserAgent =
    typeof userAgent === 'string' &&
    /android|iphone|ipad|ipod|mobile|ios|blackberry|iemobile|opera mini/i.test(
      userAgent,
    );
  const isBrowserLikeUserAgent =
    typeof userAgent === 'string' &&
    /mozilla\/|applewebkit\/|chrome\/|safari\/|firefox\/|edg\/|opr\//i.test(
      userAgent,
    );
  const isNativeAppLikeUserAgent =
    typeof userAgent === 'string' &&
    /okhttp\/|cfnetwork\/|darwin\/|reactnative|react-native|expo|expo-go|dalvik\//i.test(
      userAgent,
    );

  if (isNativeAppVariant(appVariant)) {
    return 'MOBILE_APP';
  }

  if (isWebAppVariant(appVariant)) {
    return isMobileUserAgent ? 'WEB_MOBILE' : 'WEB_DESKTOP';
  }

  if (isNativeAppLikeUserAgent) {
    return 'MOBILE_APP';
  }

  if (isBrowserLikeUserAgent) {
    return isMobileUserAgent ? 'WEB_MOBILE' : 'WEB_DESKTOP';
  }

  if (isMobileUserAgent) {
    return 'WEB_MOBILE';
  }

  if (userAgent) {
    return 'WEB_DESKTOP';
  }

  return 'UNKNOWN';
}

function isNativeAppVariant(appVariant?: string): boolean {
  if (!appVariant) {
    return false;
  }

  return /(^|[-_])(mobile-app|native|react-native|expo|ios-app|android-app)([-_]|$)/i.test(
    appVariant,
  );
}

function isWebAppVariant(appVariant?: string): boolean {
  if (!appVariant) {
    return false;
  }

  return /(^|[-_])(web|browser|admin-web|citizen-web|mobile-web)([-_]|$)/i.test(
    appVariant,
  );
}

function readHeader(
  value: string | string[] | undefined,
  maxLength: number,
): string | undefined {
  if (Array.isArray(value)) {
    return trimValue(value[0], maxLength);
  }

  return trimValue(value, maxLength);
}

function trimValue(
  value: string | null | undefined,
  maxLength: number,
): string | undefined {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength);
}
