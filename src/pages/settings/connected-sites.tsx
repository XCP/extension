
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle, FiGlobe, FiRefreshCw } from "@/components/icons";
import { ConnectedSiteCard } from "@/components/cards/connected-site-card";
import { useHeader } from "@/contexts/header-context";
import { walletManager } from "@/utils/wallet/walletManager";
import { getProviderService } from "@/services/providerService";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths.
 */
const CONSTANTS = {
  PATHS: {
    BACK: "/settings",
    HELP_URL: "https://youtube.com", // Placeholder for now
  } as const,
} as const;

interface ConnectedSite {
  origin: string;
  hostname: string;
}

/**
 * ConnectedSites component manages and displays connected websites.
 *
 * Features:
 * - Lists connected sites
 * - Allows disconnecting sites
 * - Simple wallet-level connections
 *
 * @returns {ReactElement} The rendered connected sites settings UI.
 */
export default function ConnectedSites(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const [connectedSites, setConnectedSites] = useState<ConnectedSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadConnections = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('Loading connected sites from settings...');
      const settings = walletManager.getSettings();
      console.log('Connected websites:', settings.connectedWebsites);
      
      // Convert origins to ConnectedSite objects
      const sites: ConnectedSite[] = settings.connectedWebsites.map(origin => ({
        origin,
        hostname: new URL(origin).hostname
      }));

      setConnectedSites(sites);
    } catch (error) {
      console.error('Failed to load connections:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Disconnects a site.
   */
  const handleDisconnectSite = async (origin: string) => {
    try {
      const providerService = getProviderService();
      await providerService.disconnect(origin);

      // Only update UI after successful disconnect
      setConnectedSites(prev => prev.filter(site => site.origin !== origin));
    } catch (error) {
      console.error('Failed to disconnect site:', error);
      // Don't reload - just log the error
    }
  };

  /**
   * Disconnects all sites.
   */
  const handleDisconnectAll = useCallback(async () => {
    try {
      const sitesToDisconnect = [...connectedSites];
      const providerService = getProviderService();

      // Disconnect all sites and wait for completion
      const disconnectPromises = sitesToDisconnect.map(site =>
        providerService.disconnect(site.origin).catch(err => {
          console.error(`Failed to disconnect ${site.origin}:`, err);
        })
      );

      await Promise.all(disconnectPromises);

      // Only update UI after all disconnects complete
      setConnectedSites([]);
    } catch (error) {
      console.error('Failed to disconnect all sites:', error);
    }
  }, [connectedSites]);


  // Configure header with reset button when sites exist, help button otherwise
  useEffect(() => {
    setHeaderProps({
      title: "Connected Sites",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
      rightButton: connectedSites.length > 0 ? {
        icon: <FiRefreshCw aria-hidden="true" />,
        onClick: handleDisconnectAll,
        ariaLabel: "Disconnect all sites",
      } : {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: () => window.open(CONSTANTS.PATHS.HELP_URL, "_blank"),
        ariaLabel: "Help",
      },
    });
  }, [setHeaderProps, navigate, connectedSites.length, handleDisconnectAll]);

  // Load connections on mount
  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={connectedSites.length === 0 ? 'h-full flex items-center justify-center' : 'p-4 space-y-4'} role="main" aria-labelledby="connected-sites-title">
      <h2 id="connected-sites-title" className="sr-only">
        Connected Sites
      </h2>

      {connectedSites.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <FiGlobe className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No connected sites</p>
          <p className="text-sm text-gray-500 mt-1">
            Sites you connect to will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {connectedSites.map((site) => (
            <ConnectedSiteCard
              key={site.origin}
              hostname={site.hostname}
              origin={site.origin}
              onDisconnect={() => handleDisconnectSite(site.origin)}
            />
          ))}
        </div>
      )}
    </div>
  );
}