import { useEffect, useMemo, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  MessageCircle,
  ClipboardList,
  Settings2,
  Home,
  Users,
  UserPlus2,
  LayoutDashboard,
  Bot,
  LogOut,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatbotModal } from "@/components/ChatbotModal";
import { getProfile } from "@/services/user.api";
import { useAuth } from "@/providers/AuthProvider";
import { useConversations } from "@/hooks/shared/useChatData";
import { useIncomingFriendRequests } from "@/hooks/useFriendsData";
import { readAccessToken } from "@/lib/api-client";

type NavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  badgeCount?: number;
};

function formatBadgeCount(value: number): string {
  if (value > 99) {
    return "99+";
  }
  return String(value);
}

export function Sidebar({
  onOpenChatbot,
  isDarkMode,
  onToggleTheme,
}: {
  onOpenChatbot: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}) {
  const navigate = useNavigate();
  const { user, logout, isLoading: loadingAuth } = useAuth();
  const { data: conversations = [] } = useConversations();
  const { data: incomingRequestsData } = useIncomingFriendRequests(50);
  const hasToken = Boolean(readAccessToken());
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: hasToken && !loadingAuth,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });
  
  const isOfficial = user?.role === 'OFFICIAL' || user?.role === 'ADMIN';
  const unreadMessageCount = useMemo(
    () => conversations.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0),
    [conversations],
  );
  const incomingFriendRequestCount = useMemo(
    () => incomingRequestsData?.pages.flatMap((page) => page.items).length ?? 0,
    [incomingRequestsData],
  );
  const avatarSrc =
    profile?.avatarAsset?.resolvedUrl ||
    profile?.avatarUrl;
  const displayName = profile?.fullName || user?.sub || "User";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";

  const navItems = [
    { to: "/", icon: Home, label: "Trang chủ" },
    isOfficial ? { to: "/official-dashboard", icon: LayoutDashboard, label: "Dashboard Quản Lý" } : null,
    { to: "/chat", icon: MessageCircle, label: "Tin nhắn", badgeCount: unreadMessageCount },
    { to: "/friends", icon: UserPlus2, label: "Bạn bè", badgeCount: incomingFriendRequestCount },
    { to: "/groups", icon: Users, label: "Nhóm" },
    { to: "/reports", icon: ClipboardList, label: "Báo cáo duyệt" },
  ].filter(Boolean) as NavItem[];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className={`w-16 h-screen flex flex-col items-center py-4 border-r flex-shrink-0 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"}`}>
      <div className="mb-8 cursor-pointer" onClick={() => navigate("/settings")} title="Hồ sơ">
        <Avatar className={`h-9 w-9 border ${isDarkMode ? "border-slate-700" : "border-slate-300"}`}>
          {avatarSrc ? <AvatarImage src={avatarSrc} alt={displayName} /> : null}
          <AvatarFallback className={`${isDarkMode ? "bg-slate-700 text-slate-100" : "bg-white text-slate-700"} text-xs font-semibold`}>
            {initials}
          </AvatarFallback>
        </Avatar>
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
                  : isDarkMode
                    ? "text-gray-400 hover:bg-slate-800 hover:text-gray-100"
                    : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              }`
            }
            title={item.label}
          >
            {({ isActive }) => (
              <div className="relative">
                <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                {item.badgeCount && item.badgeCount > 0 ? (
                  <span className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
                    {formatBadgeCount(item.badgeCount)}
                  </span>
                ) : null}
              </div>
            )}
          </NavLink>
        ))}

        <button
          onClick={onOpenChatbot}
          title="Chatbot"
          className={`p-3 rounded-xl transition-all duration-200 ${isDarkMode ? "text-gray-400 hover:bg-slate-800 hover:text-gray-100" : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"}`}
        >
          <Bot size={24} />
        </button>
      </div>

      <button
        onClick={onToggleTheme}
        title={isDarkMode ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
        className={`mb-2 p-3 rounded-xl transition-all duration-200 ${isDarkMode ? "text-gray-400 hover:bg-slate-800 hover:text-gray-100" : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"}`}
      >
        {isDarkMode ? <Sun size={22} /> : <Moon size={22} />}
      </button>

      <NavLink
        to="/settings"
        title="Cài đặt"
        className={({ isActive }) =>
          `mb-2 p-3 rounded-xl transition-all duration-200 ${
            isActive
              ? "bg-blue-600 text-white shadow-md"
              : isDarkMode
                ? "text-gray-400 hover:bg-slate-800 hover:text-gray-100"
                : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"
          }`
        }
      >
        {({ isActive }) => <Settings2 size={22} strokeWidth={isActive ? 2.5 : 2} />}
      </NavLink>

      <button
        onClick={handleLogout}
        title="Đăng xuất"
        className="mb-2 p-3 rounded-xl text-red-300 hover:bg-red-900/40 hover:text-red-100 transition-all duration-200"
      >
        <LogOut size={22} />
      </button>
    </div>
  );
}

export function MainLayout() {
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem("web-app-theme");
    if (savedTheme === "dark") {
      return true;
    }
    if (savedTheme === "light") {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    localStorage.setItem("web-app-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans relative transition-colors duration-200">
      <Sidebar
        onOpenChatbot={() => setIsChatbotOpen(true)}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
      />
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
      {isChatbotOpen ? <ChatbotModal onClose={() => setIsChatbotOpen(false)} /> : null}
    </div>
  );
}
