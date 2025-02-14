import { Outlet } from 'react-router-dom';
import { Header } from '@/components/header';
import { useHeader } from '@/contexts/header-context';
import { useLoading } from '@/contexts/loading-context';
import Footer from '@/components/footer';
import { Loading } from '@/components/loading';

interface LayoutProps {
  showFooter?: boolean;
}

export function Layout({ showFooter = false }: LayoutProps) {
  const { headerProps } = useHeader();
  const { isLoading, message } = useLoading();

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <Loading message={message} />
      </div>
    );
  }

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
