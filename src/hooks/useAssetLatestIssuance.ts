import { useEffect, useState } from "react";
import { type AssetIssuance, fetchAssetLatestIssuance } from "@/core/counterparty/api";

interface LatestIssuanceState {
  isLoading: boolean;
  error: Error | null;
  /**
   * The asset's most recent valid issuance, or null when it is not established — still loading,
   * the lookup failed, or the asset has no issuance history. Callers must treat null as unknown
   * rather than as a set of false flags.
   */
  data: AssetIssuance | null;
}

/**
 * The asset's live protocol state, read where counterparty-core reads it.
 *
 * Core's `issuance.validate` decides what an owner may do from the *last issuance row*
 * (`last_issuance`), not from any asset summary, and it keeps that row current by appending new
 * ones: closing a fairminter appends an issuance with `fair_minting: false`, a transfer appends
 * one whose `issuer` is the new owner. The `/v2/assets/{asset}` projection drops `fair_minting`
 * entirely, so this is the only place the flag is visible.
 *
 * @param asset - The asset name, or an empty string to stay idle
 * @returns Loading state and the latest issuance
 *
 * @example
 * const { data: latestIssuance } = useAssetLatestIssuance('MYASSET');
 * const isFairMinting = latestIssuance?.fair_minting === true;
 */
export function useAssetLatestIssuance(asset: string): LatestIssuanceState {
  const [state, setState] = useState<LatestIssuanceState>({
    isLoading: false,
    error: null,
    data: null,
  });

  useEffect(() => {
    // Neither protocol asset has an issuance row — BTC is not a Counterparty asset at all, and
    // XCP's supply came from burns, so `/v2/assets/XCP/issuances` answers with an empty list.
    // Skipping the round trip beats making one to learn nothing.
    if (!asset || asset.trim() === "" || asset === "BTC" || asset === "XCP") {
      setState({ isLoading: false, error: null, data: null });
      return;
    }

    // A flag rather than the AbortController the sibling useAsset* hooks use: `cpApiGet` takes no
    // signal, so there is no request to abort — only a stale response to ignore.
    let cancelled = false;
    setState({ isLoading: true, error: null, data: null });

    fetchAssetLatestIssuance(asset)
      .then((issuance) => {
        if (!cancelled) setState({ isLoading: false, error: null, data: issuance });
      })
      .catch((err) => {
        // A failed lookup leaves the state unknown. Callers decide what to do with that; the asset
        // page lets an unknown `fair_minting` through rather than hiding every action because a
        // node hiccuped, since core will still refuse the transaction if one is in fact open.
        if (!cancelled) {
          setState({
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
            data: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [asset]);

  return state;
}
