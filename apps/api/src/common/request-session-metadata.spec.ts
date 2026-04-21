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

  it('derives WEB_MOBILE from a mobile browser user-agent when app variant is missing', () => {
    expect(
      deriveSessionScope({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      }),
    ).toBe('WEB_MOBILE');
  });

  it('derives MOBILE_APP from a native Android user-agent when app variant is missing', () => {
    expect(
      deriveSessionScope({
        userAgent: 'okhttp/4.12.0',
      }),
    ).toBe('MOBILE_APP');
  });

  it('derives MOBILE_APP from a native iOS networking user-agent when app variant is missing', () => {
    expect(
      deriveSessionScope({
        userAgent: 'mobile-app/1 CFNetwork/1498.700.2 Darwin/23.6.0',
      }),
    ).toBe('MOBILE_APP');
  });

  it('keeps unknown scope when both app variant and user-agent are absent', () => {
    expect(deriveSessionScope({})).toBe('UNKNOWN');
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

  it('prefers WEB_MOBILE for mobile browser headers without x-app-variant', () => {
    const metadata = extractSessionClientMetadata({
      headers: {
        'x-forwarded-for': '203.113.1.20, 10.0.0.1',
        'user-agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
        'x-device-id': 'device-mobile-web-01',
      },
      ip: undefined,
      socket: {
        remoteAddress: '10.0.0.1',
      },
    });

    expect(metadata).toEqual({
      appVariant: undefined,
      deviceId: 'device-mobile-web-01',
      ipAddress: '203.113.1.20',
      sessionScope: 'WEB_MOBILE',
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
    });
  });
});
