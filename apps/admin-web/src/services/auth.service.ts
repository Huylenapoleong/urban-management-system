import { apiClient } from './api-client';

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface LoginResponse {
  success: boolean;
  tokens: AuthToken;
  user?: CurrentUser;
  message?: string;
  error?: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role:
    | 'SUPER_ADMIN'
    | 'ADMIN'
    | 'OFFICER'
    | 'CITIZEN'
    | 'super_admin'
    | 'admin'
    | 'officer'
    | 'citizen';
  status:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'DEACTIVATED'
    | 'active'
    | 'inactive'
    | 'deactivated';
  locationCode?: string;
  unit?: string;
  avatarUrl?: string;
  createdAt?: string;
}

class AuthService {
  private currentUser: CurrentUser | null = null;

  constructor() {
    this.initializeFromLocalStorage();
  }

  private initializeFromLocalStorage() {
    const token = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('currentUser');

    if (token) {
      apiClient.setToken(token);
    }

    if (userStr) {
      try {
        this.currentUser = JSON.parse(userStr);
      } catch (e) {
        console.error('Failed to parse stored user:', e);
      }
    }
  }

  async login(login: string, password: string): Promise<LoginResponse> {
    try {
      const response = await apiClient.post<{
        tokens: {
          accessToken: string;
          refreshToken?: string;
        };
        user?: {
          id: string;
          fullName: string;
          email?: string;
          phone?: string;
          role: string;
          status: string;
          locationCode?: string;
          unit?: string;
          avatarUrl?: string;
          createdAt?: string;
        };
      }>('/auth/login', { login, password });

      if (response.success && response.data) {
        const token = response.data.tokens.accessToken;
        const apiUser = response.data.user;

        // Store token and user
        localStorage.setItem('authToken', token);
        // store refresh token if provided so we can call logout properly
        if (response.data.tokens.refreshToken) {
          localStorage.setItem(
            'refreshToken',
            response.data.tokens.refreshToken,
          );
        }
        apiClient.setToken(token);

        if (apiUser) {
          const user: CurrentUser = {
            id: apiUser.id,
            name: apiUser.fullName,
            email: apiUser.email,
            phone: apiUser.phone,
            role: (apiUser.role?.toUpperCase() ||
              'CITIZEN') as CurrentUser['role'],
            status: (apiUser.status?.toUpperCase() ||
              'ACTIVE') as CurrentUser['status'],
            locationCode: apiUser.locationCode,
            unit: apiUser.unit,
            avatarUrl: apiUser.avatarUrl,
            createdAt: apiUser.createdAt,
          };
          this.currentUser = user;
          localStorage.setItem('currentUser', JSON.stringify(user));
        }

        return {
          success: true,
          tokens: {
            accessToken: token,
            refreshToken: response.data.tokens.refreshToken,
          },
          user: this.currentUser || undefined,
        };
      } else {
        return {
          success: false,
          error: response.error || 'Login failed',
          tokens: { accessToken: '' },
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
        tokens: { accessToken: '' },
      };
    }
  }

  async logout(): Promise<void> {
    // Clear local storage
    const refreshToken = localStorage.getItem('refreshToken');
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('refreshToken');

    // Clear API client token
    apiClient.setToken(null);
    this.currentUser = null;

    // Optional: Call logout endpoint if needed
    try {
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore logout errors
    }
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('authToken');
  }

  getCurrentUser(): CurrentUser | null {
    return this.currentUser;
  }

  setCurrentUser(user: CurrentUser): void {
    this.currentUser = user;
    localStorage.setItem('currentUser', JSON.stringify(user));
  }

  getToken(): string | null {
    return localStorage.getItem('authToken');
  }
}

export const authService = new AuthService();
