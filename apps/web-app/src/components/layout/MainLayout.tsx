import { Outlet, NavLink } from "react-router-dom";
import { MessageSquare, Users, FileText, UserCircle } from "lucide-react";

export function Sidebar() {
  const navItems = [
    { to: "/", icon: MessageSquare, label: "Tin nhắn" },
    { to: "/contacts", icon: Users, label: "Danh bạ" },
    { to: "/reports", icon: FileText, label: "Báo cáo" },
  ];

  return (
    <div className="w-16 h-screen flex flex-col items-center py-4 bg-slate-900 border-r flex-shrink-0">
      <div className="mb-8 cursor-pointer">
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
    <div className="flex h-screen w-screen overflow-hidden bg-white text-slate-900 font-sans">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
