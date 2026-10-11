import type { ReactElement } from 'react';
import { NavLink } from 'react-router';
import { FaCog, FaTools, FaUniversity, FaWallet } from '@/components/icons';
import { useSettings } from '@/contexts/settings-context';
import { useWallet } from '@/contexts/wallet-context';
import { isSegwitFormat } from '@/core/bitcoin/addressFormat';

import { t } from '@/i18n';
/**
 * Footer provides bottom navigation with icons for main app sections.
 *
 * @returns A ReactElement representing the footer navigation bar
 */
export const Footer = (): ReactElement => {
  const { settings } = useSettings();
  const { activeWallet } = useWallet();

  // Show notification if user hasn't visited recover bitcoin page.
  // The recovery tool only applies to legacy P2PKH-based wallets, so
  // SegWit/Taproot wallets (which have no "Recover Bitcoin" action) never see it.
  const isLegacyWallet = activeWallet?.addressFormat
    ? !isSegwitFormat(activeWallet.addressFormat)
    : false;
  const showRecoverBitcoinNotification =
    isLegacyWallet && !settings?.hasVisitedRecoverBitcoin;

  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `w-full py-3 px-4 rounded flex items-center justify-center hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-200 focus-visible:ring-offset-2 ${isActive ? 'text-blue-600' : 'text-gray-600'}`;

  return (
    <footer className="shrink-0 border-t border-gray-300 bg-white p-2" aria-label={t('layout_footer_primary')}>
      <nav aria-label={t('layout_footer_primary')} className="grid grid-cols-4 gap-2">
        <NavLink
          to="/index"
          end
          className={linkClassName}
          aria-label={t('layout_footer_wallet')}
        >
          <div className="flex flex-col items-center">
            <FaWallet className="text-lg mb-1" aria-hidden="true" />
          </div>
        </NavLink>
        <NavLink
          to="/market"
          className={linkClassName}
          aria-label={t('common_market')}
        >
          <div className="flex flex-col items-center">
            <FaUniversity className="text-lg mb-1" aria-hidden="true" />
          </div>
        </NavLink>
        <NavLink
          to="/actions"
          className={linkClassName}
          aria-label={t('common_actions')}
        >
          <div className="flex flex-col items-center relative">
            <FaTools className="text-lg mb-1" aria-hidden="true" />
            {/* Bitcoin orange notification badge */}
            {showRecoverBitcoinNotification && (
              <span className="absolute -top-1 -right-3 size-2 bg-orange-500 rounded-full"></span>
            )}
          </div>
        </NavLink>
        <NavLink
          to="/settings"
          className={linkClassName}
          aria-label={t('common_settings')}
        >
          <div className="flex flex-col items-center">
            <FaCog className="text-lg mb-1" aria-hidden="true" />
          </div>
        </NavLink>
      </nav>
    </footer>
  );
};
