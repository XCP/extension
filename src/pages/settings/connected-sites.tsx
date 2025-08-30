"use client";

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FiX, FiGlobe, FiHelpCircle } from "react-icons/fi";
import { FaSync } from "react-icons/fa";
import { Button } from "@/components/button";
import { useHeader } from "@/contexts/header-context";
import { getKeychainSettings, updateKeychainSettings } from "@/utils/storage/settingsStorage";
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
      setIsLoading(false);
    }
  }, []);

  /**
   * Disconnects a site.
   */
  const handleDisconnectSite = async (origin: string) => {
    try {
      // Update UI immediately for instant feedback
      setConnectedSites(prev => prev.filter(site => site.origin !== origin));
      
      // Call provider service in background (for proper cleanup/events)
      const providerService = getProviderService();
      providerService.disconnect(origin).catch(error => {
        console.error('Provider disconnect error:', error);
        // Reload if there was an error to ensure UI is in sync
        loadConnections();
      });
    } catch (error) {
      console.error('Failed to disconnect site:', error);
      loadConnections(); // Reload on error
    }
  };

  /**
   * Disconnects all sites.
   */
  const handleDisconnectAll = useCallback(async () => {
    try {
      // Update UI immediately for instant feedback
      const sitesToDisconnect = [...connectedSites];
      setConnectedSites([]);
      
      // Call provider service for each site in background
      const providerService = getProviderService();
      const disconnectPromises = sitesToDisconnect.map(site => 
        providerService.disconnect(site.origin).catch(err => {
          console.error(`Failed to disconnect ${site.origin}:`, err);
        })
      );
      
      Promise.all(disconnectPromises).catch(() => {
        // If something went wrong, reload to ensure UI is in sync
        loadConnections();
      });
    } catch (error) {
      console.error('Failed to disconnect all sites:', error);
      loadConnections(); // Reload on error
    }
  }, [connectedSites, loadConnections]);


  // Configure header with reset button when sites exist, help button otherwise
  useEffect(() => {
    setHeaderProps({
      title: "Connected Sites",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
      rightButton: connectedSites.length > 0 ? {
        icon: <FaSync aria-hidden="true" />,
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
    </div>
  );
}