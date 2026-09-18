import { useEffect, useMemo, useRef } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { spendableBalance, tracksPendingLedgerDebits } from "@/core/balances/spendable";
import type { AssetInfo } from "@/core/counterparty/api";
import type { DisplayUnits } from '@/core/numeric';
import { asDisplayUnits, toBigNumber } from '@/core/numeric';
import { useAssetBalance } from "@/hooks/useAssetBalance";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import { usePendingDeltas } from "@/hooks/usePendingStatus";

/**
 * Represents asset metadata and its confirmed and pending balances.
 */
export interface AssetDetails {
  isDivisible: boolean;
  assetInfo: AssetInfo | null;
  /** Display units — already divided by divisibility, as the balance hook returns it. */
  availableBalance: DisplayUnits;
  /**
   * Display units. What a new transaction may actually draw on: the confirmed balance less
   * anything the mempool has already committed.
   *
   * Kept separate from `availableBalance` rather than replacing it, because they answer different
   * questions. A balance shown to the user is what they hold; a Max offered to a form is what they
   * can spend. Silently showing the second where the first belongs makes a number people rely on
   * change meaning without saying so, and disagree with every explorer.
   */
  spendableBalance: DisplayUnits;
  /** Display units, positive. What the mempool has committed; "0" when nothing is pending. */
  pendingOutgoing: DisplayUnits;
  /**
   * Display units, positive. What the mempool is bringing in — informational, never added to the
   * spendable figure (unconfirmed money in is not money you can spend). "0" when nothing is
   * arriving or the total could not be read; good news does not need an unknown-state warning.
   */
  pendingIncoming: DisplayUnits;
  /**
   * Something is outgoing but could not be totalled, so nothing was subtracted. Forms that explain
   * a reduced Max should say this rather than claim a figure they do not have.
   */
  unknownPending: boolean;
}

/**
 * Options for the useAssetDetails hook.
 */
interface UseAssetDetailsOptions {
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

/**
 * Composite hook that combines asset info and balance fetching.
 * This provides backward compatibility while using the new focused hooks internally.
 * 
 * @param asset The asset identifier (e.g., 'BTC', 'XCP')
 * @param options Optional callbacks for load start and end events
 * @returns Object containing isLoading, error, and data properties
 */
export function useAssetDetails(asset: string, options?: UseAssetDetailsOptions) {
  // Load only what consumers display
  const assetInfo = useAssetInfo(asset);
  const balance = useAssetBalance(asset);
  const { activeAddress } = useWallet();
  // BTC is excluded: its balance comes from the UTXO set, not the Counterparty ledger, so no DEBIT
  // event here describes a pending BTC send and subtracting one would mix two unrelated systems.
  const { byAsset: pendingDeltas } = usePendingDeltas(
    tracksPendingLedgerDebits(asset) ? activeAddress?.address : undefined
  );

  // Cache loading state calculation
  const isLoading = useMemo(() => 
    assetInfo.isLoading || balance.isLoading,
    [assetInfo.isLoading, balance.isLoading]
  );
  
  // Stable refs for callbacks to avoid dependency issues
  const onLoadStartRef = useRef(options?.onLoadStart);
  const onLoadEndRef = useRef(options?.onLoadEnd);
  
  // Update refs when options change
  onLoadStartRef.current = options?.onLoadStart;
  onLoadEndRef.current = options?.onLoadEnd;
  
  useEffect(() => {
    if (isLoading && onLoadStartRef.current) {
      onLoadStartRef.current();
    } else if (!isLoading && onLoadEndRef.current) {
      onLoadEndRef.current();
    }
  }, [isLoading]);

  // Combine errors - prioritize balance error as it's most critical
  const error = balance.error || assetInfo.error;

  // Build the combined data structure
  const data = useMemo<AssetDetails | null>(() => {
    // If we don't have balance data, return null
    if (!balance.balance) {
      return null;
    }

    // Core supplies the pending figure already normalized, so no divisibility is assumed here —
    // which matters, because `useAssetBalance` defaults divisibility to true when it does not know
    // and a wrong `true` is a factor-of-1e8 error in a number that gates spending.
    const pending = pendingDeltas.get(asset);
    const spendable = spendableBalance(balance.balance, pending?.debitedNormalized);
    const incoming = pending?.creditedNormalized;

    return {
      isDivisible: balance.isDivisible,
      assetInfo: assetInfo.data,
      availableBalance: asDisplayUnits(balance.balance),
      spendableBalance: asDisplayUnits(spendable.spendable),
      pendingOutgoing: asDisplayUnits(spendable.pendingOutgoing),
      pendingIncoming: asDisplayUnits(incoming && toBigNumber(incoming).isGreaterThan(0) ? incoming : '0'),
      unknownPending: spendable.unknownPending,
    };
  }, [assetInfo.data, balance.balance, balance.isDivisible, pendingDeltas, asset]);

  return {
    isLoading,
    error,
    data,
  };
}
