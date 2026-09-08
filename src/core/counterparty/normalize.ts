import { TransactionInputError } from '@/core/validation/transaction-input-error';
/**
 * Normalization utilities for transaction composition
 * Handles conversion of user-friendly values to API-compatible formats
 */

import { parseRawInteger, rawToInput, serializeDecimal } from "@/core/amount-contract/amounts";
import type { AssetInfo } from "@/core/counterparty/api";
import { fetchAssetDetails } from "@/core/counterparty/api";
import { isHexMemo, stripHexPrefix } from "@/core/counterparty/memo";
import { CounterpartyApiError } from "@/core/errors";
import { validateFeeRate } from "@/core/validation/fee";
import { exactQuantity } from "@/core/validation/transaction-amount";

/**
 * Converts form string values to proper booleans.
 * Handles: true, 'true', 'yes' (Headless UI checkbox value)
 * Returns false for: false, 'false', undefined, null, empty string, 'no'
 */
function toBoolean(val: unknown): boolean {
  if (val === true || val === 'true' || val === 'yes') return true;
  return false;
}

// FLAG_BINARY_MEMO indicates memo is hex/binary (per counterparty-core sweep.py)
const FLAG_BINARY_MEMO = 4;

/**
 * Memo configuration types for different compose operations
 */
type MemoConfig =
  | { type: 'boolean'; field: string }  // Set a boolean field (e.g., memo_is_hex for send)
  | { type: 'flag'; flagsField: string; flagValue: number };  // OR a flag value (e.g., sweep)

/**
 * Configuration for normalizing form fields based on compose type.
 *
 * - `quantityFields`: Fields containing quantities that may need conversion
 * - `assetFields`: Maps quantity field → form field name to look up the asset
 *                  For hardcoded assets (e.g., BTC), use a hidden form field
 * - `booleanFields`: Fields that should be converted from strings to booleans
 * - `memoConfig`: How to handle hex memo detection (set boolean or OR flag)
 */
export const NORMALIZATION_CONFIG: Record<string, {
  quantityFields: string[];
  assetFields: Record<string, string>;
  booleanFields?: string[];
  memoConfig?: MemoConfig;
}> = {
  send: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' },
    booleanFields: ['no_dispense'],
    memoConfig: { type: 'boolean', field: 'memo_is_hex' }
  },
  order: {
    quantityFields: ['give_quantity', 'get_quantity'],
    assetFields: {
      give_quantity: 'give_asset',
      get_quantity: 'get_asset'
    }
  },
  issuance: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' },
    booleanFields: ['divisible', 'lock', 'reset']
  },
  destroy: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  dividend: {
    quantityFields: ['quantity_per_unit'],
    assetFields: { quantity_per_unit: 'dividend_asset' }
  },
  dispenser: {
    quantityFields: ['give_quantity', 'escrow_quantity', 'mainchainrate'],
    assetFields: {
      give_quantity: 'asset',
      escrow_quantity: 'asset',
      mainchainrate: 'mainchainrate_asset'  // hidden form field with value 'BTC'
    }
  },
  dispense: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  broadcast: {
    // A broadcast's `value` is a feed reading, not a quantity of anything: core packs it as a raw
    // double (`packBroadcast`), so scaling it by 1e8 would corrupt it. Listing it here with no
    // asset field left it skipped by the loop, which produced the right answer for the wrong
    // reason — and read as if scaling were handled. It is not a quantity field.
    quantityFields: [],
    assetFields: {}
  },
  burn: {
    quantityFields: [],
    assetFields: {}  // No UI form exists for burn
  },
  fairmint: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  fairminter: {
    // lot_price is priced in XCP, not in the asset being minted, so it takes its divisibility
    // from a hidden form field the way mainchainrate takes BTC above. Leaving it out of this list
    // entirely — which it was — sent the user's figure through untouched: core reads `price` as
    // XCP base units (messages/fairmint.py computes quantity / quantity_by_price * price against
    // a base-unit balance), so "1" composed a price of 0.00000001 XCP and offered the whole
    // supply for a hundred-millionth of what was intended. Byte-equality verification cannot
    // catch this, because the packer packs the same wrong number the form produced.
    // `pool_quantity` belongs here for the same reason `lot_price` does. It is denominated in the
    // asset being minted — core checks `supply + premint_quantity + pool_quantity >= hard_cap`
    // against base units in messages/fairminter.py — so leaving it out sends the form's figure
    // through untouched and reserves a hundred-millionth of the intended pool.
    quantityFields: ['premint_quantity', 'lot_size', 'lot_price', 'max_mint_per_tx', 'max_mint_per_address', 'hard_cap', 'soft_cap', 'pool_quantity'],
    assetFields: {
      premint_quantity: 'asset',
      lot_size: 'asset',
      lot_price: 'lot_price_asset',  // hidden form field with value 'XCP'
      max_mint_per_tx: 'asset',
      max_mint_per_address: 'asset',
      hard_cap: 'asset',
      soft_cap: 'asset',
      pool_quantity: 'asset'
    },
    booleanFields: ['burn_payment', 'lock_description', 'lock_quantity', 'divisible']
  },
  sweep: {
    quantityFields: [],
    assetFields: {},
    memoConfig: { type: 'flag', flagsField: 'flags', flagValue: FLAG_BINARY_MEMO }
  },
  utxo: {
    quantityFields: [],
    assetFields: {}
  },
  move: {
    // Moves every asset at a UTXO, so it names no quantity. Declared anyway: an absent key takes
    // the early return in `normalizeFormData`, which passes the form through untouched, and that
    // branch cannot tell "nothing to scale" from "nobody wired this up yet".
    quantityFields: [],
    assetFields: {}
  },
  mpma: {
    quantityFields: [],
    assetFields: {}
  },
  attach: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  detach: {
    quantityFields: [],
    assetFields: {}
  },
  btcpay: {
    quantityFields: [],
    assetFields: {}
  },
  cancel: {
    quantityFields: [],
    assetFields: {}
  },
  pooldeposit: {
    quantityFields: ['quantity_a', 'quantity_b'],
    assetFields: {
      quantity_a: 'asset_a',
      quantity_b: 'asset_b'
    }
  },
  poolwithdraw: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'lp_asset' }
  }
};

/**
 * Cache for asset info to avoid duplicate fetches
 */
type AssetInfoCache = Map<string, AssetInfo | null>;

/**
 * Normalizes form data for API consumption
 * Converts user-friendly values (e.g., "1.5") to API format (e.g., 150000000 for divisible assets)
 */
export async function normalizeFormData(
  formData: FormData,
  composeType: string
): Promise<{
  normalizedData: Record<string, any>;
  assetInfoCache: AssetInfoCache;
}> {
  const config = NORMALIZATION_CONFIG[composeType];
  if (!config) throw new Error(`Unsupported compose type: ${composeType}`);
  const rawData = Object.fromEntries(formData);
  const normalizedData: Record<string, any> = { ...rawData };
  const assetInfoCache: AssetInfoCache = new Map();

  if ('sat_per_vbyte' in rawData) {
    const validation = validateFeeRate(String(rawData.sat_per_vbyte), { minRate: 0.1 });
    if (!validation.isValid) throw new TransactionInputError('fee_invalid', validation.error ?? 'Invalid fee rate');
    normalizedData.sat_per_vbyte = serializeDecimal(String(rawData.sat_per_vbyte), { min: 0.1, max: 5000, maxDecimals: 8 });
  }

  const divisibility = async (asset: string): Promise<boolean> => {
    if (asset === 'BTC' || asset === 'XCP') return true;
    if (composeType === 'fairminter' || (composeType === 'issuance' && toBoolean(rawData.reset))) {
      if (!['true', 'false', 'yes', 'no'].includes(String(rawData.divisible))) {
        throw new TransactionInputError('asset_divisibility_unknown', 'Choose whether the issued asset is divisible.');
      }
      return toBoolean(rawData.divisible);
    }
    if (!assetInfoCache.has(asset)) {
      try {
        assetInfoCache.set(asset, await fetchAssetDetails(asset));
      } catch (error) {
        // A failed read is not evidence of a new asset. Only an actual 404
        // or the documented null result may use the new-issuance choice.
        if (composeType === 'issuance' && error instanceof CounterpartyApiError && error.statusCode === 404) {
          assetInfoCache.set(asset, null);
        } else throw error;
      }
    }
    const details = assetInfoCache.get(asset);
    if (details === null && composeType === 'issuance') {
      if (!['true', 'false', 'yes', 'no'].includes(String(rawData.divisible))) {
        throw new TransactionInputError('asset_divisibility_unknown', 'Choose whether the issued asset is divisible.');
      }
      return toBoolean(rawData.divisible);
    }
    if (!details) throw new Error(`Asset "${asset}" not found`);
    if (typeof details.divisible !== 'boolean') throw new TransactionInputError('asset_divisibility_unknown', `Asset "${asset}" divisibility is unknown`);
    return details.divisible;
  };

  if (composeType === 'mpma' && ('assets' in rawData || 'quantities' in rawData)) {
    const assets = String(rawData.assets ?? '').split(',');
    const quantities = String(rawData.quantities ?? '').split(',');
    if (assets.length !== quantities.length) throw new Error('Each destination must have exactly one asset and quantity.');
    const normalized: string[] = [];
    for (let i = 0; i < assets.length; i++) {
      if (!assets[i]) throw new Error('An asset is required for each quantity.');
      normalized.push(exactQuantity(quantities[i]!, await divisibility(assets[i]!), `Quantity ${i + 1}`));
    }
    normalizedData.quantities = normalized.join(',');
  }

  const optionalFairminterQuantities = new Set(['premint_quantity', 'max_mint_per_tx', 'max_mint_per_address', 'hard_cap', 'soft_cap', 'pool_quantity']);
  for (const field of config.quantityFields) {
    const value = rawData[field];
    if (value === undefined) continue;
    if (value === '' && composeType === 'fairminter' && optionalFairminterQuantities.has(field)) {
      delete normalizedData[field]; // An omitted optional limit uses Core's default.
      continue;
    }
    const asset = rawData[config.assetFields[field]!] as string | undefined;
    if (!asset) throw new Error(`An asset is required to interpret ${field}.`);
    normalizedData[field] = exactQuantity(String(value), await divisibility(asset), field);
  }

  // These form fields already use protocol base units, not display quantities.
  for (const field of ['min_lp_quantity', 'min_quantity_a', 'min_quantity_b', 'fee_required', 'utxo_value', 'destination_vout']) {
    if (field in rawData) normalizedData[field] = parseRawInteger(String(rawData[field])).toString();
  }

  // Process boolean fields (convert string 'true'/'false' to actual booleans)
  if (config.booleanFields) {
    for (const booleanField of config.booleanFields) {
      if (booleanField in rawData) {
        normalizedData[booleanField] = toBoolean(rawData[booleanField]);
      }
    }
  }

  // Process memo field (detect hex, strip prefix, set appropriate indicator)
  if (config.memoConfig && 'memo' in rawData) {
    const memo = rawData['memo']?.toString() || '';

    if (memo && isHexMemo(memo)) {
      // Strip hex prefix and update memo
      normalizedData['memo'] = stripHexPrefix(memo);

      // Set the hex indicator based on config type
      if (config.memoConfig.type === 'boolean') {
        // For send: set memo_is_hex = true
        normalizedData[config.memoConfig.field] = true;
      } else if (config.memoConfig.type === 'flag') {
        // For sweep: OR the flag value into the flags field
        const currentFlags = parseInt(rawData[config.memoConfig.flagsField]?.toString() || '0', 10);
        normalizedData[config.memoConfig.flagsField] = currentFlags | config.memoConfig.flagValue;
      }
    }
  }

  return { normalizedData, assetInfoCache };
}

/** Called only after the transaction has been checked against normalizedData.
 * Review quantities are reconstructed from that checked intent and the separate
 * asset read used for scaling, never the composer's echoed *_normalized values.
 */
export function verifiedReviewParams(
  composeType: string,
  normalizedData: Record<string, any>,
  assetInfoCache: AssetInfoCache = new Map(),
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...normalizedData };
  if (normalizedData.sourceAddress) params.source = normalizedData.sourceAddress;
  const config = NORMALIZATION_CONFIG[composeType];
  if (!config) throw new Error(`Unsupported compose type: ${composeType}`);
  for (const field of config.quantityFields) {
    if (!(field in normalizedData)) continue;
    const assetField = config.assetFields[field]!;
    const asset = normalizedData[assetField] as string;
    const details = assetInfoCache.get(asset);
    const divisible = asset === 'BTC' || asset === 'XCP'
      ? true
      : composeType === 'fairminter' || (composeType === 'issuance' && (normalizedData.reset || !details))
        ? normalizedData.divisible
        : details?.divisible;
    if (typeof divisible !== 'boolean') throw new TransactionInputError('asset_divisibility_unknown', `Asset "${asset}" divisibility is unknown`);
    params[`${field}_normalized`] = rawToInput(normalizedData[field], divisible ? 8 : 0);
    params[`${assetField}_info`] = { ...details, divisible };
  }
  if (composeType === 'mpma' || (composeType === 'send' && normalizedData.destinations)) {
    const destinations = String(normalizedData.destinations).split(',');
    const assets = composeType === 'mpma' ? String(normalizedData.assets).split(',') : destinations.map(() => normalizedData.asset);
    const quantities = composeType === 'mpma' ? String(normalizedData.quantities).split(',') : destinations.map(() => normalizedData.quantity);
    if (assets.length !== destinations.length || quantities.length !== destinations.length) throw new Error('Mismatched MPMA review data.');
    params.asset_dest_quant_list = assets.map((asset, index) => [asset, destinations[index], quantities[index]]);
    params.verified_asset_info = Object.fromEntries(assets.map(asset => [asset, {
      ...assetInfoCache.get(asset),
      divisible: asset === 'BTC' || asset === 'XCP' ? true : assetInfoCache.get(asset)?.divisible,
    }]));
    if (typeof normalizedData.memos === 'string') params.memos = normalizedData.memos.split(',');
  }
  return params;
}
