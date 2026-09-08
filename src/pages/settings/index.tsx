import type { ReactElement } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { localizedAddressFormatLabel } from '@/components/domain/address/address-format-label';
import { FaLock } from "@/components/icons";
import { DisplayPreferences } from '@/components/settings/display-preferences';
import { Button } from "@/components/ui/button";
import type { ActionSection } from "@/components/ui/lists/action-list";
import { ActionList } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";


import { t } from '@/i18n';

/**
 * Constants for navigation paths and external links.
 */
const PATHS = {
  BACK: "/index",
  ADDRESS_TYPE: "/settings/address-types",
  ADVANCED: "/settings/advanced",
  CONNECTED_SITES: "/settings/connected-sites",
  SECURITY: "/settings/security",
  RESET_WALLET: "/keychain/wallets/reset",
  PINNED_ASSETS: "/settings/pinned-assets",
} as const;
const EXTERNAL_LINKS = {
  TERMS: "https://www.xcp.io/terms",
  PRIVACY: "https://www.xcp.io/privacy",
  WEBSITE: "https://www.xcp.io/?ref=wallet",
} as const;
// From the manifest, not `import packageJson`: importing the file inlines the whole of it —
// scripts, devDependencies — into the shipped bundle. The manifest version is the same string.
const VERSION = chrome.runtime.getManifest().version;

/**
 * Settings component provides a main settings menu with navigation options.
 *
 * Features:
 * - Lists wallet-specific and general settings options
 * - Includes an about section and a reset wallet button
 *
 * @returns {ReactElement} The rendered settings UI.
 * @example
 * ```tsx
 * <Settings />
 * ```
 */
export default function SettingsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, lockKeychain } = useWallet();

  // Configure header with lock button
  useEffect(() => {
    setHeaderProps({
      title: t('common_settings'),
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FaLock aria-hidden="true" />,
        onClick: async () => {
          await lockKeychain();
          navigate("/keychain/unlock");
        },
        ariaLabel: t('common_lock_keychain'),
      },
    });
  }, [setHeaderProps, navigate, lockKeychain]);

  /**
   * Gets a human-readable description for the wallet's address type.
   * @returns {string} The description of the address type.
   */
  const getAddressTypeDescription = (): string => {
    if (!activeWallet) return "";
    return localizedAddressFormatLabel(activeWallet.addressFormat);
  };

  const settingSections: ActionSection[] = [
    {
      title: t('common_settings'),
      items: [
        ...(activeWallet?.type === "mnemonic"
          ? [{
              id: "addressFormat",
              title: t('common_address_type'),
              description: getAddressTypeDescription(),
              onClick: () => navigate(PATHS.ADDRESS_TYPE),
            }]
          : []),
        {
          id: "advanced",
          title: t('common_advanced'),
          description: t('settings_network_settings_and_developer_options'),
          onClick: () => navigate(PATHS.ADVANCED),
        },
        {
          id: "connectedSites",
          title: t('common_connected_sites'),
          description: t('settings_manage_website_connections'),
          onClick: () => navigate(PATHS.CONNECTED_SITES),
        },
        {
          id: "pinnedAssets",
          title: t('common_pinned_assets'),
          description: t('settings_manage_assets_pinned_to_your'),
          onClick: () => navigate(PATHS.PINNED_ASSETS),
        },
        {
          id: "security",
          title: t('common_security'),
          description: t('settings_change_your_wallet_password'),
          onClick: () => navigate(PATHS.SECURITY),
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto no-scrollbar">
        <div className="p-4">
          <ActionList sections={settingSections} />
          <DisplayPreferences />

          <div className="mt-8">
            <h2 className="text-sm font-medium text-gray-500 px-4 mb-2">{t('settings_about_xcp_wallet')}</h2>
            <div className="bg-white rounded">
              <div className="p-4 border-b">
                <div className="text-sm">{t('settings_version', [String(VERSION)])}</div>
              </div>
              <a
                href={EXTERNAL_LINKS.TERMS}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border-b text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              >
                {t('common_terms_of_service')}
              </a>
              <a
                href={EXTERNAL_LINKS.PRIVACY}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border-b text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              >
                {t('common_privacy_policy')}
              </a>
              <a
                href={EXTERNAL_LINKS.WEBSITE}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              >
                {t('settings_visit_website')}
              </a>
            </div>
          </div>

          <div className="mt-8 mb-4">
            <Button
              color="red"
              onClick={() => navigate(PATHS.RESET_WALLET)}
              fullWidth
            >
              {t('common_reset_wallet')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
