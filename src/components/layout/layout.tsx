import type { ReactElement } from 'react';
import { Outlet } from 'react-router';
import { ApiStatusBanner } from '@/components/layout/api-status-banner';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { useHeader } from '@/contexts/header-context';

interface LayoutProps {
  showFooter?: boolean;
}

/**
 * Layout provides the main application shell with optional footer navigation.
 *
 * @param props - The component props
 * @returns A ReactElement containing the app layout structure
 */
export function Layout({ showFooter = false }: LayoutProps): ReactElement {
  const { headerProps } = useHeader();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-100">
      <Header {...headerProps} />
      <ApiStatusBanner />
      <main className="relative min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <Outlet />
      </main>
      {showFooter && <Footer />}
    </div>
  );
}
