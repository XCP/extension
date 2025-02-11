import { Outlet } from 'react-router-dom';
import { Header } from '@/components/header';
import { useHeader } from '@/contexts/header-context';
import Footer from '@/components/footer';

interface LayoutProps {
  showFooter?: boolean;
}

export function Layout({ showFooter = false }: LayoutProps) {
  const { headerProps } = useHeader();

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Header {...headerProps} />
      <main className="flex-1 overflow-y-auto no-scrollbar">
        <Outlet />
      </main>
      {showFooter && <Footer />}
    </div>
  );
}
