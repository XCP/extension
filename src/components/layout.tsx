import { type ReactElement } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
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
    <div className="flex flex-col h-dvh bg-gray-100">
      <Header {...headerProps} />
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <Outlet />
      </main>
      {showFooter && <Footer />}
    </div>
  );
}
