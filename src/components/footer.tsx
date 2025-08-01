import { useNavigate, useLocation } from 'react-router-dom';
import { FaWallet, FaUniversity, FaTools, FaCog } from 'react-icons/fa';
import { Button } from '@/components/button';

export const Footer = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (route: string, eventName: string) => {
    navigate(route);
  };

  return (
    <div className="p-2 bg-white border-t border-gray-300">
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant="transparent"
          fullWidth
          onClick={() => handleNavigation('/index', 'Footer - Main')}
          className={`hover:bg-gray-100 ${location.pathname === '/index' ? 'text-blue-600' : 'text-gray-600'}`}
        >
          <div className="flex flex-col items-center">
            <FaWallet className="text-lg mb-1" />
          </div>
        </Button>
        <Button
          variant="transparent"
          fullWidth
          onClick={() => handleNavigation('/market', 'Footer - Market')}
          className={`hover:bg-gray-100 ${location.pathname === '/market' ? 'text-blue-600' : 'text-gray-600'}`}
        >
          <div className="flex flex-col items-center">
            <FaUniversity className="text-lg mb-1" />
          </div>
        </Button>
        <Button
          variant="transparent"
          fullWidth
          onClick={() => handleNavigation('/actions', 'Footer - Actions')}
          className={`hover:bg-gray-100 ${location.pathname === '/actions' ? 'text-blue-600' : 'text-gray-600'}`}
        >
          <div className="flex flex-col items-center">
            <FaTools className="text-lg mb-1" />
          </div>
        </Button>
        <Button
          variant="transparent"
          fullWidth
          onClick={() => handleNavigation('/settings', 'Footer - Settings')}
          className={`hover:bg-gray-100 ${location.pathname === '/settings' ? 'text-blue-600' : 'text-gray-600'}`}
        >
          <div className="flex flex-col items-center">
            <FaCog className="text-lg mb-1" />
          </div>
        </Button>
      </div>
    </div>
  );
};
