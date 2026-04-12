import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authService, type CurrentUser } from "../services/auth.service";

interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setCurrentUser: (user: CurrentUser) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize auth state from localStorage
    if (authService.isAuthenticated()) {
      setIsAuthenticated(true);
      const user = authService.getCurrentUser();
      if (user) {
        setCurrentUser(user);
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await authService.login(email, password);
      if (response.success) {
        setIsAuthenticated(true);
        if (response.user) {
          setCurrentUser(response.user);
        }
        return true;
      } else {
        console.error("Login failed:", response.error);
        return false;
      }
    } catch (error) {
      console.error("Login error:", error);
      return false;
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  const handleSetCurrentUser = (user: CurrentUser) => {
    setCurrentUser(user);
    authService.setCurrentUser(user);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        currentUser,
        loading,
        login: handleLogin,
        logout: handleLogout,
        setCurrentUser: handleSetCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
