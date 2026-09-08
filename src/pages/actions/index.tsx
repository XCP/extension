import type { ReactElement } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { FaLock } from "@/components/icons";
import type { ActionSection } from "@/components/ui/lists/action-list";
import { ActionList } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { isSegwitFormat } from '@/core/bitcoin/address';

import { t } from '@/i18n';

/**
 * Constants for navigation paths.
 */
const PATHS = {
  BACK: "/index",
} as const;

const getActionSections = (
  isSegwitWallet: boolean,
  enableMPMA: boolean,
  showRecoverBitcoinNotification: boolean,
  navigate: (path: string) => void
): ActionSection[] => {
  const sections: ActionSection[] = [
    {
      title: t('actions_tools'),
      items: [
        {
          id: "sign-message",
          title: t('common_sign_message'),
          description: t('actions_sign_a_message_with_your'),
          onClick: () => navigate("/actions/sign-message"),
        },
        {
          id: "verify-message",
          title: t('common_verify_message'), 
          description: t('actions_verify_a_signed_message'),
          onClick: () => navigate("/actions/verify-message"),
        },
        // Bare multisig recovery only exists for legacy P2PKH-based addresses
        ...(!isSegwitWallet ? [{
          id: "consolidate",
          title: t('actions_recover_bitcoin'),
          description: t('actions_find_and_consolidate_bare_multisig'),
          onClick: () => navigate("/actions/consolidate"),
          showNotification: showRecoverBitcoinNotification,
          className: showRecoverBitcoinNotification ? "!border !border-orange-500" : "",
        }] : []),
        ...(enableMPMA ? [{
          id: "upload-mpma",
          title: t('actions_upload_mpma'),
          description: t('actions_multi_party_multi_asset_transaction'),
          onClick: () => navigate("/compose/send/mpma"),
        }] : []),
      ],
    },
    {
      title: t('common_assets'),
      items: [
        {
          id: "issue-asset",
          title: t('common_issue_asset'),
          description: t('actions_create_a_new_asset'),
          onClick: () => navigate("/compose/issuance"),
        },
        {
          id: "mint-supply",
          title: t('common_start_mint'),
          description: t('actions_create_a_fairminter'), 
          onClick: () => navigate("/compose/fairminter"),
        },
      ],
    },
    {
      title: t('actions_address'),
      items: [
        {
          id: "compose-broadcast",
          title: isSegwitWallet ? "Broadcast" : t('actions_broadcast_text'),
          description: isSegwitWallet ? t('actions_broadcast_message_or_inscription') : t('actions_broadcast_message_from_address'),
          onClick: () => navigate("/compose/broadcast"),
        },
        {
          id: "compose-sweep",
          title: t('common_sweep_address'),
          description: t('actions_transfer_every_asset_and_balance'),
          onClick: () => navigate("/compose/sweep"),
        },
        {
          id: "compose-broadcast-address-options",
          title: t('actions_update_options'), 
          description: t('actions_set_address_options_like_requiring'),
          onClick: () => navigate("/compose/broadcast/address-options"),
        },
      ],
    },
    {
      title: "DEX",
      items: [
        {
          id: "cancel-order",
          title: t('actions_cancel_order'),
          description: t('actions_cancel_an_existing_order'),
          onClick: () => navigate("/compose/order/cancel"),
        },
        {
          id: "create-dispenser",
          title: t('actions_create_dispenser'),
          description: t('actions_sell_an_asset_at_a'),
          onClick: () => navigate("/compose/dispenser"),
        },
        {
          id: "close-dispenser",
          title: t('actions_close_dispenser'), 
          description: t('actions_close_an_existing_dispenser'),
          onClick: () => navigate("/compose/dispenser/close"),
        },
        {
          id: "close-dispenser-by-hash",
          title: t('actions_close_dispenser_by_hash'),
          description: t('actions_close_a_dispenser_using_its'),
          onClick: () => navigate("/compose/dispenser/close-by-hash"),
        },
      ],
    },
  ];

  return sections;
};

/**
 * ActionsScreen component displays a list of actionable wallet operations.
 *
 * Features:
 * - Groups actions into categories (Basic, Assets, DEX, etc.)
 * - Navigates to specific action paths on click
 *
 * @returns {ReactElement} The rendered actions screen UI.
 * @example
 * ```tsx
 * <ActionsScreen />
 * ```
 */
export default function ActionsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, lockKeychain } = useWallet();
  const { settings } = useSettings();
  
  // Check if active wallet uses SegWit addresses (P2WPKH, P2SH-P2WPKH, or P2TR)
  const isSegwitWallet = activeWallet?.addressFormat ? isSegwitFormat(activeWallet.addressFormat) : false;
  
  // Check if MPMA is enabled
  const enableMPMA = settings?.enableMPMA ?? false;

  // Check if user has visited recover bitcoin page
  const showRecoverBitcoinNotification = !settings?.hasVisitedRecoverBitcoin;
  
  // Get dynamic action sections based on wallet type and settings
  const actionSections = getActionSections(isSegwitWallet, enableMPMA, showRecoverBitcoinNotification, navigate);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('common_actions'),
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

  return (
    <section className="flex flex-col h-full" aria-labelledby="actions-title">
      <h2 id="actions-title" className="sr-only">
        {t('actions_wallet_actions')}
      </h2>
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        <ActionList sections={actionSections} />
      </div>
    </section>
  );
}
