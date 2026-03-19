import { ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService({
      circuitBreakerFailureThreshold: 2,
      circuitBreakerOpenDurationMs: 20,
    } as never);
  });

  it('opens after consecutive retryable failures', async () => {
    const timeoutError = Object.assign(new Error('timeout'), {
      name: 'TimeoutError',
    });

    await expect(
      service.execute('dynamodb', 'DynamoDB', () =>
        Promise.reject(timeoutError),
      ),
    ).rejects.toBe(timeoutError);

    await expect(
      service.execute('dynamodb', 'DynamoDB', () =>
        Promise.reject(timeoutError),
      ),
    ).rejects.toBe(timeoutError);

    expect(service.getSnapshot('dynamodb').state).toBe('open');

    await expect(
      service.execute('dynamodb', 'DynamoDB', () => Promise.resolve('ok')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('recovers after the open window and a successful probe', async () => {
    const timeoutError = Object.assign(new Error('timeout'), {
      name: 'TimeoutError',
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        service.execute('s3', 'S3', () => Promise.reject(timeoutError)),
      ).rejects.toBe(timeoutError);
    }

    await new Promise((resolve) => setTimeout(resolve, 25));

    await expect(
      service.execute('s3', 'S3', () => Promise.resolve('recovered')),
    ).resolves.toBe('recovered');
    expect(service.getSnapshot('s3').state).toBe('closed');
  });

  it('does not open on non-retryable errors', async () => {
    const badRequestError = Object.assign(new Error('invalid request'), {
      name: 'ValidationException',
    });

    await expect(
      service.execute('dynamodb', 'DynamoDB', () =>
        Promise.reject(badRequestError),
      ),
    ).rejects.toBe(badRequestError);

    expect(service.getSnapshot('dynamodb').state).toBe('closed');
    expect(service.getSnapshot('dynamodb').consecutiveFailures).toBe(0);
  });
});
