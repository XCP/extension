import { useEffect, useMemo, useState } from "react";
import { BTC_ASSET_INFO } from "@/core/bitcoin/assetInfo";
import { type AssetInfo, fetchAssetDetails } from "@/core/counterparty/api";

interface AssetInfoState {
  isLoading: boolean;
  error: Error | null;
  data: AssetInfo | null;
}

/** A finished read, tagged with the name it was asked for — not the name the node answered with. */
interface FetchedInfo {
  asset: string;
  error: Error | null;
  data: AssetInfo | null;
}

const EMPTY: AssetInfoState = { isLoading: false, error: null, data: null };
const LOADING: AssetInfoState = { isLoading: true, error: null, data: null };
const BTC_STATE: AssetInfoState = { isLoading: false, error: null, data: BTC_ASSET_INFO };

/**
 * Fetches basic asset metadata information.
 * This is a focused hook that only handles asset info, not balances or UTXOs.
 *
 * Answers only for the asset asked about on this render: while a new asset loads, the previous
 * one's info is not returned under its name. Results are matched by the name requested, because a
 * subasset asked for by long name comes back under its numeric name; matching on the answer's name
 * never matched, and refetched in a loop.
 *
 * @param asset - The asset symbol (e.g., 'BTC', 'XCP')
 * @returns Object containing asset info, loading state, and error
 *
 * @example
 * const { data: assetInfo, isLoading, error } = useAssetInfo('XCP');
 * if (assetInfo) {
 *   console.log(`Asset ${assetInfo.asset} is ${assetInfo.divisible ? 'divisible' : 'indivisible'}`);
 * }
 */
export function useAssetInfo(asset: string): AssetInfoState {
  const valid = Boolean(asset && asset.trim() !== '');
  const isBTC = asset === 'BTC';

  const [fetched, setFetched] = useState<FetchedInfo | null>(null);

  useEffect(() => {
    if (!valid || isBTC) return;
    let cancelled = false;

    fetchAssetDetails(asset).then(
      (result) => {
        if (cancelled) return;
        setFetched({ asset, error: result ? null : new Error(`Asset not found: ${asset}`), data: result });
      },
      (err: unknown) => {
        if (cancelled) return;
        setFetched({ asset, error: err instanceof Error ? err : new Error(String(err)), data: null });
      },
    );

    return () => { cancelled = true; };
  }, [asset, valid, isBTC]);

  return useMemo((): AssetInfoState => {
    if (!valid) return EMPTY;
    if (isBTC) return BTC_STATE;
    if (fetched?.asset !== asset) return LOADING;
    return { isLoading: false, error: fetched.error, data: fetched.data };
  }, [valid, isBTC, asset, fetched]);
}
