/**
 * Utility function for fetching asset details and balance.
 * Used by useAssetBalance and useAssetInfo hooks.
 */

import { fetchBTCBalance } from '@/utils/blockchain/bitcoin/balance';
import { fetchAssetDetails, fetchTokenBalance, type AssetInfo } from '@/utils/blockchain/counterparty/api';
import { formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';

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
      supply_normalized: '21000000',
    };

    const balanceSats = await fetchBTCBalance(address);
    const balanceBTC = fromSatoshis(balanceSats, true);
    const availableBalance = formatAmount({
      value: balanceBTC,
      maximumFractionDigits: 8,
      minimumFractionDigits: 8,
    });

    return { isDivisible: true, assetInfo, availableBalance };
  }

  const assetInfo = await fetchAssetDetails(asset, { verbose: options.verbose });
  if (!assetInfo) {
    throw new Error(`Asset not found: ${asset}`);
  }

  const balance = await fetchTokenBalance(address, asset, {
    excludeUtxos: true,
    verbose: options.verbose,
  });

  return {
    isDivisible: assetInfo.divisible,
    assetInfo,
    availableBalance: balance.quantity_normalized,
  };
}
