# Urban Management Admin Web

React frontend for Smart City Admin Dashboard - comprehensive system for managing urban incidents, citizen reports, and administrative operations.

## FE Handoff & Integration

- **Development Server**: `http://localhost:5173`
- **API Documentation**: See [apps/api/docs/FE_INTEGRATION.md](../api/docs/FE_INTEGRATION.md)
- **API Setup Guide**: See [README-SMARTCITY.md](./README-SMARTCITY.md)
- **Local API Endpoint**: `http://localhost:3001/api`

## Quick Start

### Prerequisites

- Node.js 18.x or later (Node.js 20.x recommended)
- pnpm (monorepo package manager)

### Installation

```bash
# Install dependencies from root
pnpm install

# Navigate to admin-web directory
cd apps/admin-web

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Available Scripts

- `pnpm dev` - Start development server (port 5173)
- `pnpm build` - Build production bundle
- `pnpm format` - Format code with Prettier
- `pnpm lint` - Run ESLint checks
- `pnpm lint:fix` - Fix ESLint issues
- `pnpm type-check` - Check TypeScript types
- `pnpm test` - Run tests with Vitest
- `pnpm test:ui` - Run tests with UI
- `pnpm preview` - Preview production build locally

## Project Structure

```
src/
├── config/              # Application configuration
├── i18n/                # Internationalization (English & Vietnamese)
├── services/            # API service layer
├── context/             # React context (Theme, Sidebar, i18n)
├── layout/              # Layout components (Header, Sidebar)
├── pages/               # Page components organized by feature
├── components/          # Reusable components
├── types/               # TypeScript type definitions
├── hooks/               # Custom React hooks
├── icons/               # Icon definitions
└── main.tsx             # Application entry point
```

## Shared Packages

The project uses workspace packages for shared functionality:

- `@urban/shared-constants` - Shared constants across applications
- `@urban/shared-types` - Shared TypeScript types
- `@urban/shared-utils` - Shared utility functions

## Technology Stack

- **Framework**: React 19
- **Language**: TypeScript 5.7
- **Styling**: Tailwind CSS 4
- **Build Tool**: Vite 6
- **Routing**: React Router 7
- **Testing**: Vitest
- **Linting**: ESLint + Prettier
- **Charts**: ApexCharts
- **Calendar**: FullCalendar 6
- **UI Components**: Custom Tailwind-based components

## Environment Configuration

Create a `.env.local` file in the project root:

```env
VITE_API_URL=http://localhost:3001/api
VITE_APP_NAME="Urban Management Admin"
VITE_APP_TITLE="Smart City Admin Dashboard"
```

## Development Guidelines

### Code Quality

All code must follow the established standards:

```bash
# Format code
pnpm format

# Check TypeScript
pnpm type-check

# Lint and fix
pnpm lint:fix

# Run tests
pnpm test
```

### ESLint & Prettier

- ESLint configuration: `.eslintc.mjs` (using Flat Config format matching API)
- Prettier configuration: `.prettierrc` (single quotes, trailing commas)
- Both are integrated and run automatically on commit via pre-commit hooks

### Shared Packages Integration

Import from shared packages for consistency:

```typescript
// Constants
import { ROLES, STATUSES } from '@urban/shared-constants';

// Types
import type { User, Category, Region } from '@urban/shared-types';

// Utilities
import { createUlid, formatDate } from '@urban/shared-utils';
```

## API Integration

Admin-web implements a centralized API service layer. See [README-SMARTCITY.md](./README-SMARTCITY.md) for detailed API documentation.

### Service Layer Pattern

```typescript
// Service usage
import { usersService } from '@/services/users.service';

const response = await usersService.getUsers(page, limit, search);
if (response.success) {
  // Handle success
} else {
  // Handle error
}
```

All services follow a consistent response format with error handling and TypeScript types.

## Internationalization (i18n)

Bilingual support (English & Vietnamese):

```typescript
import { useI18n } from '@/i18n/I18nContext';

const { t, language, setLanguage } = useI18n();
// Usage: t('users.title'), setLanguage('vi')
```

Language preference is persisted in localStorage.

## Testing

```bash
# Run all tests
pnpm test

# Run with UI
pnpm test:ui

# Watch mode
pnpm test -- --watch
```

Test files should be collocated with source files using `.spec.ts` suffix.

## Build & Deployment

### Production Build

```bash
pnpm build
```

Output is in the `dist/` directory.

### Preview

```bash
pnpm preview
```

## Troubleshooting

### Common Issues

**API Connection Failed**
- Verify `VITE_API_URL` in `.env.local`
- Check if backend API is running on port 3001
- Check CORS configuration on backend

**Module Not Found**
- Run `pnpm install` to ensure all dependencies are installed
- Verify path aliases in `tsconfig.app.json` and `vite.config.ts`

**Port Already in Use**
- Change Vite port: `pnpm dev -- --port 5174`

**Build Errors**
- Clear build cache: `rm -rf dist .vite`
- Reinstall dependencies: `pnpm install`

## Related Documentation

- [Backend API Documentation](../api/README.md)
- [API Integration Guide](../api/docs/FE_INTEGRATION.md)
- [Smart City Setup](./README-SMARTCITY.md)
- [Shared Packages](../../packages/)

## Contributing

1. Create a feature branch: `git checkout -b feature/task-name`
2. Make your changes following the code quality guidelines
3. Run tests and linting: `pnpm test && pnpm lint:fix`
4. Commit: `git commit -m "Add feature description"`
5. Push: `git push origin feature/task-name`
6. Create a Pull Request with description of changes

## License

MIT License - See LICENSE.md

---

**Last Updated**: March 2026  
**Version**: 0.0.1-alpha  
**Status**: Active Development (aligned with API standards)
