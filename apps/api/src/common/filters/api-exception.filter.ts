import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ApiErrorPayload, ApiErrorResponse } from '@urban/shared-types';
import type { Request, Response } from 'express';

type HttpRequestWithObservability = Request & {
  requestId?: string;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      if (exception instanceof Error) {
        console.error(exception);
      } else {
        console.error('Unhandled non-HTTP exception', exception);
      }

      return;
    }

    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<HttpRequestWithObservability>();
    const payload = this.normalizeException(exception);

    if (payload.statusCode >= 500) {
      this.logServerException(exception, request.requestId);
    }

    response.status(payload.statusCode).json({
      success: false,
      error: payload,
      path: request.originalUrl || request.url,
      timestamp: new Date().toISOString(),
      requestId: request.requestId,
    } satisfies ApiErrorResponse);
  }

  private logServerException(exception: unknown, requestId?: string): void {
    if (exception instanceof Error) {
      const detail = (exception as Error & { detail?: unknown }).detail;
      const message =
        typeof detail === 'string' && detail ? detail : exception.message;

      console.error(
        requestId ? `[requestId=${requestId}] ${message}` : message,
      );
      return;
    }

    console.error(
      requestId
        ? `[requestId=${requestId}] Unhandled server exception`
        : 'Unhandled server exception',
      exception,
    );
  }

  private normalizeException(exception: unknown): ApiErrorPayload {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const fallbackError = HttpStatus[statusCode] ?? 'Error';

      if (typeof exceptionResponse === 'string') {
        return {
          statusCode,
          message: exceptionResponse,
          error: fallbackError,
        };
      }

      if (exceptionResponse && typeof exceptionResponse === 'object') {
        const responseObject = exceptionResponse as {
          error?: unknown;
          message?: unknown;
        };

        return {
          statusCode,
          message:
            typeof responseObject.message === 'string' ||
            Array.isArray(responseObject.message)
              ? responseObject.message
              : exception.message,
          error:
            typeof responseObject.error === 'string'
              ? responseObject.error
              : fallbackError,
        };
      }

      return {
        statusCode,
        message: exception.message,
        error: fallbackError,
      };
    }

    if (exception instanceof Error) {
      console.error(exception);
    } else {
      console.error('Unhandled exception', exception);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.',
      error: 'Internal Server Error',
    };
  }
}
