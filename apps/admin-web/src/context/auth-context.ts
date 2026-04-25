import { createContext, useContext } from 'react';
import type { CurrentUser } from '../services/auth.service';

export interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setCurrentUser: (user: CurrentUser) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
