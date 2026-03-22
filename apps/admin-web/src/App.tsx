import { BrowserRouter as Router, Routes, Route } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/UserProfiles";
import Videos from "./pages/UiElements/Videos";
import Images from "./pages/UiElements/Images";
import Alerts from "./pages/UiElements/Alerts";
import Badges from "./pages/UiElements/Badges";
import Avatars from "./pages/UiElements/Avatars";
import Buttons from "./pages/UiElements/Buttons";
import LineChart from "./pages/Charts/LineChart";
import BarChart from "./pages/Charts/BarChart";
import Calendar from "./pages/Calendar";
import BasicTables from "./pages/Tables/BasicTables";
import FormElements from "./pages/Forms/FormElements";
import Blank from "./pages/Blank";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { ProtectedRoute } from "./components/common/ProtectedRoute";
import Home from "./pages/Dashboard/Home";

// Smart City Modules - Data Management
import Users from "./pages/Users/Users";
import Categories from "./pages/Categories/Categories";
import Regions from "./pages/Regions/Regions";
import Reports from "./pages/Reports/Reports";

// Smart City Modules - Analytics & Dashboard
import DashboardHeatmap from "./pages/Dashboard/DashboardHeatmap";
import Rankings from "./pages/Rankings/Rankings";

// Smart City Modules - Admin & Settings
import Permissions from "./pages/Permissions/Permissions";
import AuditLogs from "./pages/AuditLogs/AuditLogs";
import ChatbotSettings from "./pages/Settings/ChatbotSettings";

export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
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

            {/* Charts */}
            <Route path="/line-chart" element={<LineChart />} />
            <Route path="/bar-chart" element={<BarChart />} />
          </Route>

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
