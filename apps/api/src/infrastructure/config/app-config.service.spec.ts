import { AppConfigService } from './app-config.service';

describe('AppConfigService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }

    Object.assign(process.env, originalEnv);
  });

  it('parses comma-separated origins and matches them exactly', () => {
    process.env.CORS_ORIGIN = 'http://localhost:5173, http://localhost:8081/';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

    const config = new AppConfigService();

    expect(config.corsOrigins).toEqual([
      'http://localhost:5173',
      'http://localhost:8081',
    ]);
    expect(config.isCorsOriginAllowed('http://localhost:5173')).toBe(true);
    expect(config.isCorsOriginAllowed('http://localhost:8081/')).toBe(true);
    expect(config.isCorsOriginAllowed('http://localhost:4200')).toBe(false);
    expect(config.isCorsOriginAllowed(undefined)).toBe(true);
  });

  it('defaults swagger to disabled in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

    const config = new AppConfigService();

    expect(config.swaggerEnabled).toBe(false);
  });

  it('rejects default jwt secrets in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => new AppConfigService()).toThrow(
      'JWT_ACCESS_SECRET must be overridden in production.',
    );
  });

  it('rejects identical access and refresh secrets', () => {
    process.env.JWT_ACCESS_SECRET = 'same-secret';
    process.env.JWT_REFRESH_SECRET = 'same-secret';

    expect(() => new AppConfigService()).toThrow(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.',
    );
  });

  it('requires webhook url when push provider is webhook', () => {
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    process.env.PUSH_PROVIDER = 'webhook';
    delete process.env.PUSH_WEBHOOK_URL;

    expect(() => new AppConfigService()).toThrow(
      'PUSH_WEBHOOK_URL is required when PUSH_PROVIDER=webhook.',
    );
  });

  it('rejects wildcard cors in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    process.env.CORS_ORIGIN = '*';

    expect(() => new AppConfigService()).toThrow(
      'CORS_ORIGIN cannot allow * in production.',
    );
  });
});
