import React from "react";
import { Navigate } from "react-router";
import { useAuth } from "../../context/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, currentUser } = useAuth();

  if (loading) {
    // Show a loading screen while checking authentication
    return (
      <div className="flex items-center justify-center w-full h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  const role = currentUser?.role?.toUpperCase();
  const isSystemAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const twoFactorVerifiedAt = localStorage.getItem("twoFactorVerifiedAt");

  if (isSystemAdmin && !twoFactorVerifiedAt) {
    return <Navigate to="/signin" replace />;
  }

  return <>{children}</>;
};
