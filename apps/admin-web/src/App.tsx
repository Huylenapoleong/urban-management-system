import { Suspense, lazy } from 'react';
import { Route, BrowserRouter as Router, Routes } from 'react-router';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { ScrollToTop } from './components/common/ScrollToTop';
import AppLayout from './layout/AppLayout';

const SignIn = lazy(() => import('./pages/AuthPages/SignIn'));
const SignUp = lazy(() => import('./pages/AuthPages/SignUp'));
const NotFound = lazy(() => import('./pages/OtherPage/NotFound'));
const Home = lazy(() => import('./pages/Dashboard/Home'));
const Users = lazy(() => import('./pages/Users/Users'));
const Categories = lazy(() => import('./pages/Categories/Categories'));
const Regions = lazy(() => import('./pages/Regions/Regions'));
const Reports = lazy(() => import('./pages/Reports/Reports'));
const DashboardHeatmap = lazy(
  () => import('./pages/Dashboard/DashboardHeatmap'),
);
const Rankings = lazy(() => import('./pages/Rankings/Rankings'));
const Permissions = lazy(() => import('./pages/Permissions/Permissions'));
const AuditLogs = lazy(() => import('./pages/AuditLogs/AuditLogs'));
const ChatbotSettings = lazy(() => import('./pages/Settings/ChatbotSettings'));
const UserProfiles = lazy(() => import('./pages/UserProfiles'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Blank = lazy(() => import('./pages/Blank'));
const FormElements = lazy(() => import('./pages/Forms/FormElements'));
const BasicTables = lazy(() => import('./pages/Tables/BasicTables'));
const Alerts = lazy(() => import('./pages/UiElements/Alerts'));
const Avatars = lazy(() => import('./pages/UiElements/Avatars'));
const Badges = lazy(() => import('./pages/UiElements/Badges'));
const Buttons = lazy(() => import('./pages/UiElements/Buttons'));
const Images = lazy(() => import('./pages/UiElements/Images'));
const Videos = lazy(() => import('./pages/UiElements/Videos'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-sm text-gray-500">Loading page...</div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Auth Routes - Public */}
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />

            {/* Dashboard Layout - Protected */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* Main Dashboard */}
              <Route index path="/" element={<Home />} />

              {/* Smart City Data Management Routes */}
              <Route path="/users" element={<Users />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/regions" element={<Regions />} />
              <Route path="/reports" element={<Reports />} />

              {/* Smart City Analytics & Dashboard Routes */}
              <Route path="/dashboard/heatmap" element={<DashboardHeatmap />} />
              <Route path="/rankings" element={<Rankings />} />

              {/* Smart City Admin & Settings Routes */}
              <Route path="/permissions" element={<Permissions />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
              <Route path="/settings/chatbot" element={<ChatbotSettings />} />

              {/* Others Page */}
              <Route path="/profile" element={<UserProfiles />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/blank" element={<Blank />} />

              {/* Forms */}
              <Route path="/form-elements" element={<FormElements />} />

              {/* Tables */}
              <Route path="/basic-tables" element={<BasicTables />} />

              {/* Ui Elements */}
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/avatars" element={<Avatars />} />
              <Route path="/badge" element={<Badges />} />
              <Route path="/buttons" element={<Buttons />} />
              <Route path="/images" element={<Images />} />
              <Route path="/videos" element={<Videos />} />
            </Route>

            {/* Fallback Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Router>
    </>
  );
}
