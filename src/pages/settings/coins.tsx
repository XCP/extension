import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { backsOffers, outpointOf } from "@/core/bitcoin/coinLocks";
import { clearUtxoCache, fetchUTXOs } from "@/core/bitcoin/utxo";
import { fetchUtxosWithBalances } from "@/core/counterparty/api";
import { t } from '@/i18n';
import type { CoinLockUpdate } from '@/types/coinLocks';

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

/**
 * The active address's coins: every plain BTC output with what it is worth and how settled it is,
 * and which ones the wallet keeps out of every send (core/bitcoin/coinLocks.ts). Offers lock the
 * coins they commit; the user can lock any plain coin here, unlock any locked one, and lock an
 * offer coin again while its offer lives.
 *
 * Outputs holding Counterparty assets are listed too, marked and without an action: sends never
 * spend them anyway, but leaving them out would make the available and locked totals disagree with
 * the BTC the wallet shows for the address.
 */
export default function CoinsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const address = activeAddress?.address;
  const [state, setState] = useState<CoinsState>({ coins: [], isLoading: true, error: null });
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  // The offer coin whose card is asking before it unlocks; one card asks at a time.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The latest load; an older one that finishes after it (an address switch mid-read) is dropped.
  const loadRef = useRef(0);

  const load = useCallback(async (fresh = false) => {
    if (!address) return;
    const current = ++loadRef.current;
    try {
      if (fresh) clearUtxoCache(address);
      const utxos = await fetchUTXOs(address);
      const [locks, withAssets, height] = await Promise.all([
        readCoinLocks(address, utxos),
        fetchUtxosWithBalances(utxos.map(utxo => `${utxo.txid}:${utxo.vout}`)).catch(() => null),
        getCurrentBlockHeight().catch(() => null),
      ]);
      const lockByOutpoint = new Map(locks.map(lock => [lock.outpoint, lock]));
      const coins: CoinRow[] = utxos.map((utxo) => {
        const outpoint = outpointOf(utxo);
        return {
          outpoint,
          valueSats: utxo.value,
          confirmations: !utxo.status.confirmed ? 0
            : height !== null && utxo.status.block_height > 0 ? Math.max(1, height - utxo.status.block_height + 1) : 1,
          holdsAssets: withAssets?.has(`${utxo.txid}:${utxo.vout}`) ?? null,
          lock: lockByOutpoint.get(outpoint),
        };
      });
      // An offer can lock a coin before the funding reaches the chain; it is listed all the same.
      const listed = new Set(coins.map(coin => coin.outpoint));
      for (const lock of locks) {
        if (!listed.has(lock.outpoint)) {
          coins.push({ outpoint: lock.outpoint, valueSats: lock.valueSats, confirmations: null, holdsAssets: false, lock });
        }
      }
      // Locked coins first, then the largest.
      coins.sort((left, right) => (left.lock ? 0 : 1) - (right.lock ? 0 : 1) || right.valueSats - left.valueSats);
      if (current === loadRef.current) setState({ coins, isLoading: false, error: withAssets === null ? t('coins_assets_lookup_failed') : null });
    } catch (error) {
      console.error("Failed to load coins:", error);
      if (current === loadRef.current) setState(previous => ({ ...previous, isLoading: false, error: t('coins_load_failed') }));
    }
  }, [address]);

  useEffect(() => {
    // Deferred out of the effect, as UtxoList does, so the load's state updates never run inside it.
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    setHeaderProps({
      title: t('coins_title'),
      onBack: () => void navigate(PATHS.BACK),
      rightButton: {
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: () => void load(true),
        ariaLabel: t('coins_refresh'),
      },
    });
  }, [setHeaderProps, navigate, load]);

  const update = useCallback(async (change: CoinLockUpdate) => {
    const store = getCoinLockStore();
    if (!address || !store) return;
    setBusy(true);
    try {
      await store.update(address, change);
      await load();
    } catch (error) {
      console.error("Failed to update coin locks:", error);
      setState(previous => ({ ...previous, error: t('coins_update_failed') }));
    } finally {
      setBusy(false);
    }
  }, [address, load]);

  const totals = useMemo(() => state.coins.reduce((sum, coin) => {
    if (coin.lock && !coin.lock.unlocked) return { ...sum, locked: sum.locked + coin.valueSats };
    if (coin.holdsAssets === false && coin.confirmations !== null) return { ...sum, free: sum.free + coin.valueSats };
    return sum;
  }, { free: 0, locked: 0 }), [state.coins]);

  // With nothing locked there is nothing to filter to, so the filter goes and the list shows all.
  const lockedCoins = state.coins.filter(coin => coin.lock && !coin.lock.unlocked);
  const visible = filter === "locked" && lockedCoins.length > 0 ? lockedCoins : state.coins;

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
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('coins_available')}</span>
              <span className="text-gray-900 tabular-nums">{t('coins_btc_amount', formatCoinBtc(totals.free))}</span>
            </div>
            {totals.locked > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('coins_locked')}</span>
                <span className="text-gray-900 tabular-nums">{t('coins_btc_amount', formatCoinBtc(totals.locked))}</span>
              </div>
            )}
            <p className="text-xs text-gray-500">{t('coins_summary_help')}</p>
          </div>

          {lockedCoins.length > 0 && (
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
