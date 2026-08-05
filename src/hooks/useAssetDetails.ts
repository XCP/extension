import { useEffect, useMemo, useRef } from "react";
import type { AssetInfo } from "@/core/counterparty/api";
import type { DisplayUnits } from '@/core/numeric';
import { asDisplayUnits } from '@/core/numeric';
import { useAssetBalance } from "@/hooks/useAssetBalance";
import { useAssetInfo } from "@/hooks/useAssetInfo";
import { useAssetUtxos } from "@/hooks/useAssetUtxos";

/**
 * Represents the details of an asset, including balance and UTXO information.
 */
export interface AssetDetails {
  isDivisible: boolean;
  assetInfo: AssetInfo | null;
  /** Display units — already divided by divisibility, as the balance hook returns it. */
  availableBalance: DisplayUnits;
  utxoBalances?: Array<{
    txid: string;
    amount: string;
  }> | undefined;
}

/**
 * Options for the useAssetDetails hook.
 */
interface UseAssetDetailsOptions {
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

/**
 * Composite hook that combines asset info, balance, and UTXO fetching.
 * This provides backward compatibility while using the new focused hooks internally.
 * 
 * @param asset The asset identifier (e.g., 'BTC', 'XCP')
 * @param options Optional callbacks for load start and end events
 * @returns Object containing isLoading, error, and data properties
 */
export function useAssetDetails(asset: string, options?: UseAssetDetailsOptions) {
  // Use the three focused hooks
  const assetInfo = useAssetInfo(asset);
  const balance = useAssetBalance(asset);
  const utxos = useAssetUtxos(asset);

  // Cache loading state calculation
  const isLoading = useMemo(() => 
    assetInfo.isLoading || balance.isLoading || utxos.isLoading,
    [assetInfo.isLoading, balance.isLoading, utxos.isLoading]
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
  const error = balance.error || assetInfo.error || utxos.error;

  // Build the combined data structure
  const data = useMemo<AssetDetails | null>(() => {
    // If we don't have balance data, return null
    if (!balance.balance) {
      return null;
    }

    return {
      isDivisible: balance.isDivisible,
      assetInfo: assetInfo.data,
      availableBalance: asDisplayUnits(balance.balance),
      utxoBalances: utxos.utxos || undefined,
    };
  }, [assetInfo.data, balance.balance, balance.isDivisible, utxos.utxos]);

  return {
    isLoading,
    error,
    data,
  };
}
