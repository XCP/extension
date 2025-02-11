import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { FiX } from 'react-icons/fi';
import { Button } from '@/components/button';

export function ConnectedSitesSettings() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    setHeaderProps({
      title: 'Connected Sites',
      onBack: () => navigate('/settings'),
    });
  }, [setHeaderProps, navigate]);

  const handleDisconnect = (siteToRemove: string) => {
    const updatedSites = settings.connectedWebsites.filter(site => site !== siteToRemove);
    updateSettings({ connectedWebsites: updatedSites });
  };

  return (
    <div className="p-4">
      {settings.connectedWebsites.length > 0 ? (
        <ul className="space-y-2">
          {settings.connectedWebsites.map((site) => (
            <li key={site} className="p-3 bg-white rounded-lg shadow flex justify-between items-center">
              <span>{site}</span>
              <Button
                color="red"
                variant="ghost"
                size="sm"
                onClick={() => handleDisconnect(site)}
                aria-label={`Disconnect ${site}`}
              >
                <FiX className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center text-gray-500 py-8">
          No connected sites.
        </div>
      )}
    </div>
  );
}

export default ConnectedSitesSettings;
