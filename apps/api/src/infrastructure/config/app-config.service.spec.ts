import { AppConfigService } from './app-config.service';

describe('AppConfigService CORS config', () => {
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (originalCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
      return;
    }

    process.env.CORS_ORIGIN = originalCorsOrigin;
  });

  it('parses comma-separated origins and matches them exactly', () => {
    process.env.CORS_ORIGIN = 'http://localhost:5173, http://localhost:8081/';

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
});
