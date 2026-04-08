// Environment configuration for external services
export const ENV_CONFIG = {
  // API URLs
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api',

  // S3 Configuration
  S3: {
    BUCKET_NAME: 'ums-attachments',
    REGION: 'ap-southeast-1',
    OLD_BASE_URL: 'https://cdn.example.com/uploads/',
    NEW_BASE_URL: 'https://ums-attachments.s3.ap-southeast-1.amazonaws.com/uploads/',
  },

  // App settings
  APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT || 'mobile-app',
} as const;