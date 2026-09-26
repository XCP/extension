/**
 * Utility function for fetching asset details and balance.
 * Used by useAssetBalance and useAssetInfo hooks.
 */

import { rawToInput } from '@/core/amount-contract/amounts';
import { fetchBTCBalance } from '@/core/bitcoin/balance';
import { type AssetInfo, fetchAssetDetails, fetchTokenBalance } from '@/core/counterparty/api';
import { asDisplayUnits } from '@/core/numeric';

/**
 * BTC's asset info, fixed rather than fetched: Bitcoin is not a Counterparty asset, so the node has
 * no record of it. `supply` is base units (satoshis), like every other asset's; `supply_normalized`
 * is whole BTC. The one copy every BTC answer in the wallet uses.
 */
export const BTC_ASSET_INFO: AssetInfo = {
  asset: 'BTC',
  asset_longname: null,
  description: 'Bitcoin',
  issuer: '',
  divisible: true,
  locked: true,
  supply: '2100000000000000',
  supply_normalized: asDisplayUnits('21000000'),
  fair_minting: false,
};

export async function fetchAssetDetailsAndBalance(
  asset: string,
  address: string,
  options: { verbose?: boolean } = {}
): Promise<{ isDivisible: boolean; assetInfo: AssetInfo; availableBalance: string }> {
  if (asset === 'BTC') {
    const assetInfo = BTC_ASSET_INFO;

    const balanceSats = await fetchBTCBalance(address);
    // This value feeds balance comparisons and form limits. Localize it only at render time.
    const availableBalance = rawToInput(balanceSats, 8);

    return { isDivisible: true, assetInfo, availableBalance };
  }

  // Both reads start together. The balance is only used once the asset is known to exist, and its
  // rejection is observed here so an asset-not-found error is not joined by an unhandled one.
  const balanceRequest = fetchTokenBalance(address, asset, {
    type: 'address',
    verbose: options.verbose,
  });
  balanceRequest.catch(() => {});

  const assetInfo = await fetchAssetDetails(asset, { verbose: options.verbose });
  if (!assetInfo) {
    throw new Error(`Asset not found: ${asset}`);
  }

  const balance = await balanceRequest;

  return {
    isDivisible: assetInfo.divisible,
    assetInfo,
    availableBalance: balance.quantity_normalized,
  };
}
