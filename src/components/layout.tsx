import { Outlet } from 'react-router-dom';
import { Header } from '@/components/header';
import { useHeader } from '@/contexts/header-context';

export function Layout() {
  const { headerProps } = useHeader();

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Header {...headerProps} />
      <main className="flex-1 overflow-y-auto no-scrollbar">
        <Outlet />
      </main>
    </div>
  );
}
