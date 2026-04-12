import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/providers/AuthProvider"

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Đang tải cấu hình...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
