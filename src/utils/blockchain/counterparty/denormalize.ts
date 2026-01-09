/**
 * Denormalization utilities for provider data
 * Handles conversion of base unit values to user-friendly display formats
 * This is the inverse of normalize.ts - used when receiving data from the provider API
 */

import type { AssetInfo } from "@/utils/blockchain/counterparty/api";
import { fetchAssetDetails } from "@/utils/blockchain/counterparty/api";
import { fromSatoshis } from "@/utils/numeric";

/**
 * Configuration for denormalizing provider data based on compose type
 * Uses the same config structure as normalization for consistency
 */
const DENORMALIZATION_CONFIG: Record<string, {
  quantityFields: string[];
  assetFields: Record<string, string>;
}> = {
  send: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
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
    assetFields: { quantity: 'asset' }
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
      mainchainrate: 'BTC'  // mainchainrate is always in satoshis
    }
  },
  dispense: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  burn: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'XCP' }  // Burn is always XCP
  },
  fairmint: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  fairminter: {
    quantityFields: ['premint_quantity', 'lot_size'],
    assetFields: {
      premint_quantity: 'asset',
      lot_size: 'asset'
    }
  },
  sweep: {
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
  }
};

/**
 * Cache for asset info to avoid duplicate fetches
 */
type AssetInfoCache = Map<string, AssetInfo | null>;

/**
 * Denormalizes provider data for form display
 * Converts API format (e.g., 150000000 for divisible assets) to user-friendly values (e.g., "1.5")
 * This is the inverse of normalizeFormData
 */
export async function denormalizeProviderData(
  providerData: Record<string, any>,
  composeType: string
): Promise<{
  denormalizedData: Record<string, any>;
  assetInfoCache: AssetInfoCache;
}> {
  const config = DENORMALIZATION_CONFIG[composeType];
  if (!config) {
    // No denormalization needed for this compose type
    return {
      denormalizedData: providerData,
      assetInfoCache: new Map()
    };
  }

  const denormalizedData: Record<string, any> = { ...providerData };
  const assetInfoCache: AssetInfoCache = new Map();

  // Process quantity fields
  for (const quantityField of config.quantityFields) {
    const value = providerData[quantityField];
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Find corresponding asset field
    const assetField = config.assetFields[quantityField];
    if (!assetField) {
      continue;
    }

    // Get asset name - could be a hardcoded value or from the data
    const assetName = typeof assetField === 'string' && assetField.toUpperCase() === assetField
      ? assetField  // It's a hardcoded asset like 'BTC', 'XCP'
      : providerData[assetField]?.toString();  // It's a field reference

    if (!assetName) {
      continue;
    }

    // Handle BTC (always divisible)
    if (assetName === 'BTC') {
      denormalizedData[quantityField] = fromSatoshis(value, { removeTrailingZeros: true });
      continue;
    }

    // For XCP, it's always divisible
    if (assetName === 'XCP') {
      denormalizedData[quantityField] = fromSatoshis(value, { removeTrailingZeros: true });
      continue;
    }

    // Fetch asset info if not cached
    let assetInfo = assetInfoCache.get(assetName);
    if (assetInfo === undefined) {
      try {
        const details = await fetchAssetDetails(assetName);
        assetInfo = details || null;
        assetInfoCache.set(assetName, assetInfo);
      } catch (error) {
        console.error(`Failed to fetch asset info for ${assetName}:`, error);
        assetInfo = null;
        assetInfoCache.set(assetName, null);
      }
    }

    // Determine if asset is divisible
    const isDivisible = assetInfo?.divisible ?? false;

    // Convert from satoshis if divisible
    if (isDivisible) {
      denormalizedData[quantityField] = fromSatoshis(value, { removeTrailingZeros: true });
    } else {
      // For non-divisible assets, just ensure it's a string
      denormalizedData[quantityField] = value.toString();
    }
  }

  return { denormalizedData, assetInfoCache };
}

/**
 * Detects the compose type from provider params
 * Uses the same logic as getComposeType but adapted for provider data
 */
export function getComposeTypeFromProvider(params: Record<string, any>): string | undefined {
  // Try to detect based on presence of specific fields
  if ('give_asset' in params && 'get_asset' in params) return 'order';
  if ('dividend_asset' in params) return 'dividend';
  if ('escrow_quantity' in params && 'mainchainrate' in params) return 'dispenser';
  if ('dispenser' in params && 'quantity' in params) return 'dispense';
  if ('flags' in params && 'destination' in params && !('quantity' in params)) return 'sweep';
  if ('order_match_id' in params) return 'btcpay';
  if ('offer_hash' in params) return 'cancel';
  if ('text' in params && !('asset' in params)) return 'broadcast';
  if ('quantity' in params && 'asset' in params && 'destination' in params) return 'send';
  if ('quantity' in params && 'asset' in params && 'divisible' in params) return 'issuance';
  if ('quantity' in params && 'asset' in params) {
    // Could be various types, check for other hints
    if ('tag' in params) return 'destroy';
    if ('source_utxo' in params) return 'attach';
    return 'send'; // Default to send if has quantity and asset
  }

  return undefined;
}