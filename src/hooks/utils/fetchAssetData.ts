/**
 * Utility function for fetching asset details and balance.
 * Used by useAssetBalance and useAssetInfo hooks.
 */

import { rawToInput } from '@/core/amount-contract/amounts';
import { fetchBTCBalance } from '@/core/bitcoin/balance';
import { type AssetInfo, fetchAssetDetails, fetchTokenBalance } from '@/core/counterparty/api';
import { asDisplayUnits } from '@/core/numeric';

export async function fetchAssetDetailsAndBalance(
  asset: string,
  address: string,
  options: { verbose?: boolean } = {}
): Promise<{ isDivisible: boolean; assetInfo: AssetInfo; availableBalance: string }> {
  if (asset === 'BTC') {
    const assetInfo: AssetInfo = {
      asset: 'BTC',
      asset_longname: null,
      description: 'Bitcoin',
      issuer: '',
      divisible: true,
      locked: true,
      supply: '2100000000000000',
      supply_normalized: asDisplayUnits('21000000'),
    };

    const balanceSats = await fetchBTCBalance(address);
    // This value feeds balance comparisons and form limits. Localize it only at render time.
    const availableBalance = rawToInput(balanceSats, 8);

    return { isDivisible: true, assetInfo, availableBalance };
  }

  const assetInfo = await fetchAssetDetails(asset, { verbose: options.verbose });
  if (!assetInfo) {
    throw new Error(`Asset not found: ${asset}`);
  }

  const balance = await fetchTokenBalance(address, asset, {
    type: 'address',
    verbose: options.verbose,
  });

  return {
    isDivisible: assetInfo.divisible,
    assetInfo,
    availableBalance: balance.quantity_normalized,
  };
}
