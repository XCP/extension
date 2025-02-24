"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiX } from "react-icons/fi";
import { Button } from "@/components/button";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths.
 */
const CONSTANTS = {
  PATHS: {
    BACK: "/settings",
  } as const,
} as const;

/**
 * ConnectedSitesSettings component manages and displays connected websites.
 *
 * Features:
 * - Lists connected sites with an option to disconnect each
 * - Updates settings context on disconnection
 *
 * @returns {ReactElement} The rendered connected sites settings UI.
 * @example
 * ```tsx
 * <ConnectedSitesSettings />
 * ```
 */
export default function ConnectedSitesSettings(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Connected",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  /**
   * Disconnects a site by removing it from the connected websites list.
   * @param siteToRemove - The site URL to disconnect.
   */
  const handleDisconnect = (siteToRemove: string) => {
    const updatedSites = settings.connectedWebsites.filter((site) => site !== siteToRemove);
    updateSettings({ connectedWebsites: updatedSites });
  };

  return (
    <div className="p-4" role="main" aria-labelledby="connected-sites-title">
      <h2 id="connected-sites-title" className="sr-only">
        Connected Sites Settings
      </h2>
      {settings.connectedWebsites.length > 0 ? (
        <ul className="space-y-2">
          {settings.connectedWebsites.map((site) => (
            <li
              key={site}
              className="p-3 bg-white rounded-lg shadow flex justify-between items-center"
            >
              <span>{site}</span>
              <Button
                color="red"
                onClick={() => handleDisconnect(site)}
                aria-label={`Disconnect ${site}`}
              >
                <FiX className="w-4 h-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center text-gray-500 py-8">No connected sites.</div>
      )}
    </div>
  );
}
