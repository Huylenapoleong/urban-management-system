import { useAuth } from "@/providers/auth-context";
import { Navigate, Outlet, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  allowedRoles?: string[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
          <div className="relative p-8 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="h-12 w-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-2 w-2 bg-blue-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(37,99,235,0.8)]"></div>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em]">
              Urban Management
            </p>
            <p className="text-xs font-medium text-slate-400 mt-1">Đang xác thực tài khoản...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
