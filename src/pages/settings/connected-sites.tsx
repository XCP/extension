import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { FiGlobe, FiHelpCircle, FiRefreshCw } from "@/components/icons";
import { ConnectedSiteCard } from "@/components/ui/cards/connected-site-card";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { getProviderService } from "@/services/providerService";

/**
 * Constants for navigation paths.
 */
const PATHS = {
  BACK: "/settings",
  HELP_URL: "https://youtube.com", // Placeholder for now
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
export default function ConnectedSitesPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  // Read from settings rather than fetching separately: the connected sites are part of them, and
  // the provider keeps them current when one connects or disconnects in another window.
  const { settings, isLoading } = useSettings();

  const connectedSites = useMemo<ConnectedSite[]>(
    () => settings.connectedWebsites.map(origin => ({
      origin,
      hostname: new URL(origin).hostname,
    })),
    [settings.connectedWebsites]
  );

  /**
   * Disconnects a site.
   */
  const handleDisconnectSite = async (origin: string) => {
    try {
      const providerService = getProviderService();
      // Disconnecting rewrites the settings, and the list follows from those — so there is nothing
      // to update here. A failure leaves the site listed, which is the truth.
      await providerService.disconnect(origin);
    } catch (error) {
      console.error('Failed to disconnect site:', error);
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
    } catch (error) {
      console.error('Failed to disconnect all sites:', error);
    }
  }, [connectedSites]);


  // Configure header with reset button when sites exist, help button otherwise
  useEffect(() => {
    setHeaderProps({
      title: "Connected Sites",
      onBack: () => navigate(PATHS.BACK),
      rightButton: connectedSites.length > 0 ? {
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: handleDisconnectAll,
        ariaLabel: "Disconnect all sites",
      } : {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => window.open(PATHS.HELP_URL, "_blank"),
        ariaLabel: "Help",
      },
    });
  }, [setHeaderProps, navigate, connectedSites.length, handleDisconnectAll]);


  if (isLoading) {
    return <Spinner message="Loading connected sites…" />;
  }

  return (
    <section className={connectedSites.length === 0 ? 'h-full flex items-center justify-center' : 'p-4 space-y-4'} aria-labelledby="connected-sites-title">
      <h2 id="connected-sites-title" className="sr-only">
        Connected Sites
      </h2>

      {connectedSites.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <FiGlobe className="size-12 text-gray-400 mx-auto mb-3" aria-hidden="true" />
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
    </section>
  );
}