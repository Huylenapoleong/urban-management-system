import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErrorResponseDto } from './swagger.models';

type SupportedErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 503;

interface ErrorExampleInput {
  name: string;
  summary: string;
  message: string | string[];
  path: string;
  description?: string;
  requestId?: string;
}

const STATUS_ERROR_LABELS: Record<SupportedErrorStatus, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

function buildErrorExampleValue(
  statusCode: SupportedErrorStatus,
  input: ErrorExampleInput,
) {
  return {
    success: false,
    error: {
      statusCode,
      message: input.message,
      error: STATUS_ERROR_LABELS[statusCode],
    },
    path: input.path,
    timestamp: '2026-04-14T10:00:00.000Z',
    requestId: input.requestId ?? '01KPRDOCS0000000000000000',
  };
}

function buildErrorExamples(
  statusCode: SupportedErrorStatus,
  inputs: ErrorExampleInput[],
) {
  return Object.fromEntries(
    inputs.map((input) => [
      input.name,
      {
        summary: input.summary,
        description: input.description,
        value: buildErrorExampleValue(statusCode, input),
      },
    ]),
  );
}

function applyErrorExamples(
  statusCode: SupportedErrorStatus,
  description: string,
  inputs: ErrorExampleInput[],
) {
  const responseDecorator =
    statusCode === 400
      ? ApiBadRequestResponse
      : statusCode === 401
        ? ApiUnauthorizedResponse
        : statusCode === 403
          ? ApiForbiddenResponse
          : statusCode === 404
            ? ApiNotFoundResponse
            : statusCode === 409
              ? ApiConflictResponse
              : statusCode === 429
                ? ApiTooManyRequestsResponse
                : ApiServiceUnavailableResponse;

  return applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    responseDecorator({
      description,
      content: {
        'application/json': {
          schema: {
            $ref: getSchemaPath(ErrorResponseDto),
          },
          examples: buildErrorExamples(statusCode, inputs),
        },
      },
    }),
  );
}

export function ApiBadRequestExamples(
  description: string,
  inputs: ErrorExampleInput[],
) {
  return applyErrorExamples(400, description, inputs);
}

export function ApiUnauthorizedExamples(
  description: string,
  inputs: ErrorExampleInput[],
) {
  return applyErrorExamples(401, description, inputs);
}

export function ApiForbiddenExamples(
  description: string,
  inputs: ErrorExampleInput[],
) {
  return applyErrorExamples(403, description, inputs);
}

export function ApiNotFoundExamples(
  description: string,
  inputs: ErrorExampleInput[],
) {
  return applyErrorExamples(404, description, inputs);
}

export function ApiConflictExamples(
  description: string,
  inputs: ErrorExampleInput[],
) {
  return applyErrorExamples(409, description, inputs);
}

export function ApiTooManyRequestsExamples(
  description: string,
  inputs: ErrorExampleInput[],
) {
  return applyErrorExamples(429, description, inputs);
}

export function ApiServiceUnavailableExamples(
  description: string,
  inputs: ErrorExampleInput[],
) {
  return applyErrorExamples(503, description, inputs);
}
