import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { SidebarProvider } from '../context/SidebarContext';
import { useSidebar } from '../context/sidebar-context';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';
import Backdrop from './Backdrop';

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen xl:flex">
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${
          isExpanded || isHovered ? 'lg:ml-72.5' : 'lg:ml-22.5'
        } ${isMobileOpen ? 'ml-0' : ''}`}
      >
        <AppHeader />
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          <Suspense
            fallback={
              <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
                Loading page...
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
