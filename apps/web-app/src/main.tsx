import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import "./index.css";
import { preloadChatPage } from "./lib/route-preload";
import { AuthProvider } from "./providers/AuthProvider";

const MainLayout = lazy(() =>
  import("./components/layout/MainLayout").then((module) => ({
    default: module.MainLayout,
  })),
);
const HomePage = lazy(() => import("./pages/HomePage"));
const OfficialDashboard = lazy(() => import("./pages/OfficialDashboard"));
const GroupsPage = lazy(() => import("./pages/GroupsPage"));
const FriendsPage = lazy(() => import("./pages/FriendsPage"));
const NewReportPage = lazy(() => import("./pages/NewReportPage"));
const ChatPage = lazy(() =>
  preloadChatPage().then((module) => ({
    default: module.ChatPage,
  })),
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then((module) => ({
    default: module.ReportsPage,
  })),
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);
const RegisterPage = lazy(() =>
  import("./pages/RegisterPage").then((module) => ({
    default: module.RegisterPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/ForgotPasswordPage").then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      Đang tải...
    </div>
  );
}

function getRetryStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { status?: number }).status;
  return typeof status === "number" ? status : undefined;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (getRetryStatus(error) === 429) {
          return false;
        }

        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<MainLayout />}>
                  <Route index element={<HomePage />} />
                  <Route
                    element={
                      <ProtectedRoute allowedRoles={["OFFICIAL", "ADMIN"]} />
                    }
                  >
                    <Route
                      path="official-dashboard"
                      element={<OfficialDashboard />}
                    />
                  </Route>
                  <Route path="chat" element={<ChatPage />} />
                  <Route path="friends" element={<FriendsPage />} />
                  <Route path="groups" element={<GroupsPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="reports/new" element={<NewReportPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
