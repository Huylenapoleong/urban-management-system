/**
 * Authentication & Authorization Types
 * Defines user roles, permissions, and request/response types
 */

// User Roles
export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  PROVINCE_OFFICER = "PROVINCE_OFFICER",
  WARD_OFFICER = "WARD_OFFICER",
  CITIZEN = "CITIZEN",
}

// Permissions Matrix
export type PermissionType = "read" | "write" | "delete" | "approve";

export interface Permission {
  resource: string;
  actions: PermissionType[];
}

export interface RolePermissions {
  [UserRole.SUPER_ADMIN]: Permission[];
  [UserRole.PROVINCE_OFFICER]: Permission[];
  [UserRole.WARD_OFFICER]: Permission[];
  [UserRole.CITIZEN]: Permission[];
}

// User Types
export interface User {
  id: string;
  username: string;
  email: string;
  phone?: string;
  fullName: string;
  avatar?: string;
  role: UserRole;
  regionId?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  username: string;
  password: string;
  twoFactorCode?: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthToken;
  requiresTwoFactor?: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
