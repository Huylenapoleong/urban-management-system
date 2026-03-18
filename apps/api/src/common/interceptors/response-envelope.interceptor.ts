import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiResponseMeta, ApiSuccessResponse } from '@urban/shared-types';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_RESPONSE_ENVELOPE_KEY } from '../decorators/skip-response-envelope.decorator';

@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T, ApiResponseMeta | undefined> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T, ApiResponseMeta | undefined> | T> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const skipEnvelope = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_ENVELOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipEnvelope) {
      return next.handle();
    }

    return next.handle().pipe(map((data) => this.wrap(data)));
  }

  private wrap(data: T): ApiSuccessResponse<T, ApiResponseMeta | undefined> {
    if (this.isSuccessEnvelope(data)) {
      return data;
    }

    if (Array.isArray(data)) {
      return {
        success: true,
        data,
        meta: {
          count: data.length,
        },
      } as ApiSuccessResponse<T, ApiResponseMeta>;
    }

    return {
      success: true,
      data,
    } as ApiSuccessResponse<T, undefined>;
  }

  private isSuccessEnvelope(
    value: unknown,
  ): value is ApiSuccessResponse<T, ApiResponseMeta | undefined> {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'success' in value &&
      'data' in value &&
      (value as { success?: unknown }).success === true,
    );
  }
}
