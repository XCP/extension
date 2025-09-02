import { useEffect, useMemo } from "react";
import { AssetInfo } from "@/utils/blockchain/counterparty";
import { useAssetInfo } from "./useAssetInfo";
import { useAssetBalance } from "./useAssetBalance";
import { useAssetUtxos } from "./useAssetUtxos";

/**
 * Represents the details of an asset, including balance and UTXO information.
 */
export interface AssetDetails {
  isDivisible: boolean;
  assetInfo: AssetInfo | null;
  availableBalance: string;
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

  // Track loading state for callbacks
  const isLoading = assetInfo.isLoading || balance.isLoading || utxos.isLoading;
  
  useEffect(() => {
    if (isLoading && options?.onLoadStart) {
      options.onLoadStart();
    } else if (!isLoading && options?.onLoadEnd) {
      options.onLoadEnd();
    }
  }, [isLoading, options]);

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
      availableBalance: balance.balance,
      utxoBalances: utxos.utxos || undefined,
    };
  }, [assetInfo.data, balance.balance, balance.isDivisible, utxos.utxos]);

  return {
    isLoading,
    error,
    data,
  };
}
