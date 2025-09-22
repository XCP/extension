import { Outlet } from 'react-router-dom';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { useHeader } from '@/contexts/header-context';

interface LayoutProps {
  showFooter?: boolean;
}

export function Layout({ showFooter = false }: LayoutProps) {
  const { headerProps } = useHeader();

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Header {...headerProps} />
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <Outlet />
      </main>
      {showFooter && <Footer />}
    </div>
  );
}
