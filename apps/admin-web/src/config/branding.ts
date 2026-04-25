/**
 * Smart City Admin Dashboard - Branding Configuration
 * Centralized configuration for colors, logos, and application metadata
 */

export const BrandingConfig = {
  appName: 'Đô thị Thông minh Admin',
  appNameEn: 'Smart City Admin Dashboard',
  appDescription:
    'Hệ thống quản lý sự cố đô thị - Smart City Issue Management System',

  // Color Palette for Smart City (Blue/Green theme)
  colors: {
    primary: '#0066CC', // Smart Blue
    secondary: '#00AA44', // Success Green
    warning: '#FB9139', // Warning Orange
    danger: '#EE3C3C', // Error Red
    info: '#3B82F6', // Info Blue
    success: '#10B981', // Success
    gray: '#6B7280', // Neutral

    // Extended palette
    dark: {
      primary: '#0052A3',
      secondary: '#00882D',
    },
    light: {
      primary: '#E0F0FF',
      secondary: '#E0F8F0',
    },
  },

  // Logo URLs
  logos: {
    light: '/images/logo/logo.svg',
    dark: '/images/logo/logo-dark.svg',
    favicon: '/images/logo/favicon.ico',
  },

  // Typography
  fonts: {
    family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto",
    sizes: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
    },
  },

  // App Settings
  settings: {
    defaultTheme: 'light' as const,
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'vi'],
    apiBaseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
    uploadMaxSize: 10 * 1024 * 1024, // 10MB
  },

  // Contact Info
  contact: {
    supportEmail: 'support@smartcity.gov.vn',
    supportPhone: '+84 (0)28 3822 3000',
    website: 'https://smartcity.gov.vn',
  },

  // Social Links
  social: {
    facebook: 'https://facebook.com/smartcity',
    twitter: 'https://twitter.com/smartcity',
    linkedin: 'https://linkedin.com/company/smartcity',
  },
};

export default BrandingConfig;
