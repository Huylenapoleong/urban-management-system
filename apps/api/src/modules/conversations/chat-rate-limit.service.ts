import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../infrastructure/config/app-config.service';

@Injectable()
export class ChatRateLimitService {
  private readonly messageBuckets = new Map<string, number[]>();

  constructor(private readonly config: AppConfigService) {}

  consumeMessageSend(userId: string): void {
    const maxPerWindow = this.config.chatMessageRateLimitMaxPerWindow;
    const windowSeconds = this.config.chatMessageRateLimitWindowSeconds;

    if (maxPerWindow <= 0 || windowSeconds <= 0) {
      return;
    }

    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const timestamps = (this.messageBuckets.get(userId) ?? []).filter(
      (timestamp) => now - timestamp < windowMs,
    );

    if (timestamps.length >= maxPerWindow) {
      const oldestTimestamp = timestamps[0] ?? now;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (now - oldestTimestamp)) / 1000),
      );

      this.messageBuckets.set(userId, timestamps);
      throw new HttpException(
        `Too many messages sent in a short time. Retry after ${retryAfterSeconds} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    timestamps.push(now);
    this.messageBuckets.set(userId, timestamps);
  }
}
