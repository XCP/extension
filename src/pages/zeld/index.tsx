import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import zeldIcon from '@/assets/zeld.svg';
import { BalanceHeader } from '@/components/domain/balance/balance-header';
import { HuntSecondsInput } from '@/components/domain/zeld/hunt-seconds-input';
import { FiInfo } from '@/components/icons';
import type { ActionSection } from '@/components/ui/lists/action-list';
import { ActionList } from '@/components/ui/lists/action-list';
import { Spinner } from '@/components/ui/spinner';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { useWallet } from '@/contexts/wallet-context';
import { fetchUTXOs } from '@/core/bitcoin/utxo';
import type { TokenBalance } from '@/core/counterparty/api';
import { formatAmount } from '@/core/format';
import {
  fetchZeldBalance,
  fetchZeldRewards,
  ZELD_DISPLAY_NAME,
  type ZeldAddressBalance,
  type ZeldReward,
  zeldBaseUnitsToDisplay,
} from '@/core/zeld/api';
import { isHuntableAddressFormat } from '@/core/zeld/huntTemplate';

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
  const [balance, setBalance] = useState<ZeldAddressBalance | null>(null);
  const [rewards, setRewards] = useState<ZeldReward[]>([]);
  const [reservedSats, setReservedSats] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const shouldShowHelpText = isHelpTextOverride ? !settings.showHelpText : settings.showHelpText;

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [zeld, recent] = await Promise.all([
        fetchZeldBalance(address),
        fetchZeldRewards(address, 10).catch(() => []),
      ]);
      setBalance(zeld);
      setRewards(recent);
      // How much BTC sits on the ZELD-bearing outputs; a spend of ZELD moves it too.
      try {
        const utxos = await fetchUTXOs(address);
        const byOutpoint = new Map(utxos.map(utxo => [`${utxo.txid}:${utxo.vout}`, utxo.value]));
        setReservedSats(zeld.utxos.reduce((sum, utxo) => sum + (byOutpoint.get(`${utxo.txid}:${utxo.vout}`) ?? 0), 0));
      } catch {
        setReservedSats(null);
      }
    } catch (cause) {
      console.error('Failed to load ZELD balance:', cause);
      setError('The ZELD indexer could not be reached.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    // Deferred a tick so the effect itself sets no state, as the balance list does.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    setHeaderProps({
      title: ZELD_DISPLAY_NAME,
      onBack: () => { void navigate('/index'); },
      rightButton: {
        icon: <FiInfo className="size-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((previous) => !previous),
        ariaLabel: 'Toggle help text',
      },
    });
    return () => setHeaderProps(null);
  }, [navigate, setHeaderProps]);

  if (loading && !balance) return <Spinner message="Loading ZELD…" />;

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
  const canHunt = activeWallet ? isHuntableAddressFormat(activeWallet.addressFormat) : false;
  const hasZeld = (balance?.baseUnits ?? 0n) > 0n;
  const sections: ActionSection[] = [{
    items: [
      {
        id: 'send',
        title: 'Send ZELD',
        description: hasZeld
          ? 'Move ZELD to another address. The remainder stays on your change.'
          : 'Nothing to send yet.',
        onClick: () => { void navigate('/zeld/send'); },
      },
      ...(hasZeld ? [{
        id: 'park',
        title: 'Move ZELD to a small output',
        description: 'Frees the rest of your BTC for payments that must pay someone else first.',
        onClick: () => { void navigate('/zeld/park'); },
      }] : []),
      {
        id: 'about',
        title: 'About ZeldHash',
        description: 'How rare transaction IDs earn ZELD.',
        onClick: () => window.open('https://zeldhash.com', '_blank', 'noopener,noreferrer'),
      },
    ],
  }];

  return (
    <section className="p-4 space-y-6" aria-labelledby="zeld-balance-title">
      <h2 id="zeld-balance-title" className="sr-only">ZELD balance</h2>
      <BalanceHeader balance={token} className="mt-1 mb-5" iconSrc={zeldIcon} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Hunting</h3>
        <HuntSecondsInput showHelpText={shouldShowHelpText} />
        {!canHunt && (
          <p role="status" className="text-xs text-amber-700">
            This wallet's address type cannot hunt: signing a legacy or nested SegWit input changes
            the txid. Native SegWit and Taproot wallets can.
          </p>
        )}
        {canHunt && !huntingOn && (
          <p className="text-xs text-gray-500">Hunting is off. Set a number of seconds to earn ZELD on eligible transactions.</p>
        )}
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Where it sits</h3>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Outputs holding ZELD</span>
          <span className="text-gray-900">{balance?.utxos.length ?? 0}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Bitcoin on those outputs</span>
          <span className="text-gray-900">{reservedSats === null ? 'Unknown' : `${reservedSats.toLocaleString()} sats`}</span>
        </div>
        {shouldShowHelpText && (
          <p className="text-xs text-gray-500">
            ZELD lives on ordinary Bitcoin outputs. When one is spent, the ZELD moves to the first
            spendable output of that transaction. The wallet keeps such outputs out of any
            transaction that pays someone else first, and lets them roll forward in transactions
            whose first output is your own change.
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
              <li className="py-1.5 text-gray-500">and {balance.utxos.length - 8} more</li>
            )}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Recent rewards</h3>
        {rewards.length === 0 ? (
          <p className="text-xs text-gray-500">No rewards recorded for this address yet.</p>
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
                  <span className="text-gray-500">block {reward.block_index.toLocaleString()}, {reward.zero_count} zeros</span>
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
