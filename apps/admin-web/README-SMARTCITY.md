# Smart City Admin Dashboard - Frontend

Vietnamese: **Hệ thống Quản lý Sự cố Đô thị Thông minh**

## 📋 Project Overview

This is the frontend application for the Smart City Admin Dashboard - a comprehensive system for managing urban incidents, citizen reports, and administrative operations for smart city management.

**Status:** Epic 1 (Infrastructure & UI) ✅ Complete | Epic 3 (CRUD Modules) ✅ Complete | Epic 2, 4-5 In Progress

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ with npm
- Git

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run ESLint
npm run lint
```

The application will run at `http://localhost:5173`

## 📁 Project Structure

```
src/
├── config/
│   └── branding.ts                 # Branding & configuration
├── i18n/
│   ├── en.json                     # English translations (300+ keys)
│   ├── vi.json                     # Vietnamese translations
│   └── I18nContext.tsx             # i18n provider & useI18n hook
├── services/
│   ├── api-client.ts               # Base HTTP client with auth
│   ├── users.service.ts            # User CRUD operations
│   ├── categories.service.ts       # Categories CRUD operations
│   ├── regions.service.ts          # Regions CRUD operations
│   └── reports.service.ts          # Reports CRUD operations
├── types/
│   └── auth.ts                     # Authentication types
├── context/
│   ├── SidebarContext.tsx          # Sidebar state management
│   └── ThemeContext.tsx            # Dark/Light theme
├── layout/
│   ├── AppLayout.tsx               # Main layout wrapper
│   ├── AppHeader.tsx               # Top navigation bar
│   ├── AppSidebar.tsx              # Side navigation (i18n enabled)
│   └── Backdrop.tsx                # Mobile menu backdrop
├── pages/
│   ├── Dashboard/
│   │   ├── Home.tsx                # Main dashboard (Task 4.1)
│   │   └── DashboardHeatmap.tsx    # Heatmap view (Task 4.2)
│   ├── Users/
│   │   └── Users.tsx               # User management (Task 3.1)
│   ├── Categories/
│   │   └── Categories.tsx          # Category management (Task 3.2)
│   ├── Regions/
│   │   └── Regions.tsx             # Administrative divisions (Task 3.3)
│   ├── Reports/
│   │   └── Reports.tsx             # Issue management
│   ├── Permissions/
│   │   └── Permissions.tsx         # Role & permissions (Task 2.3)
│   ├── Rankings/
│   │   └── Rankings.tsx            # Performance ranking (Task 4.3)
│   ├── AuditLogs/
│   │   └── AuditLogs.tsx           # System audit trail (Task 5.2)
│   ├── Settings/
│   │   └── ChatbotSettings.tsx     # AI chatbot config (Task 5.1)
│   ├── AuthPages/
│   │   ├── SignIn.tsx              # Login with 2FA (Task 2.1)
│   │   └── SignUp.tsx              # Registration
│   └── [Other existing pages]
├── components/
│   ├── auth/                       # Auth-related components
│   ├── common/                     # Reusable components
│   ├── charts/                     # Chart components (ApexCharts)
│   ├── ecommerce/                  # Dashboard widgets
│   ├── form/                       # Form components
│   ├── header/                     # Header components
│   ├── tables/                     # Table components
│   └── ui/                         # UI element components
├── icons/
│   └── index.ts                    # Icon library
├── hooks/
│   ├── useGoBack.ts
│   └── useModal.ts
├── App.tsx                         # App routes configuration (i18n enabled)
├── main.tsx                        # App entry point (I18nProvider + ThemeProvider)
└── index.css                       # Global styles
```

## 🎯 Implemented Features (Epic 1)

### ✅ Task 1.1: Frontend Initialization
- Vite + React 19 + TypeScript setup
- Tailwind CSS 4 + PostCSS
- React Router 7 for navigation
- ApexCharts for analytics
- FullCalendar integration
- React DnD for drag & drop

### ✅ Task 1.2: Branding & Layout Customization
- Created `branding.ts` with Smart City colors & configuration
- Updated AppSidebar with Smart City-specific navigation:
  - **Quản lý Dữ liệu** (Data Management)
    - Users Management
    - Categories Management
    - Regions Management
    - Reports & Issues
  - **Thống kê & Báo cáo** (Analytics)
    - Rankings & Performance
    - SLA Statistics
    - Report Export
  - **Phân quyền** (Permissions)
  - **Cấu hình Hệ thống** (System Settings)
    - AI Chatbot Configuration
    - System Audit Logs
    - General Settings

### ✅ Task 1.4: Page Components Created
All Smart City module pages have been created with placeholder UI:
- **Users Page** - User list with pagination, search, lock/unlock
- **Categories Page** - Card-based category management
- **Regions Page** - Tree-view for administrative hierarchy
- **Reports Page** - Issue list with status filtering
- **Permissions Page** - Role-based access control matrix
- **Rankings Page** - Performance metrics table
- **Audit Logs Page** - System action history
- **Chatbot Settings Page** - AI configuration & FAQ management
- **Dashboard Heatmap Page** - Map visualization placeholder

### ✅ Task 1.5: Internationalization System
- Multi-language support (English default, Vietnamese)
- i18n context provider with language switching
- localStorage persistence for language preference
- 300+ translation keys covering all UI elements
- Automatic HTML lang attribute updates
- Zero additional dependencies - uses React Context API

### ✅ Task 1.6: CSS Improvements & Styling
- Consistent spacing and padding across all pages
- Rounded corners and hover effects on interactive elements
- Status badges with color coding (success, warning, error)
- Loading and error state indicators
- Improved form inputs with focus states
- Better visual hierarchy and typography
- Responsive design improvements
- Shadow effects on buttons and cards

## ✅ Epic 3: CRUD Modules - COMPLETE

### ✅ Task 3.1: User Management API Integration
- API service layer with full CRUD operations
- Pagination support (page, limit, totalPages)
- Search functionality connected to backend
- Loading states during data fetching
- Error handling with user-friendly messages
- Delete confirmation dialogs
- Role and status badge displays
- Improved table styling with hover effects

### ✅ Task 3.2: Category CRUD Operations
- Complete CRUD API integration
- Grid-based card layout
- Add/Edit/Delete operations
- Loading and empty states
- API error handling

### ✅ Task 3.3: Region Management with Tree Operations
- Hierarchical tree-view implementation
- Expand/collapse functionality
- API integration for region operations
- Administrative hierarchy display
- Edit and delete operations

## 🔜 Next Steps (Epic 2, 4-5)

### Epic 2: Authentication & Authorization
- [ ] Task 2.1: Auth API integration + 2FA UI
- [ ] Task 2.2: JWT middleware on backend
- [x] Task 2.3: Enhanced role permissions UI (Ready - i18n in place)
- [ ] Task 2.4: Protected routes with React Router

### Epic 4: Analytics & Maps
- [ ] Task 4.1: Enhanced ApexCharts dashboard
- [ ] Task 4.2: React-Leaflet heatmap integration
- [ ] Task 4.3: Performance ranking dashboard

### Epic 5: Advanced Features
- [ ] Task 5.1: OpenAI/Azure integration for chatbot
- [ ] Task 5.2: Audit log filtering & export
- [ ] Task 5.3: Excel/CSV export functionality

## 🛠 Technology Stack

- **UI Framework:** React 19
- **Language:** TypeScript 5.7
- **Styling:** Tailwind CSS 4
- **Build Tool:** Vite 6
- **Routing:** React Router 7
- **Charts:** ApexCharts
- **Calendar:** FullCalendar 6
- **Drag & Drop:** React DnD

## 🎨 Design System

### Color Palette
- **Primary:** #0066CC (Smart Blue)
- **Secondary:** #00AA44 (Success Green)
- **Warning:** #FB9139 (Orange)
- **Danger:** #EE3C3C (Red)
- **Info:** #3B82F6 (Light Blue)

### Typography
- **Font Family:** Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto
- **Base Size:** 16px

## 📦 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build locally

## 📚 Component Documentation

### Page Components
Each page component follows the pattern:
1. `PageMeta` - Sets page title in browser tabs
2. `PageBreadCrumb` - Navigation breadcrumb
3. `ComponentCard` - Card wrapper for content

### Example:
```tsx
import PageMeta from "@/components/common/PageMeta";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";

const MyPage: React.FC = () => {
  return (
    <>
      <PageMeta title="My Page" />
      <PageBreadCrumb pageName="My Page" />
      <ComponentCard>
        {/* Content here */}
      </ComponentCard>
    </>
  );
};
```

## 🌐 Internationalization (i18n)

The application supports multiple languages with a context-based i18n system:

### Usage in Components:
```tsx
import { useI18n } from "@/i18n/I18nContext";

const MyComponent: React.FC = () => {
  const { t, language, setLanguage } = useI18n();
  
  return (
    <div>
      <h1>{t("users.title")}</h1>
      <button onClick={() => setLanguage("vi")}>
        {t("common.vietnamese")}
      </button>
    </div>
  );
};
```

### Available Languages:
- **English (en)** - Default language
- **Vietnamese (vi)** - Full Vietnamese translation

### Translation Files:
- `src/i18n/en.json` - 300+ English translation keys
- `src/i18n/vi.json` - Full Vietnamese translations

Language preference is saved to localStorage and persists across sessions.

## 🔌 API Service Layer

All components use a centralized API service layer for database operations:

### Using API Services:
```tsx
import { usersService } from "@/services/users.service";

// Fetch users with pagination
const response = await usersService.getUsers(page, limit, search);
if (response.success) {
  // Use response.data
} else {
  // Handle response.error
}

// Create user
const createResponse = await usersService.createUser({
  name: "John Doe",
  email: "john@example.com",
  role: "officer",
  password: "password"
});

// Delete user
const deleteResponse = await usersService.deleteUser(userId);
```

### Available Services:
- **usersService** - User CRUD operations
- **categoriesService** - Categories management
- **regionsService** - Regions management
- **reportsService** - Reports/Issues management

### API Response Format:
All API methods return a consistent response structure:
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}
```

## 🔗 Backend Integration

The frontend is configured to connect to the backend API. Configure the base URL in `.env.local`:
- Development: `VITE_API_URL=http://localhost:3000/api`
- Production: Update `VITE_API_URL` environment variable

### Required API Endpoints

All endpoints must support Bearer token authentication in the `Authorization` header:
```
Authorization: Bearer {jwt_token}
```

#### 👥 Users Module (`/api/users`)

**GET /api/users**
- Fetch paginated users list
- Query Parameters: `page` (1-indexed), `limit`, `search` (optional)
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "officer|manager|admin",
      "status": "active|inactive",
      "lastLogin": "2024-01-15T10:30:00Z",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPages": 5
  }
}
```

**POST /api/users**
- Create new user
- Body:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "role": "officer",
  "password": "hashedPassword"
}
```
- Response: Created user object with `id`

**PATCH /api/users/:id**
- Update user information
- Body: Any fields to update (name, email, role, etc.)
- Response: Updated user object

**DELETE /api/users/:id**
- Delete user
- Response: `{ "success": true, "message": "User deleted" }`

**PATCH /api/users/:id/status**
- Change user status
- Body: `{ "status": "active|inactive" }`
- Response: Updated user object

#### 📂 Categories Module (`/api/categories`)

**GET /api/categories**
- Fetch all categories (no pagination)
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Category Name",
      "code": "CAT_001",
      "description": "Description",
      "color": "#0066CC",
      "icon": "icon_name",
      "parent_id": null,
      "order": 1,
      "status": "active|inactive",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**POST /api/categories**
- Create new category
- Body: Category object (name, code, description, color, icon, parent_id, order)
- Response: Created category with `id`

**PATCH /api/categories/:id**
- Update category
- Body: Fields to update
- Response: Updated category

**DELETE /api/categories/:id**
- Delete category
- Response: `{ "success": true, "message": "Category deleted" }`

#### 🗺️ Regions Module (`/api/regions`)

**GET /api/regions**
- Fetch hierarchical regions (tree structure)
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Region Name",
      "code": "REG_001",
      "parent_id": null,
      "level": 1,
      "children": [
        {
          "id": "uuid",
          "name": "Sub-region",
          "code": "REG_001_001",
          "parent_id": "uuid",
          "level": 2,
          "children": []
        }
      ],
      "status": "active|inactive",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**POST /api/regions**
- Create new region
- Body: `{ "name", "code", "parent_id" }`
- Response: Created region with `id` and `level`

**PATCH /api/regions/:id**
- Update region
- Body: Fields to update
- Response: Updated region

**DELETE /api/regions/:id**
- Delete region
- Response: `{ "success": true, "message": "Region deleted" }`

#### 📋 Reports Module (`/api/reports`)

**GET /api/reports**
- Fetch paginated reports/issues
- Query Parameters: `page`, `limit`, `status` (optional), `search` (optional)
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Report Title",
      "description": "Description text",
      "status": "open|in_progress|resolved|closed",
      "priority": "low|medium|high|critical",
      "category_id": "uuid",
      "region_id": "uuid",
      "reporter_name": "Citizen Name",
      "reporter_phone": "0123456789",
      "location": { "latitude": 10.7769, "longitude": 106.6969 },
      "attachments": ["url1", "url2"],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 120,
    "totalPages": 12
  }
}
```

**GET /api/reports/:id**
- Fetch report details
- Response: Single report object

**POST /api/reports**
- Create new report
- Body: Report object
- Response: Created report with `id`

**PATCH /api/reports/:id**
- Update report
- Body: Fields to update (status, priority, etc.)
- Response: Updated report

**DELETE /api/reports/:id**
- Delete report
- Response: `{ "success": true, "message": "Report deleted" }`

#### 🔧 General Requirements

**Error Response Format:**
All endpoints should return consistent error responses:
```json
{
  "success": false,
  "error": "Error message",
  "statusCode": 400
}
```

**Authentication:**
- Implement JWT token validation
- Return 401 Unauthorized for invalid/missing tokens
- Token should include user role for authorization checks

**CORS:**
- Enable CORS with frontend origin: `http://localhost:5173` (dev), production URL (prod)
- Allow credentials in CORS headers

**Rate Limiting (Optional but Recommended):**
- Implement rate limiting to prevent abuse
- Return 429 Too Many Requests when exceeded

## 📝 Environment Variables

Create a `.env.local` file for development:
```env
# API Configuration
VITE_API_URL=http://localhost:3000/api

# App Configuration
VITE_APP_NAME="Đô thị Thông minh Admin"
VITE_APP_TITLE="Smart City Admin Dashboard"
```

For production, set these environment variables in your deployment platform.

### Configuration via branding.ts
Additional configuration available in [src/config/branding.ts](src/config/branding.ts):
```typescript
settings: {
  apiBaseUrl: process.env.VITE_API_URL || "http://localhost:3000/api",
  defaultLanguage: "en",
  supportedLanguages: ["en", "vi"],
  pageSize: 10
}
```

## 🧪 Testing API Integration

### 1. Mock API Testing
If backend isn't ready, create mock API endpoints in your test/development environment.

### 2. Using Postman/curl
Test endpoints before integration:
```bash
# Get users (requires valid JWT token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/users?page=1&limit=10

# Create user
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "role": "officer",
    "password": "password"
  }'
```

### 3. Frontend Debugging
- Check browser Developer Tools > Network tab for API requests
- Verify CORS headers are correctly configured
- Check browser Console for any JavaScript errors
- Verify `VITE_API_URL` is correctly set in `.env.local`

### 4. Authentication Testing
Ensure your JWT token includes:
- User ID
- User role (officer, manager, admin)
- Token expiration time
- Signature verification

## ✅ API Integration Checklist

Use this checklist for backend development and integration testing:

### Backend Implementation
- [ ] Implement all `/api/users/*` endpoints with pagination
- [ ] Implement all `/api/categories/*` endpoints
- [ ] Implement all `/api/regions/*` endpoints with hierarchy
- [ ] Implement all `/api/reports/*` endpoints with filtering
- [ ] Add JWT authentication middleware
- [ ] Configure CORS for frontend origin
- [ ] Implement error response format (success: boolean)
- [ ] Add pagination metadata (page, limit, total, totalPages)
- [ ] Setup database schemas and relationships
- [ ] Create seed data for testing

### Frontend Integration Testing
- [ ] Verify Users page loads with API data
- [ ] Test pagination (page navigation, limit changes)
- [ ] Test search functionality for users
- [ ] Test create user functionality
- [ ] Test edit user functionality
- [ ] Test delete user with confirmation
- [ ] Test Categories CRUD operations
- [ ] Test Regions tree hierarchy display
- [ ] Test Reports status filtering
- [ ] Verify i18n works with API labels
- [ ] Test error handling (404, 500, etc.)
- [ ] Test authentication/token refresh flow

### Deployment
- [ ] Update `VITE_API_URL` in .env.production
- [ ] Test in production environment
- [ ] Verify HTTPS is enforced
- [ ] Setup monitoring and error tracking
- [ ] Create API documentation (OpenAPI/Swagger)
- [ ] Setup automated testing

## 🐛 Troubleshooting

### API Connection Issues

**Error: "Cannot read property 'data' of undefined"**
- Check if API endpoint is implemented
- Verify `VITE_API_URL` environment variable is set correctly
- Check browser Network tab to see if request is being sent
- Verify backend server is running

**Error: "401 Unauthorized"**
- JWT token may be expired or invalid
- Check if token is being sent in Authorization header
- Verify token format: `Authorization: Bearer {token}`
- Check token payload includes required fields

**Error: "CORS error - blocked by CORS policy"**
- Backend needs to enable CORS for frontend origin
- Add header: `Access-Control-Allow-Origin: http://localhost:5173`
- Configure CORS middleware in backend

**Error: "404 Not Found"**
- Endpoint path may be incorrect
- Check Backend Integration section above for correct paths
- Verify API prefix: `/api/` is included in endpoint URL

**List shows "No data found" but API call succeeded**
- Response format may not match expected structure
- Verify response has `data` array and `meta` object
- Check if API returns `success: true`
- Inspect Network tab > Response to see actual data format

### Frontend Issues

#### Port Already in Use

### Port Already in Use
```bash
# Change the port in vite.config.ts or use:
npm run dev -- --port 3001
```

### Build Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Module Not Found Errors
```bash
# Clear Vite cache
rm -rf dist .vite
npm run dev
```

### Language Not Switching
- Check localStorage in browser DevTools > Application > Local Storage
- Look for key `preferredLanguage`
- Verify i18n context is wrapping the entire app in main.tsx
- Check console for errors in i18n module

### API Calls Failing in Production
- Verify `VITE_API_URL` is set correctly for production
- Check if API uses HTTPS, update URL accordingly
- Verify backend CORS allows production frontend domain
- Check network tab for actual request URLs

## 📖 Additional Resources

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com)
- [Vite Documentation](https://vitejs.dev)

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/task-name`
2. Commit changes: `git commit -m "Add feature description"`
3. Push to branch: `git push origin feature/task-name`
4. Create a Pull Request

## 📄 License

MIT License - See LICENSE.md

---

**Last Updated:** January 2025
**Version:** 2.2.0 (Smart City Edition - API Integration Ready)
**Next Phase:** Backend API implementation and full integration testing
