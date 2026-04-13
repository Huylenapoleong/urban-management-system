import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { MessageSquare, FileText, UserCircle, Settings, Home, Shield, BarChart } from "lucide-react";
import { ChatbotFAB } from "@/components/ChatbotFAB";
import { useAuth } from "@/providers/AuthProvider";

export function Sidebar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const isOfficial = user?.role === 'OFFICIAL' || user?.role === 'ADMIN';

  const navItems = [
    { to: "/", icon: Home, label: "Trang chủ" },
    isOfficial ? { to: "/official-dashboard", icon: BarChart, label: "Dashboard Quản Lý" } : null,
    { to: "/chat", icon: MessageSquare, label: "Tin nhắn" },
    { to: "/groups", icon: Shield, label: "Nhóm" },
    { to: "/reports", icon: FileText, label: "Báo cáo duyệt" },
    { to: "/settings", icon: Settings, label: "Cài đặt" },
  ].filter(Boolean) as Array<{ to: string, icon: any, label: string }>;

  return (
    <div className="w-16 h-screen flex flex-col items-center py-4 bg-slate-900 border-r flex-shrink-0">
      <div className="mb-8 cursor-pointer" onClick={() => navigate("/settings")} title="Hồ sơ">
        <UserCircle size={32} className="text-gray-300 hover:text-white" />
      </div>
      <div className="flex-1 flex flex-col gap-6 w-full items-center">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `p-3 rounded-xl transition-all duration-200 block ${
                isActive
                  ? "bg-blue-600 text-white shadow-md w-[48px] flex items-center justify-center p-0 h-[48px]"
                  : "text-gray-400 hover:bg-slate-800 hover:text-gray-100"
              }`
            }
            title={item.label}
          >
            {({ isActive }) => (
              <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function MainLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-slate-900 font-sans relative">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
      <ChatbotFAB />
    </div>
  );
}
