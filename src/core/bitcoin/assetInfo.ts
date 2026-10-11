import type { AssetInfo } from '@/core/counterparty/api';
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
