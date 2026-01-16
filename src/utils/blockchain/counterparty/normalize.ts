/**
 * Normalization utilities for transaction composition
 * Handles conversion of user-friendly values to API-compatible formats
 */

import type { AssetInfo } from "@/utils/blockchain/counterparty/api";
import { fetchAssetDetails } from "@/utils/blockchain/counterparty/api";
import { toSatoshis } from "@/utils/numeric";

/**
 * Configuration for normalizing form fields based on compose type
 */
const NORMALIZATION_CONFIG: Record<string, {
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
      mainchainrate: 'BTC'
    }
  },
  dispense: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  broadcast: {
    quantityFields: ['value'],
    assetFields: {}
  },
  burn: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  fairmint: {
    quantityFields: ['quantity'],
    assetFields: { quantity: 'asset' }
  },
  fairminter: {
    quantityFields: ['premint_quantity'],
    assetFields: { premint_quantity: 'asset' }
  },
  sweep: {
    quantityFields: [],
    assetFields: {}
  },
  utxo: {
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
  }
};

/**
 * Detects the compose type from form data
 */
export function getComposeType(formData: Record<string, any>): string | undefined {
  // Map of Options type names to compose types
  const typeMapping: Record<string, string> = {
    'SendOptions': 'send',
    'ExtendedSendOptions': 'send',
    'OrderOptions': 'order',
    'IssuanceOptions': 'issuance',
    'DestroyOptions': 'destroy',
    'DispenserOptions': 'dispenser',
    'DispenseOptions': 'dispense',
    'DividendOptions': 'dividend',
    'BurnOptions': 'burn',
    'BroadcastOptions': 'broadcast',
    'SweepOptions': 'sweep',
    'FairminterOptions': 'fairminter',
    'FairmintOptions': 'fairmint',
    'AttachOptions': 'attach',
    'DetachOptions': 'detach',
    'MoveOptions': 'move',
    'BTCPayOptions': 'btcpay',
    'CancelOptions': 'cancel',
    'MPMAOptions': 'mpma',
    'MPMAData': 'mpma',
  };
  
  // Try to detect based on presence of specific fields
  if ('give_asset' in formData && 'get_asset' in formData) return 'order';
  if ('dividend_asset' in formData) return 'dividend';
  if ('escrow_quantity' in formData) return 'dispenser';
  if ('flags' in formData && 'destination' in formData && !('quantity' in formData)) return 'sweep';
  if ('utxos' in formData) return 'utxo';
  if ('sends' in formData) return 'mpma';
  if ('text' in formData) return 'broadcast';
  if ('quantity' in formData && 'asset' in formData) return 'send';
  if ('quantity' in formData && 'asset_name' in formData) return 'issuance';
  if ('destination' in formData && 'asset' in formData) return 'attach';
  if ('utxo_address' in formData) return 'movetoutxo';
  
  // Fallback: check if type is explicitly provided
  const typeName = formData.__type || formData.type;
  if (typeName && typeMapping[typeName]) {
    return typeMapping[typeName];
  }
  
  return undefined;
}

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
  if (!config) {
    // No normalization needed for this compose type
    return {
      normalizedData: Object.fromEntries(formData),
      assetInfoCache: new Map()
    };
  }
  
  const rawData = Object.fromEntries(formData);
  const normalizedData: Record<string, any> = { ...rawData };
  const assetInfoCache: AssetInfoCache = new Map();
  
  // Process quantity fields
  for (const quantityField of config.quantityFields) {
    const value = rawData[quantityField];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    
    // Find corresponding asset field
    const assetField = config.assetFields[quantityField];
    if (!assetField) {
      continue;
    }
    
    const assetName = rawData[assetField]?.toString();
    if (!assetName) {
      continue;
    }
    
    // Skip normalization for BTC (always divisible)
    if (assetName === 'BTC') {
      normalizedData[quantityField] = toSatoshis(value.toString());
      continue;
    }

    // Special handling for issuance composeType
    // Covers: new asset creation, issue-supply, lock-supply, update-description, etc.
    if (composeType === 'issuance') {
      // Case 1: New asset creation - form sets _isNewAsset="true"
      // Use form's divisible field directly (checkbox "on" = true, missing = false)
      if (rawData['_isNewAsset'] === 'true') {
        const isDivisible = rawData['divisible'] === 'on';
        if (isDivisible) {
          normalizedData[quantityField] = toSatoshis(value.toString());
        } else {
          normalizedData[quantityField] = value.toString();
        }
        continue;
      }

      // Case 2: Issue-supply - form pre-converts and sets divisible="true"/"false"
      // Don't double-convert, quantity is already in satoshi form
      if (rawData['divisible'] === 'true' || rawData['divisible'] === 'false') {
        normalizedData[quantityField] = value.toString();
        continue;
      }

      // Case 3: Other existing asset operations (lock-supply, update-description, etc.)
      // Quantity is typically 0, but fetch asset info if needed
      try {
        const details = await fetchAssetDetails(assetName);
        if (details) {
          assetInfoCache.set(assetName, details);
          const isDivisible = details.divisible ?? false;
          if (isDivisible) {
            normalizedData[quantityField] = toSatoshis(value.toString());
          } else {
            normalizedData[quantityField] = value.toString();
          }
        } else {
          // Null response - leave quantity as-is
          normalizedData[quantityField] = value.toString();
        }
      } catch {
        // Error fetching - leave quantity as-is (likely 0 for these operations)
        normalizedData[quantityField] = value.toString();
      }
      continue;
    }

    // Fetch asset info if not cached
    let assetInfo = assetInfoCache.get(assetName);
    if (assetInfo === undefined) {
      try {
        const details = await fetchAssetDetails(assetName);
        if (!details) {
          throw new Error(`Asset "${assetName}" not found`);
        }
        assetInfo = details;
        assetInfoCache.set(assetName, assetInfo);
      } catch (error) {
        // Fail fast - we need asset info to correctly normalize quantities
        const message = error instanceof Error ? error.message : `Failed to fetch asset info for ${assetName}`;
        throw new Error(message);
      }
    }

    // Determine if asset is divisible
    const isDivisible = assetInfo?.divisible ?? false;
    
    // Convert to satoshis if divisible
    if (isDivisible) {
      normalizedData[quantityField] = toSatoshis(value.toString());
    } else {
      normalizedData[quantityField] = value.toString();
    }
  }
  
  return { normalizedData, assetInfoCache };
}