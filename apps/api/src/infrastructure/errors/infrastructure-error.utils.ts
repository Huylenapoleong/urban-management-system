import { ServiceUnavailableException } from '@nestjs/common';

const RETRYABLE_AWS_ERROR_NAMES = new Set([
  'InternalFailure',
  'InternalServerError',
  'NetworkingError',
  'ProvisionedThroughputExceededException',
  'RequestTimeout',
  'RequestTimeoutException',
  'ServiceUnavailable',
  'Throttling',
  'ThrottlingException',
  'TimeoutError',
  'TooManyRequestsException',
  'TransactionInProgressException',
]);

function extractErrorName(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

function extractHttpStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } })
    .$metadata;
  return typeof metadata?.httpStatusCode === 'number'
    ? metadata.httpStatusCode
    : undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '';
}

export function isRetryableInfrastructureError(error: unknown): boolean {
  if (error instanceof ServiceUnavailableException) {
    return true;
  }

  const errorName = extractErrorName(error);

  if (errorName && RETRYABLE_AWS_ERROR_NAMES.has(errorName)) {
    return true;
  }

  const statusCode = extractHttpStatusCode(error);
  if (statusCode !== undefined && statusCode >= 500) {
    return true;
  }

  return /connection reset|econnreset|eai_again|rate exceeded|socket hang up|temporar|throttl|timeout/i.test(
    extractMessage(error),
  );
}

export function createInfrastructureOperationError(input: {
  context: Record<string, string | undefined>;
  error: unknown;
  operation: string;
  publicMessage: string;
  serviceLabel: string;
}): Error {
  if (input.error instanceof ServiceUnavailableException) {
    return input.error;
  }

  const details = Object.entries(input.context)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  const errorMessage = extractMessage(input.error) || 'Unknown error';

  if (isRetryableInfrastructureError(input.error)) {
    const wrapped = new ServiceUnavailableException(input.publicMessage);

    (wrapped as ServiceUnavailableException & { cause?: unknown }).cause =
      input.error;
    (wrapped as ServiceUnavailableException & { detail?: string }).detail =
      `${input.serviceLabel} ${input.operation} failed (${details}): ${errorMessage}`;
    return wrapped;
  }

  const wrapped = new Error(
    `${input.serviceLabel} ${input.operation} failed (${details}): ${errorMessage}`,
  );

  (wrapped as Error & { cause?: unknown }).cause = input.error;
  return wrapped;
}
