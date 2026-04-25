// S3 Configuration for image URLs
import { ENV_CONFIG } from './env';

export const S3_CONFIG = {
  // Old URL pattern (for backward compatibility)
  OLD_BASE_URL: ENV_CONFIG.S3.OLD_BASE_URL,

  // New S3 URL pattern
  NEW_BASE_URL: ENV_CONFIG.S3.NEW_BASE_URL,

  // Bucket name
  BUCKET_NAME: ENV_CONFIG.S3.BUCKET_NAME,

  // Region
  REGION: ENV_CONFIG.S3.REGION,
} as const;

// Helper function to convert old URLs to new S3 URLs
export function convertToS3Url(url: string): string {
  if (!url) return url;

  // Handle multiple old URL patterns
  const urlMappings = [
    // Old cdn.example.com pattern
    { from: 'https://cdn.example.com/uploads/', to: S3_CONFIG.NEW_BASE_URL },
    // Local development pattern
    { from: 'https://example.local/', to: S3_CONFIG.NEW_BASE_URL },
    // Add more patterns as needed
  ];

  let convertedUrl = url;
  for (const mapping of urlMappings) {
    if (convertedUrl.includes(mapping.from)) {
      convertedUrl = convertedUrl.replace(mapping.from, mapping.to);
      break; // Only apply first matching pattern
    }
  }

  return convertedUrl;
}

// Helper function to build S3 URL from key
export function buildS3Url(key: string): string {
  return `${S3_CONFIG.NEW_BASE_URL}${key}`;
}