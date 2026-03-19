import type { Request } from 'express';

export interface SessionClientMetadata {
  userAgent?: string;
  ipAddress?: string;
  deviceId?: string;
  appVariant?: string;
}

type RequestLike = Pick<Request, 'headers' | 'ip' | 'socket'>;

export function extractSessionClientMetadata(
  request: RequestLike,
): SessionClientMetadata {
  const forwardedFor = readHeader(request.headers['x-forwarded-for'], 200);
  const ipAddress =
    forwardedFor?.split(',')[0]?.trim() ||
    trimValue(request.ip, 100) ||
    trimValue(request.socket?.remoteAddress, 100);

  return {
    userAgent: readHeader(request.headers['user-agent'], 500),
    ipAddress,
    deviceId: readHeader(request.headers['x-device-id'], 120),
    appVariant: readHeader(request.headers['x-app-variant'], 50),
  };
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
