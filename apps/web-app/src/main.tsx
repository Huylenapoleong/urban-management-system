import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { MainLayout } from './components/layout/MainLayout'
import { ChatPage } from './pages/ChatPage'
import { ReportsPage } from './pages/ReportsPage'
import HomePage from './pages/HomePage'
import GroupsPage from './pages/GroupsPage'
import FriendsPage from './pages/FriendsPage'
import NewReportPage from './pages/NewReportPage'
import OfficialDashboard from './pages/OfficialDashboard'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { SettingsPage } from './pages/SettingsPage'
import { AuthProvider } from './providers/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 429) {
          return false;
        }

        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<HomePage />} />
                <Route element={<ProtectedRoute allowedRoles={['OFFICIAL', 'ADMIN']} />}>
                   <Route path="official-dashboard" element={<OfficialDashboard />} />
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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
