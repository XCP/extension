import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import zeldIcon from '@/assets/zeld.svg';
import { BalanceHeader } from '@/components/domain/balance/balance-header';
import { HuntSettings } from '@/components/domain/zeld/hunt-settings';
import { FiInfo } from '@/components/icons';
import type { ActionSection } from '@/components/ui/lists/action-list';
import { ActionList } from '@/components/ui/lists/action-list';
import { Spinner } from '@/components/ui/spinner';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { useWallet } from '@/contexts/wallet-context';
import type { TokenBalance } from '@/core/counterparty/api';
import { formatAmount } from '@/core/format';
import {
  ZELD_DISPLAY_NAME,
  zeldBaseUnitsToDisplay,
} from '@/core/zeld/api';
import { huntsWhileSigning } from '@/core/zeld/eligibility';
import { isHuntableAddressFormat } from '@/core/zeld/huntTemplate';
import { useZeldBalance } from '@/hooks/useZeldBalance';
import { t } from '@/i18n';

const EXPLORER_TX_URL = 'https://mempool.space/tx/';

function shortTxid(txid: string): string {
  return `${txid.slice(0, 12)}…${txid.slice(-6)}`;
}

/**
 * The ZELD balance page: what the address holds, where it sits, what it has earned, and the one
 * setting that earns more. Reads come from the ZeldHash indexer and mempool.space; nothing here
 * can move ZELD, the send page does that.
 */
export default function ZeldPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress, activeWallet } = useWallet();
  const address = activeAddress?.address;
  const { settings } = useSettings();
  const { balance, rewards, reservedSats, error, loading, retry } = useZeldBalance(address);
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const shouldShowHelpText = isHelpTextOverride ? !settings.showHelpText : settings.showHelpText;

  useEffect(() => {
    setHeaderProps({
      title: ZELD_DISPLAY_NAME,
      onBack: () => { void navigate('/index'); },
      rightButton: {
        icon: <FiInfo className="size-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((previous) => !previous),
        ariaLabel: t('common_toggle_help_text'),
      },
    });
    return () => setHeaderProps(null);
  }, [navigate, setHeaderProps]);

  if (loading && !balance) return <Spinner message={t('zeld_loading')} />;

  const token: TokenBalance = {
    asset: ZELD_DISPLAY_NAME,
    quantity_normalized: zeldBaseUnitsToDisplay(balance?.baseUnits ?? 0n),
    asset_info: {
      asset_longname: null,
      description: 'ZeldHash ZELD',
      issuer: '',
      divisible: true,
      locked: false,
    },
  };
  const huntingOn = (settings.zeldHuntSeconds ?? 0) > 0;
  const canHunt = activeWallet
    ? isHuntableAddressFormat(activeWallet.addressFormat) || huntsWhileSigning(activeWallet.addressFormat, activeWallet.type)
    : false;
  const hasZeld = (balance?.baseUnits ?? 0n) > 0n;
  const sections: ActionSection[] = [{
    items: [
      {
        id: 'send',
        title: t('zeld_send'),
        description: !balance ? t('zeld_balance_unavailable')
          : hasZeld ? t('zeld_send_description') : t('zeld_nothing_to_send'),
        onClick: () => { void navigate('/zeld/send'); },
      },
      ...(hasZeld ? [{
        id: 'park',
        title: t('zeld_park_title'),
        description: t('zeld_park_description'),
        onClick: () => { void navigate('/zeld/park'); },
      }] : []),
      {
        id: 'about',
        title: t('zeld_about'),
        description: t('zeld_about_description'),
        onClick: () => window.open('https://zeldhash.com', '_blank', 'noopener,noreferrer'),
      },
    ],
  }];

  return (
    <section className="p-4 space-y-6" aria-labelledby="zeld-balance-title">
      <h2 id="zeld-balance-title" className="sr-only">{t('zeld_balance')}</h2>
      {balance && <BalanceHeader balance={token} className="mt-1 mb-5" iconSrc={zeldIcon} />}
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p role="alert" className="text-sm text-amber-800">{t('zeld_balance_error', [error])}</p>
          <button type="button" onClick={retry} className="text-sm font-medium text-blue-700 underline cursor-pointer">{t('common_try_again')}</button>
        </div>
      )}

      <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
        <h3 className="text-sm font-medium text-gray-900">{t('zeld_hunting')}</h3>
        <HuntSettings showHelpText={shouldShowHelpText} />
        {!canHunt && (
          <p role="status" className="text-xs text-amber-700">
            {t('zeld_legacy_hardware')}
          </p>
        )}
        {canHunt && !huntingOn && (
          <p className="text-xs text-gray-500">{t('zeld_hunting_off')}</p>
        )}
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-medium text-gray-900">{t('zeld_holding_outputs')}</h3>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{t('zeld_outputs')}</span>
          <span className="text-gray-900">{balance?.utxos.length ?? t('zeld_unknown')}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{t('zeld_btc_on_outputs')}</span>
          <span className="text-gray-900">{reservedSats === null ? t('zeld_unknown') : `${formatAmount({ value: reservedSats, maximumFractionDigits: 0 })} sats`}</span>
        </div>
        {shouldShowHelpText && (
          <p className="text-xs text-gray-500">
            {t('zeld_output_help')}
          </p>
        )}
        {balance && balance.utxos.length > 0 && (
          <ul className="divide-y divide-gray-100 text-xs">
            {balance.utxos.slice(0, 8).map((utxo) => (
              <li key={`${utxo.txid}:${utxo.vout}`} className="flex justify-between py-1.5 gap-3">
                <a
                  href={`${EXPLORER_TX_URL}${utxo.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 hover:underline truncate"
                >
                  {shortTxid(utxo.txid)}:{utxo.vout}
                </a>
                <span className="text-gray-900 whitespace-nowrap">
                  {formatAmount({ value: zeldBaseUnitsToDisplay(utxo.balance), minimumFractionDigits: 8, maximumFractionDigits: 8 })}
                </span>
              </li>
            ))}
            {balance.utxos.length > 8 && (
              <li className="py-1.5 text-gray-500">{t('zeld_more_outputs', [String(balance.utxos.length - 8)])}</li>
            )}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-medium text-gray-900">{t('zeld_recent_rewards')}</h3>
        {rewards === null ? (
          <p className="text-xs text-gray-500">{t('zeld_rewards_unavailable')}</p>
        ) : rewards.length === 0 ? (
          <p className="text-xs text-gray-500">{t('zeld_no_rewards')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-xs">
            {rewards.map((reward) => (
              <li key={`${reward.txid}:${reward.vout}`} className="flex justify-between py-1.5 gap-3">
                <div className="min-w-0">
                  <a
                    href={`${EXPLORER_TX_URL}${reward.txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-600 hover:underline truncate block"
                  >
                    <span className="font-bold">{reward.txid.slice(0, reward.zero_count)}</span>
                    {reward.txid.slice(reward.zero_count, 12)}…
                  </a>
                  <span className="text-gray-500">{t('zeld_reward_block', [formatAmount({ value: reward.block_index, maximumFractionDigits: 0 }), String(reward.zero_count)])}</span>
                </div>
                <span className="text-gray-900 whitespace-nowrap">
                  +{formatAmount({ value: zeldBaseUnitsToDisplay(reward.reward), minimumFractionDigits: 0, maximumFractionDigits: 8 })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ActionList sections={sections} />
    </section>
  );
}
