import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_ORIGIN = 'http://localhost:3001';
const LOCALHOST_URL_PATTERN = /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getExpoHostName = (): string | null => {
  const constants = Constants as any;
  const hostUri =
    constants.expoConfig?.hostUri ||
    constants.manifest2?.extra?.expoClient?.hostUri ||
    constants.manifest?.hostUri ||
    constants.manifest?.debuggerHost;

  if (typeof hostUri !== 'string' || !hostUri.trim()) {
    return null;
  }

  const cleanHost = hostUri
    .trim()
    .replace(/^exp(s)?:\/\//i, '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0];

  if (!cleanHost || cleanHost === 'localhost' || cleanHost === '127.0.0.1') {
    return null;
  }

  return cleanHost;
};

const resolveNativeDevLocalhost = (rawUrl: string): string => {
  const trimmed = rawUrl.trim() || DEFAULT_API_ORIGIN;

  if (!__DEV__ || Platform.OS === 'web') {
    return trimmed;
  }

  const match = trimmed.match(LOCALHOST_URL_PATTERN);
  const expoHostName = getExpoHostName();

  if (!match || !expoHostName) {
    return trimmed;
  }

  return `${match[1]}${expoHostName}${match[3] || ':3001'}${match[4] || ''}`;
};

export const resolveApiBaseUrl = (rawUrl?: string): string => {
  const baseUrl = trimTrailingSlash(resolveNativeDevLocalhost(rawUrl || DEFAULT_API_ORIGIN));
  return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
};

export const resolveSocketOrigin = (rawUrl?: string): string => {
  return trimTrailingSlash(resolveNativeDevLocalhost(rawUrl || DEFAULT_API_ORIGIN).replace(/\/api\/?$/i, ''));
};
