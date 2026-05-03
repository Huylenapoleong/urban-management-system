import type { JwtClaims } from "@urban/shared-types";
import { createContext, useContext } from "react";

export interface AuthContextType {
  user: JwtClaims | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
