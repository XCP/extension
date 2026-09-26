import { useEffect, useMemo, useRef, useState } from "react";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchBTCBalance } from "@/core/bitcoin/balance";
import type { AssetInfo } from "@/core/counterparty/api";
import { asDisplayUnits, fromSatoshis } from '@/core/numeric';
import { BTC_ASSET_INFO, fetchAssetDetailsAndBalance } from "@/hooks/utils/fetchAssetData";

interface BalanceState {
  isLoading: boolean;
  error: Error | null;
  balance: string | null;
  isDivisible: boolean;
}

/** A finished read, tagged with the wallet, address and asset it answers for. */
interface FetchedBalance {
  key: string;
  /** The revalidation it answered; a newer one is under way when this is behind. */
  revision: number;
  error: Error | null;
  balance: string | null;
  isDivisible: boolean;
}

const EMPTY: BalanceState = { isLoading: false, error: null, balance: null, isDivisible: true };
const LOADING: BalanceState = { isLoading: true, error: null, balance: null, isDivisible: true };

/**
 * Fetches and caches asset balance for the active address.
 * Integrates with HeaderContext for balance caching across the app.
 *
 * The shared cache is a placeholder, never the answer: it is keyed by address, shown at once for
 * the address it was read for, and revalidated on every mount and every change of wallet, address
 * or asset. It used to be keyed by asset alone and trusted without a read, so a form opened after
 * an address switch offered the previous address's balance as its Max.
 *
 * Every value returned is for the wallet, address and asset asked about on this render — a read
 * still in flight for the previous ones is ignored when it lands, and is never shown meanwhile.
 *
 * @param asset - The asset symbol (e.g., 'BTC', 'XCP')
 * @returns Object containing balance, loading state, error, and divisibility flag
 *
 * @example
 * const { balance, isLoading, error, isDivisible } = useAssetBalance('XCP');
 */
export function useAssetBalance(asset: string): BalanceState {
  const { activeAddress, activeWallet } = useWallet();
  const { subheadings, setBalanceHeader } = useHeader();
  const address = activeAddress?.address;
  const walletId = activeWallet?.id;
  const key = asset && asset.trim() !== '' && address
    ? JSON.stringify([walletId ?? null, address, asset])
    : null;

  const cachedBalance = address ? subheadings.balances[address]?.[asset] : undefined;
  const cachedQuantity = cachedBalance?.quantity_normalized;
  const cachedDivisible = cachedBalance?.asset_info?.divisible;

  const [fetched, setFetched] = useState<FetchedBalance | null>(null);
  const [revision, setRevision] = useState(0);
  const setBalanceHeaderRef = useRef(setBalanceHeader);
  setBalanceHeaderRef.current = setBalanceHeader;

  // Clearing the cache (after this wallet broadcasts) is how the app asks for fresh balances, so an
  // entry that disappears while mounted is read again. Only a disappearance counts: an entry
  // appearing, or changing, is someone else's fresh read, taken as it is.
  const seenCacheRef = useRef<{ key: string | null; present: boolean } | null>(null);
  useEffect(() => {
    const present = cachedQuantity !== undefined;
    const previous = seenCacheRef.current;
    seenCacheRef.current = { key, present };
    if (previous && previous.key === key && previous.present && !present) setRevision(value => value + 1);
  }, [key, cachedQuantity]);

  // Keyed only by what is being asked, never by the cache: another component writing the cache
  // must not start (or restart) a read here, or two writers fetch each other in circles (#291).
  useEffect(() => {
    if (!key || !address) return;
    let cancelled = false;

    const read = async () => {
      try {
        let balance: string;
        let isDivisible = true;
        let assetInfo: AssetInfo | null = null;

        if (asset === 'BTC') {
          const balanceSats = await fetchBTCBalance(address);
          // removeTrailingZeros keeps the previous `(sats / 1e8).toString()` shape exactly:
          // "1" rather than "1.00000000". Routing through the numeric layer is the point here,
          // not changing what callers see.
          balance = fromSatoshis(balanceSats, { removeTrailingZeros: true });
          assetInfo = BTC_ASSET_INFO;
        } else {
          const result = await fetchAssetDetailsAndBalance(asset, address);
          balance = result.availableBalance;
          isDivisible = result.isDivisible;
          assetInfo = result.assetInfo;
        }

        if (cancelled) return;

        setBalanceHeaderRef.current(address, asset, {
          asset,
          quantity_normalized: asDisplayUnits(balance),
          asset_info: assetInfo ? {
            asset_longname: assetInfo.asset_longname,
            description: assetInfo.description ?? "",
            issuer: assetInfo.issuer ?? "",
            divisible: assetInfo.divisible,
            locked: assetInfo.locked,
            supply: assetInfo.supply,
          } : undefined,
        });
        setFetched({ key, revision, error: null, balance, isDivisible });
      } catch (err) {
        if (cancelled) return;
        setFetched({
          key,
          revision,
          error: err instanceof Error ? err : new Error(String(err)),
          balance: null,
          isDivisible: true,
        });
      }
    };

    void read();
    return () => { cancelled = true; };
  }, [key, address, asset, revision]);

  return useMemo((): BalanceState => {
    if (!key) return EMPTY;
    const own = fetched?.key === key ? fetched : null;
    // The cache entry is for this address and at least as new as this hook's own read (the read
    // writes it), and another component may have refreshed it since, so it wins when present.
    if (own?.error) {
      return { isLoading: false, error: own.error, balance: cachedQuantity ?? null, isDivisible: cachedDivisible ?? true };
    }
    if (cachedQuantity) {
      return { isLoading: false, error: null, balance: cachedQuantity, isDivisible: cachedDivisible ?? own?.isDivisible ?? true };
    }
    if (own) {
      // Behind the current revision: a re-read is under way, and until it lands the last figure
      // read for this same address and asset is what there is.
      return { isLoading: own.revision !== revision, error: null, balance: own.balance, isDivisible: own.isDivisible };
    }
    return LOADING;
  }, [key, fetched, revision, cachedQuantity, cachedDivisible]);
}
