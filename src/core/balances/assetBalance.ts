/**
 * Read asset metadata and its address balance together for balance consumers.
 * Metadata-only consumers should call fetchAssetDetails directly.
 */

import { rawToInput } from '@/core/amount-contract/amounts';
import { BTC_ASSET_INFO } from '@/core/bitcoin/assetInfo';
import { fetchBTCBalance } from '@/core/bitcoin/balance';
import { type AssetInfo, fetchAssetDetails, fetchTokenBalance } from '@/core/counterparty/api';

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
