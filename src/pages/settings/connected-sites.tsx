"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiX, FiGlobe, FiClock } from "react-icons/fi";
import { Button } from "@/components/button";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { getKeychainSettings } from "@/utils/storage/settingsStorage";
import { trackEvent } from "@/utils/fathom";
import { getProviderService } from "@/services/providerService";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths.
 */
const CONSTANTS = {
  PATHS: {
    BACK: "/settings",
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
  const [loading, setLoading] = useState(true);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Connected Sites",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  // Load connections on mount
  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      setLoading(true);
      console.log('Loading connected sites from settings...');
      const settings = await getKeychainSettings();
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
      setLoading(false);
    }
  };

  /**
   * Disconnects a site.
   */
  const handleDisconnectSite = async (origin: string) => {
    const hostname = new URL(origin).hostname;
    if (!confirm(`Disconnect ${hostname}?\n\nThis site will need to request permission again to access your wallet.`)) {
      return;
    }

    try {
      // Track the disconnect event
      await trackEvent('site_disconnect');
      
      // Use provider service to disconnect and emit events
      const providerService = getProviderService();
      await providerService.disconnect(origin);
      
      // Reload connections
      await loadConnections();
    } catch (error) {
      console.error('Failed to disconnect site:', error);
    }
  };

  /**
   * Disconnects all sites.
   */
  const handleDisconnectAll = async () => {
    if (!confirm('Disconnect all sites?\n\nAll connected sites will need to request permission again.')) {
      return;
    }

    try {
      // Track the disconnect all event
      await trackEvent('disconnect_all_sites');
      
      // Use provider service to disconnect each site
      const providerService = getProviderService();
      await Promise.all(
        connectedSites.map(site => providerService.disconnect(site.origin))
      );
      
      await loadConnections();
    } catch (error) {
      console.error('Failed to disconnect all sites:', error);
    }
  };


  if (loading) {
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
    <div className="p-4 space-y-4" role="main" aria-labelledby="connected-sites-title">
      <h2 id="connected-sites-title" className="sr-only">
        Connected Sites
      </h2>
      
      {/* Header with disconnect all button */}
      {connectedSites.length > 0 && (
        <div className="flex justify-end">
          <Button
            color="red"
            onClick={handleDisconnectAll}
          >
            Disconnect All
          </Button>
        </div>
      )}

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
            <div
              key={site.origin}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FiGlobe className="w-4 h-4 text-gray-400" />
                  <div>
                    <h3 className="font-medium">{site.hostname}</h3>
                    <p className="text-xs text-gray-500">{site.origin}</p>
                  </div>
                </div>
                
                <button
                  onClick={() => handleDisconnectSite(site.origin)}
                  className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                  title="Disconnect site"
                >
                  <FiX className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info section */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="text-sm font-medium text-blue-900 mb-2">About Connected Sites</h3>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• Sites connect to your wallet and can see your active address</li>
          <li>• When you switch addresses, connected sites are notified</li>
          <li>• Sites must request approval for each transaction</li>
          <li>• You can disconnect sites at any time</li>
        </ul>
      </div>
    </div>
  );
}