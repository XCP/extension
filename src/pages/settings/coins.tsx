import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CoinCard, type CoinRow } from "@/components/domain/coins/coin-card";
import { formatCoinBtc } from "@/components/domain/coins/coin-lock-text";
import { FaCoins, FiRefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Spinner } from "@/components/ui/spinner";
import { TabButton } from "@/components/ui/tab-button";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getCurrentBlockHeight } from "@/core/bitcoin/blockHeight";
import { getCoinLockStore, readCoinLocks } from "@/core/bitcoin/coinLockStore";
import { backsOffers, type CoinLock, type CoinLockUpdate, outpointOf } from "@/core/bitcoin/coinLocks";
import { clearUtxoCache, fetchUTXOs, type UTXO } from "@/core/bitcoin/utxo";
import { t } from '@/i18n';

const PATHS = {
  BACK: "/settings",
} as const;

/** Coins shown before "Show more", as the UTXO list pages its rows. */
const PAGE_SIZE = 20;

type Filter = "all" | "locked";

interface CoinsState {
  coins: CoinRow[];
  isLoading: boolean;
  error: string | null;
}

/** Offer commitments and existing hand locks, available without a chain or asset scan. */
export default function CoinsPage(): ReactElement {
  const { activeAddress } = useWallet();
  // Address changes discard both the previous list and its in-flight reads and actions.
  return <AddressCoinsPage key={activeAddress?.address} address={activeAddress?.address} />;
}

function AddressCoinsPage({ address }: { address: string | undefined }): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const [state, setState] = useState<CoinsState>({ coins: [], isLoading: !!address, error: null });
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  // The offer coin whose card is asking before it unlocks; one card asks at a time.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The latest load; an older one that finishes after it (an address switch mid-read) is dropped.
  const loadRef = useRef({ sequence: 0 });
  const chainRef = useRef<{ utxos: UTXO[]; height: number | null } | null>(null);

  const load = useCallback(async (fresh = false, refreshChain = true) => {
    if (!address) return;
    const current = ++loadRef.current.sequence;
    const rows = (locks: CoinLock[], chainStatus: CoinRow['chainStatus']): CoinRow[] => {
      const chain = chainRef.current;
      const byOutpoint = new Map(chain?.utxos.map(utxo => [outpointOf(utxo), utxo]));
      return locks.map(lock => {
        const utxo = byOutpoint.get(lock.outpoint);
        return {
          outpoint: lock.outpoint,
          valueSats: utxo?.value ?? lock.valueSats,
          confirmations: !utxo ? null : !utxo.status.confirmed ? 0
            : chain?.height !== null && chain?.height !== undefined && utxo.status.block_height > 0
              ? Math.max(1, chain.height - utxo.status.block_height + 1) : 1,
          chainStatus: chainStatus ?? (utxo ? undefined : 'missing'),
          holdsAssets: false,
          lock,
        };
      }).sort((left, right) => Number(backsOffers(right.lock)) - Number(backsOffers(left.lock))
        || Number(left.lock.unlocked) - Number(right.lock.unlocked)
        || right.valueSats - left.valueSats);
    };
    try {
      const locks = await getCoinLockStore()?.read(address) ?? [];
      if (current !== loadRef.current.sequence) return;
      // The local record is enough to manage protection, even when an explorer is down.
      setState({ coins: rows(locks, chainRef.current ? undefined : refreshChain ? 'checking' : 'unavailable'), isLoading: false, error: null });
      if (!refreshChain || locks.length === 0) return;
      if (fresh) clearUtxoCache(address);
      try {
        const [utxos, height] = await Promise.all([fetchUTXOs(address), getCurrentBlockHeight().catch(() => null)]);
        if (current !== loadRef.current.sequence) return;
        const refreshed = await readCoinLocks(address, utxos);
        if (current !== loadRef.current.sequence) return;
        chainRef.current = { utxos, height };
        setState({ coins: rows(refreshed, undefined), isLoading: false, error: null });
      } catch {
        if (current === loadRef.current.sequence) {
          chainRef.current = null;
          setState(previous => ({ ...previous, coins: previous.coins.map(coin => ({ ...coin, chainStatus: 'unavailable' })), error: t('coins_refresh_failed') }));
        }
      }
    } catch (error) {
      console.error("Failed to load coins:", error);
      if (current === loadRef.current.sequence) setState(previous => ({ ...previous, isLoading: false, error: t('coins_load_failed') }));
    }
  }, [address]);

  useEffect(() => {
    const session = loadRef.current;
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void load(); });
    return () => { disposed = true; ++session.sequence; };
  }, [load]);

  useEffect(() => {
    setHeaderProps({
      title: t('coins_title'),
      onBack: () => void navigate(PATHS.BACK),
      rightButton: {
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: () => { if (!busy) void load(true); },
        disabled: busy,
        ariaLabel: t('coins_refresh'),
      },
    });
  }, [setHeaderProps, navigate, load, busy]);

  const update = useCallback(async (change: CoinLockUpdate) => {
    const store = getCoinLockStore();
    if (!address || !store) return;
    const current = ++loadRef.current.sequence;
    setBusy(true);
    try {
      await store.update(address, change);
      if (current === loadRef.current.sequence) {
        // A lock action needs only the store. Do not start another network scan.
        await load(false, false);
      }
    } catch (error) {
      console.error("Failed to update coin locks:", error);
      if (current === loadRef.current.sequence) setState(previous => ({ ...previous, error: t('coins_update_failed') }));
    } finally {
      setBusy(false);
    }
  }, [address, load]);

  const lockedCoins = state.coins.filter(coin => coin.lock && !coin.lock.unlocked);
  const lockedSats = lockedCoins.reduce((sum, coin) => sum + coin.valueSats, 0);
  // Only show filters when there is a distinction to make. Unlocked offers remain manageable.
  const showFilters = lockedCoins.length > 0 && lockedCoins.length < state.coins.length;
  const visible = filter === "locked" && showFilters ? lockedCoins : state.coins;

  if (state.isLoading) {
    return <Spinner message={t('coins_loading')} />;
  }

  return (
    <section className={state.coins.length === 0 && !state.error ? 'h-full flex items-center justify-center' : 'p-4 space-y-4'} aria-labelledby="coins-title">
      <h2 id="coins-title" className="sr-only">
        {t('coins_title')}
      </h2>

      {state.error && <ErrorAlert message={state.error} onClose={() => setState(previous => ({ ...previous, error: null }))} />}

      {state.coins.length === 0 ? (
        !state.error && (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <FaCoins className="size-12 text-gray-400 mx-auto mb-3" aria-hidden="true" />
            <p className="text-gray-600">{t('coins_none')}</p>
            <p className="text-sm text-gray-500 mt-1">{t('coins_none_detail')}</p>
          </div>
        )
      ) : (
        <>
          <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-medium text-gray-900">{t('coins_summary_title')}</h3>
            {lockedSats > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('coins_locked')}</span>
                <span className="text-gray-900 tabular-nums">{t('coins_btc_amount', formatCoinBtc(lockedSats))}</span>
              </div>
            )}
            <p className="text-xs text-gray-500">{t('coins_summary_help')}</p>
          </div>

          {showFilters && (
            <div className="flex gap-1" role="tablist" aria-label={t('coins_filter')}>
              <TabButton isActive={filter === "all"} onClick={() => { setFilter("all"); setShown(PAGE_SIZE); }}>
                {t('coins_filter_all')}
              </TabButton>
              <TabButton isActive={filter === "locked"} onClick={() => { setFilter("locked"); setShown(PAGE_SIZE); }}>
                {t('coins_filter_locked')}
              </TabButton>
            </div>
          )}

          <div className="space-y-3">
            {visible.slice(0, shown).map(coin => (
              <CoinCard
                key={coin.outpoint}
                coin={coin}
                busy={busy}
                onLock={() => void update({ lock: [{ outpoint: coin.outpoint, valueSats: coin.valueSats }] })}
                onUnlock={() => {
                  if (coin.lock && backsOffers(coin.lock)) setConfirming(coin.outpoint);
                  else void update({ unlock: [coin.outpoint] });
                }}
                onRelock={() => void update({ relock: [coin.outpoint] })}
                confirming={confirming === coin.outpoint}
                onCancelUnlock={() => setConfirming(null)}
                onConfirmUnlock={() => {
                  setConfirming(null);
                  void update({ unlock: [coin.outpoint] });
                }}
              />
            ))}
          </div>

          {visible.length > shown && (
            <Button color="gray" onClick={() => setShown(count => count + PAGE_SIZE)} fullWidth>
              {t('coins_show_more')}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
