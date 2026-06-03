import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useConversations } from "@/hooks/shared/useChatData";
import { useIncomingFriendRequests } from "@/hooks/useFriendsData";
import { readAccessToken } from "@/lib/api-client";
import { preloadChatPage } from "@/lib/route-preload";
import { useAuth } from "@/providers/auth-context";
import { WebRTCProvider } from "@/providers/WebRTCProvider";
import { getProfile } from "@/services/user.api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    BookOpen,
    Bot,
    ClipboardList,
    Home,
    LayoutDashboard,
    LogOut,
    MessageCircle,
    Moon,
    Settings2,
    Sun,
    UserPlus2,
    Users,
    X,
    type LucideIcon,
} from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { socketClient } from "@/lib/socket-client";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type { ConversationSummary } from "@urban/shared-types";

const ChatbotModal = lazy(() =>
  import("@/components/ChatbotModal").then((module) => ({
    default: module.ChatbotModal,
  })),
);

type NavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  badgeCount?: number;
};

type WindowWithLegacyAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type ChatNotificationMessage = {
  conversationId: string;
  senderId: string;
  senderName?: string;
  type?: string;
  content?: string;
};

type ChatNotificationPayload = ChatNotificationMessage & {
  message?: ChatNotificationMessage;
  summary?: Partial<ConversationSummary>;
};

type ConversationAliasCacheEntry = {
  userId?: string;
  alias?: string;
};

type FriendCacheEntry = {
  userId?: string;
  displayName?: string;
  contactAlias?: string;
  fullName?: string;
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

  const isOfficial = user?.role === "WARD_OFFICER" || user?.role === "PROVINCE_OFFICER" || user?.role === "ADMIN";
  const unreadMessageCount = useMemo(
    () => conversations.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0),
    [conversations],
  );
  const incomingFriendRequestCount = useMemo(
    () => incomingRequestsData?.pages.flatMap((page) => page.items).length ?? 0,
    [incomingRequestsData],
  );
  const avatarSrc = profile?.avatarAsset?.resolvedUrl || profile?.avatarUrl;
  const displayName = profile?.fullName || user?.sub || "User";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U";

  const navItems = [
    { to: "/", icon: Home, label: "Trang chủ" },
    isOfficial
      ? {
          to: "/official-dashboard",
          icon: LayoutDashboard,
          label: "Dashboard quản lý",
        }
      : null,
    {
      to: "/chat",
      icon: MessageCircle,
      label: "Tin nhắn",
      badgeCount: unreadMessageCount,
    },
    {
      to: "/friends",
      icon: UserPlus2,
      label: "Bạn bè",
      badgeCount: incomingFriendRequestCount,
    },
    { to: "/groups", icon: Users, label: "Nhóm" },
    { to: "/knowledge-base", icon: BookOpen, label: "Pháp luật" },
    { to: "/reports", icon: ClipboardList, label: "Báo cáo duyệt" },
  ].filter(Boolean) as NavItem[];

  useEffect(() => {
    if (!hasToken || loadingAuth) {
      return undefined;
    }

    const preload = () => {
      void preloadChatPage();
    };

    const idleWindow = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (
          callback: IdleRequestCallback,
          options?: IdleRequestOptions,
        ) => number;
        cancelIdleCallback?: (handle: number) => void;
      };

    if (
      typeof idleWindow.requestIdleCallback === "function" &&
      typeof idleWindow.cancelIdleCallback === "function"
    ) {
      const idleHandle = idleWindow.requestIdleCallback(preload, {
        timeout: 1200,
      });
      return () => idleWindow.cancelIdleCallback?.(idleHandle);
    }

    const timeoutId = globalThis.setTimeout(preload, 400);
    return () => globalThis.clearTimeout(timeoutId);
  }, [hasToken, loadingAuth]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div
      className={`w-full md:w-16 h-14 md:h-screen flex flex-row md:flex-col items-center py-2 md:py-4 px-3 md:px-0 border-t md:border-t-0 md:border-r flex-shrink-0 order-2 md:order-1 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"}`}
    >
      <div
        className="mb-0 md:mb-8 cursor-pointer"
        onClick={() => navigate("/settings")}
        title="Hồ sơ"
      >
        <Avatar
          className={`h-9 w-9 border ${isDarkMode ? "border-slate-700" : "border-slate-300"}`}
        >
          {avatarSrc ? <AvatarImage src={avatarSrc} alt={displayName} /> : null}
          <AvatarFallback
            className={`${isDarkMode ? "bg-slate-700 text-slate-100" : "bg-white text-slate-700"} text-xs font-semibold`}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 flex flex-row md:flex-col gap-4 md:gap-6 w-full items-center justify-center">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onMouseEnter={
              item.to === "/chat" ? () => void preloadChatPage() : undefined
            }
            onFocus={
              item.to === "/chat" ? () => void preloadChatPage() : undefined
            }
            onTouchStart={
              item.to === "/chat" ? () => void preloadChatPage() : undefined
            }
            className={({ isActive }) =>
              `p-2.5 md:p-3 rounded-xl transition-all duration-200 block ${
                isActive
                  ? "bg-blue-600 text-white shadow-md w-10 h-10 md:w-[48px] md:h-[48px] flex items-center justify-center p-0"
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
          className={`p-2.5 md:p-3 rounded-xl transition-all duration-200 ${isDarkMode ? "text-gray-400 hover:bg-slate-800 hover:text-gray-100" : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"}`}
        >
          <Bot size={24} />
        </button>
      </div>
      <div className="flex items-center gap-2 md:flex-col md:gap-2">
        <button
          onClick={onToggleTheme}
          title={
            isDarkMode
              ? "Chuyển sang giao diện sáng"
              : "Chuyển sang giao diện tối"
          }
          className={`p-2.5 md:p-3 rounded-xl transition-all duration-200 ${isDarkMode ? "text-gray-400 hover:bg-slate-800 hover:text-gray-100" : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"}`}
        >
          {isDarkMode ? <Sun size={22} /> : <Moon size={22} />}
        </button>

        <NavLink
          to="/settings"
          title="Cài đặt"
          className={({ isActive }) =>
            `p-2.5 md:p-3 rounded-xl transition-all duration-200 ${
              isActive
                ? "bg-blue-600 text-white shadow-md"
                : isDarkMode
                  ? "text-gray-400 hover:bg-slate-800 hover:text-gray-100"
                  : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            }`
          }
        >
          {({ isActive }) => (
            <Settings2 size={22} strokeWidth={isActive ? 2.5 : 2} />
          )}
        </NavLink>

        <button
          onClick={handleLogout}
          title="Đăng xuất"
          className="p-2.5 md:p-3 rounded-xl text-red-300 hover:bg-red-900/40 hover:text-red-100 transition-all duration-200"
        >
          <LogOut size={22} />
        </button>
      </div>
    </div>
  );
}

let sharedAudioCtx: AudioContext | null = null;

const playTingSound = () => {
  try {
    if (!sharedAudioCtx) {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as WindowWithLegacyAudioContext).webkitAudioContext;
      if (!AudioContextConstructor) return;
      sharedAudioCtx = new AudioContextConstructor();
    }

    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }

    const t = sharedAudioCtx.currentTime;

    const playNote = (freq: number, startTime: number) => {
      const osc = sharedAudioCtx!.createOscillator();
      const gain = sharedAudioCtx!.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.connect(gain);
      gain.connect(sharedAudioCtx!.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.3);
    };

    playNote(659.25, t);         // Note 1: E5
    playNote(880.00, t + 0.08);  // Note 2: A5 slightly delayed
  } catch (err) {
    console.error("Failed to play notification sound", err);
  }
};

export function MainLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: conversations = [] } = useConversations();

  const [activeNotification, setActiveNotification] = useState<{
    conversationId: string;
    title: string;
    body: string;
    avatarUrl?: string;
    count: number;
  } | null>(null);

  const notificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pathnameRef = useRef<string>(location.pathname);
  const conversationsRef = useRef<ConversationSummary[]>(conversations);

  const flashIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const originalTitleRef = useRef<string>(document.title);
  const isFlashingRef = useRef<boolean>(false);

  const startTitleFlashing = (text: string) => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
    }
    if (!isFlashingRef.current) {
      originalTitleRef.current = document.title;
      isFlashingRef.current = true;
    }
    let showNotification = true;
    document.title = text;
    flashIntervalRef.current = setInterval(() => {
      showNotification = !showNotification;
      document.title = showNotification ? text : originalTitleRef.current;
    }, 1500);
  };

  const stopTitleFlashing = () => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }
    if (isFlashingRef.current) {
      document.title = originalTitleRef.current;
      isFlashingRef.current = false;
    }
  };

  useEffect(() => {
    const handleFocus = () => {
      stopTitleFlashing();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const handleNewMessage = (payload: ChatNotificationPayload) => {
      const msg = "message" in payload ? payload.message : payload;
      if (!msg || !msg.conversationId || !msg.senderId) return;

      if (user?.sub && msg.senderId !== user.sub) {
        let isMuted = false;
        try {
          const rawMuted = localStorage.getItem("web-app-muted-conversations");
          if (rawMuted) {
            const mutedMap = JSON.parse(rawMuted);
            const expireAt = mutedMap[msg.conversationId];
            isMuted = expireAt === -1 || (expireAt && Date.now() < expireAt);
          }
        } catch {
          // ignore
        }

        if (!isMuted) {
          playTingSound();

          const summary = payload.summary;
          let conv = conversationsRef.current.find(
            (c) => c.conversationId?.toLowerCase() === msg.conversationId?.toLowerCase(),
          );

          if (!conv) {
            const cachedConvs =
              queryClient.getQueryData<ConversationSummary[]>([
                "conversations",
                "",
              ]) || [];
            conv = cachedConvs.find(
              (c) => c.conversationId?.toLowerCase() === msg.conversationId?.toLowerCase(),
            );
          }

          const isDm = msg.conversationId?.toLowerCase().startsWith("dm:");
          let resolvedPeerName = "";

          if (isDm) {
            const peerId = msg.conversationId.slice(3);
            const cachedAliases = queryClient.getQueryData<
              ConversationAliasCacheEntry[]
            >(["conversation-aliases", msg.conversationId]);
            if (cachedAliases) {
              const matchedAlias = cachedAliases.find(
                (a) => a.userId?.toLowerCase() === peerId.toLowerCase()
              );
              if (matchedAlias?.alias) {
                resolvedPeerName = matchedAlias.alias;
              }
            }

            if (!resolvedPeerName) {
              const cachedFriends =
                queryClient.getQueryData<FriendCacheEntry[]>(["friends"]) ||
                [];
              const friend = cachedFriends.find(
                (f) => f.userId?.toLowerCase() === peerId.toLowerCase(),
              );
              if (friend) {
                resolvedPeerName = friend.displayName || friend.contactAlias || friend.fullName || "";
              }
            }

            if (!resolvedPeerName && conv) {
              resolvedPeerName = conv.groupName;
            }

            if (!resolvedPeerName) {
              resolvedPeerName = summary?.groupName || msg.senderName || "Không rõ tên";
            }
          }

          let resolvedSenderName = "";
          const cachedAliasesForSender = queryClient.getQueryData<
            ConversationAliasCacheEntry[]
          >(["conversation-aliases", msg.conversationId]);
          if (cachedAliasesForSender) {
            const matchedAlias = cachedAliasesForSender.find(
              (a) => a.userId?.toLowerCase() === msg.senderId?.toLowerCase()
            );
            if (matchedAlias?.alias) {
              resolvedSenderName = matchedAlias.alias;
            }
          }

          if (!resolvedSenderName) {
            const cachedFriends =
              queryClient.getQueryData<FriendCacheEntry[]>(["friends"]) || [];
            const senderFriend = cachedFriends.find(
              (f) => f.userId?.toLowerCase() === msg.senderId?.toLowerCase(),
            );
            if (senderFriend) {
              resolvedSenderName = senderFriend.displayName || senderFriend.contactAlias || senderFriend.fullName || "";
            }
          }

          if (!resolvedSenderName) {
            resolvedSenderName = msg.senderName || "Ai đó";
          }

          let conversationTitle = "";
          if (isDm) {
            conversationTitle = resolvedPeerName;
          } else {
            let alias = "";
            try {
              const rawAliases = localStorage.getItem("web-app-conversation-aliases");
              if (rawAliases) {
                const aliasMap = JSON.parse(rawAliases);
                alias = aliasMap[msg.conversationId] || "";
              }
            } catch {
              // ignore
            }
            conversationTitle = alias?.trim() || conv?.groupName || summary?.groupName || "Không rõ tên";
          }

          if (!document.hasFocus()) {
            const displayNameForTab = isDm ? conversationTitle : resolvedSenderName;
            const flashText = isDm
              ? `${displayNameForTab} đã nhắn tin cho bạn`
              : `${resolvedSenderName} đã nhắn tin trong ${conversationTitle}`;
            startTitleFlashing(flashText);
          }

          const onChatWelcomeScreen = pathnameRef.current === "/chat" && socketClient.activeChatId === null;
          const inActiveChat = pathnameRef.current === "/chat" && socketClient.activeChatId === msg.conversationId;

          if (!onChatWelcomeScreen && !inActiveChat) {

            let previewText = "";
            if (msg.type === "text") {
              previewText = msg.content || "";
            } else if (msg.type === "image") {
              previewText = "📷 Hình ảnh";
            } else if (msg.type === "file") {
              previewText = "📁 Tệp đính kèm";
            } else if (msg.type === "gif") {
              previewText = "🎬 GIF";
            } else if (msg.type === "sticker") {
              previewText = "🎨 Sticker";
            } else {
              previewText = "Tin nhắn mới";
            }

            setActiveNotification((prev) => {
              const sameConv = prev && prev.conversationId === msg.conversationId;
              const newCount = sameConv ? prev.count + 1 : 1;
              return {
                conversationId: msg.conversationId,
                title: conversationTitle,
                body: previewText,
                avatarUrl: conv?.avatarUrl || undefined,
                count: newCount,
              };
            });

            if (notificationTimerRef.current) {
              clearTimeout(notificationTimerRef.current);
            }
            notificationTimerRef.current = setTimeout(() => {
              setActiveNotification(null);
            }, 5000);
          }
        }
      }
    };

    socketClient.socket?.on(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleNewMessage);
    return () => {
      socketClient.socket?.off(CHAT_SOCKET_EVENTS.MESSAGE_CREATED, handleNewMessage);
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, [queryClient, user?.sub]);

  useEffect(() => {
    const handleActiveChatChanged = () => {
      const activeId = socketClient.activeChatId;
      if (activeNotification && activeId === activeNotification.conversationId) {
        setActiveNotification(null);
        if (notificationTimerRef.current) {
          clearTimeout(notificationTimerRef.current);
        }
      }
    };
    window.addEventListener("active-chat-changed", handleActiveChatChanged);
    return () => {
      window.removeEventListener("active-chat-changed", handleActiveChatChanged);
    };
  }, [activeNotification]);

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

  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    localStorage.setItem("web-app-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  return (
    <WebRTCProvider>
      <div className="flex h-screen w-screen flex-col md:flex-row overflow-hidden bg-background text-foreground font-sans relative transition-colors duration-200">
        {activeNotification && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[360px] animate-in slide-in-from-top-10 fade-in duration-300 ease-out">
            <div
              onClick={() => {
                navigate("/chat", { state: { conversationId: activeNotification.conversationId } });
                setActiveNotification(null);
              }}
              className="flex items-center gap-3 p-3.5 rounded-2xl cursor-pointer select-none transition-all hover:scale-[1.02] active:scale-[0.98] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-[0_10px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_12px_36px_rgb(0,0,0,0.16)] dark:shadow-[0_10px_30px_rgb(0,0,0,0.3)] dark:hover:shadow-[0_12px_36px_rgb(0,0,0,0.4)]"
            >
              <div className="h-10 w-10 rounded-full shrink-0 flex items-center justify-center bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold text-sm relative">
                {activeNotification.avatarUrl ? (
                  <img
                    src={activeNotification.avatarUrl}
                    alt={activeNotification.title}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  activeNotification.title.charAt(0).toUpperCase()
                )}
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-white dark:border-slate-900 animate-pulse" />
              </div>

              <div className="flex-1 min-w-0">
                <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                  <span className="truncate">{activeNotification.title}</span>
                  {activeNotification.count > 1 && (
                    <span className="shrink-0 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
                      {activeNotification.count}
                    </span>
                  )}
                </h5>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {activeNotification.body}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveNotification(null);
                }}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}
        <Sidebar
          onOpenChatbot={() => setIsChatbotOpen(true)}
          isDarkMode={isDarkMode}
          onToggleTheme={handleToggleTheme}
        />
        <main className="flex-1 flex min-h-0 overflow-y-auto overflow-x-hidden order-1 md:order-2">
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                Đang tải trang...
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
        {isChatbotOpen ? (
          <Suspense fallback={null}>
            <ChatbotModal onClose={() => setIsChatbotOpen(false)} />
          </Suspense>
        ) : null}
      </div>
    </WebRTCProvider>
  );
}
