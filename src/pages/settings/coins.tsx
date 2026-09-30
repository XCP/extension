import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CoinCard, type CoinRow } from "@/components/domain/coins/coin-card";
import { formatCoinBtc } from "@/components/domain/coins/coin-lock-text";
import { UnlockCoinDialog } from "@/components/domain/coins/unlock-coin-dialog";
import { FaCoins, FiRefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Spinner } from "@/components/ui/spinner";
import { TabButton } from "@/components/ui/tab-button";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getCurrentBlockHeight } from "@/core/bitcoin/blockHeight";
import { getCoinLockStore, readCoinLocks } from "@/core/bitcoin/coinLockStore";
import { type CoinLock, type CoinLockUpdate, outpointOf } from "@/core/bitcoin/coinLocks";
import { clearUtxoCache, fetchUTXOs } from "@/core/bitcoin/utxo";
import { fetchUtxosWithBalances } from "@/core/counterparty/api";
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

/**
 * The active address's coins: every plain BTC output with what it is worth and how settled it is,
 * and which ones the wallet keeps out of every send (core/bitcoin/coinLocks.ts). Offers lock the
 * coins they commit; the user can lock any plain coin here, unlock any locked one, and lock an
 * offer coin again while its offer lives.
 *
 * Outputs holding Counterparty assets are listed too, marked and without an action: sends never
 * spend them anyway, but leaving them out would make the free and locked totals disagree with the
 * BTC the wallet shows for the address.
 */
export default function CoinsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const address = activeAddress?.address;
  const [state, setState] = useState<CoinsState>({ coins: [], isLoading: true, error: null });
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [confirming, setConfirming] = useState<CoinLock | null>(null);
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
        fetchUtxosWithBalances(utxos.map(utxo => `${utxo.txid}:${utxo.vout}`)).catch(() => new Set<string>()),
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
          holdsAssets: withAssets.has(`${utxo.txid}:${utxo.vout}`),
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
      if (current === loadRef.current) setState({ coins, isLoading: false, error: null });
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
    if (!coin.holdsAssets && coin.confirmations !== null) return { ...sum, free: sum.free + coin.valueSats };
    return sum;
  }, { free: 0, locked: 0 }), [state.coins]);

  const visible = filter === "locked" ? state.coins.filter(coin => coin.lock && !coin.lock.unlocked) : state.coins;

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
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-700 tabular-nums">
              {totals.locked > 0
                ? t('coins_summary', [formatCoinBtc(totals.free), formatCoinBtc(totals.locked)])
                : t('coins_summary_free', formatCoinBtc(totals.free))}
            </p>
            <div className="flex gap-1" role="tablist" aria-label={t('coins_filter')}>
              <TabButton isActive={filter === "all"} onClick={() => { setFilter("all"); setShown(PAGE_SIZE); }}>
                {t('coins_filter_all')}
              </TabButton>
              <TabButton isActive={filter === "locked"} onClick={() => { setFilter("locked"); setShown(PAGE_SIZE); }}>
                {t('coins_filter_locked')}
              </TabButton>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{t('coins_none_locked')}</p>
          ) : (
            <div className="space-y-3">
              {visible.slice(0, shown).map(coin => (
                <CoinCard
                  key={coin.outpoint}
                  coin={coin}
                  busy={busy}
                  onLock={() => void update({ lock: [{ outpoint: coin.outpoint, valueSats: coin.valueSats }] })}
                  onUnlock={() => setConfirming(coin.lock ?? null)}
                  onRelock={() => void update({ relock: [coin.outpoint] })}
                />
              ))}
            </div>
          )}

          {visible.length > shown && (
            <Button color="gray" onClick={() => setShown(count => count + PAGE_SIZE)} fullWidth>
              {t('coins_show_more')}
            </Button>
          )}
        </>
      )}

      <UnlockCoinDialog
        lock={confirming}
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const outpoint = confirming?.outpoint;
          setConfirming(null);
          if (outpoint) void update({ unlock: [outpoint] });
        }}
      />
    </section>
  );
}
