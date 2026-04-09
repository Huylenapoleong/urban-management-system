import {
  deriveSessionScope,
  extractSessionClientMetadata,
} from './request-session-metadata';

describe('request-session-metadata', () => {
  it('derives MOBILE_APP from mobile app variant', () => {
    expect(
      deriveSessionScope({
        appVariant: 'mobile-app',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }),
    ).toBe('MOBILE_APP');
  });

  it('derives WEB_DESKTOP from desktop web app variant', () => {
    expect(
      deriveSessionScope({
        appVariant: 'admin-web',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }),
    ).toBe('WEB_DESKTOP');
  });

  it('derives WEB_MOBILE from web app variant with mobile user-agent', () => {
    expect(
      deriveSessionScope({
        appVariant: 'admin-web',
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile',
      }),
    ).toBe('WEB_MOBILE');
  });

  it('extracts metadata and inferred session scope from headers', () => {
    const metadata = extractSessionClientMetadata({
      headers: {
        'x-forwarded-for': '203.113.1.20, 10.0.0.1',
        'user-agent': 'Mozilla/5.0 (Android 14) Mobile',
        'x-device-id': 'device-mobile-01',
        'x-app-variant': 'mobile-app',
      },
      ip: undefined,
      socket: {
        remoteAddress: '10.0.0.1',
      },
    });

    expect(metadata).toEqual({
      appVariant: 'mobile-app',
      deviceId: 'device-mobile-01',
      ipAddress: '203.113.1.20',
      sessionScope: 'MOBILE_APP',
      userAgent: 'Mozilla/5.0 (Android 14) Mobile',
    });
  });
});
