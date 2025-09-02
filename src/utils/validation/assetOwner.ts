/**
 * Asset owner lookup utilities for destination input
 * Allows users to enter asset names and automatically resolve to owner addresses
 */

import { fetchAssetDetails } from '@/utils/blockchain/counterparty';
import { validateSubasset, validateParentAsset, isNamedAsset, isNumericAsset } from './asset';

export interface AssetOwnerLookupResult {
  isValid: boolean;
  ownerAddress?: string;
  error?: string;
  assetName?: string;
}

/**
 * Determines if a string looks like an asset name that we should lookup
 * Only accepts the specific format ASSET.xcp (case insensitive)
 */
export function looksLikeAssetName(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const cleaned = value.trim();
  
  // Skip obviously invalid cases
  if (cleaned.length === 0) {
    return false;
  }
  
  // Must end with .xcp (case insensitive)
  if (!cleaned.toLowerCase().endsWith('.xcp')) {
    return false;
  }
  
  // Must contain exactly one dot followed by 'xcp' (case insensitive)
  const dotIndex = cleaned.lastIndexOf('.');
  if (dotIndex === -1 || cleaned.slice(dotIndex + 1).toLowerCase() !== 'xcp') {
    return false;
  }
  
  // Extract parent asset name (everything before the last dot)
  const parentAsset = cleaned.slice(0, dotIndex);
  
  // Parent must be a valid asset name (4-12 chars, B-Z start for named assets, or A + numbers for numeric)
  const parentValidation = validateParentAsset(parentAsset);
  return parentValidation.isValid;
}

/**
 * Looks up the owner address for a given asset name
 * Supports both regular assets and subassets
 */
export async function lookupAssetOwner(assetName: string): Promise<AssetOwnerLookupResult> {
  try {
    // Quick validation
    if (!looksLikeAssetName(assetName)) {
      return {
        isValid: false,
        error: 'Invalid asset name format'
      };
    }

    // Normalize asset name
    const normalizedName = assetName.trim();
    
    // For subassets, preserve case of child part
    let queryName: string;
    if (normalizedName.includes('.')) {
      const [parent, child] = normalizedName.split('.');
      queryName = parent.toUpperCase() + '.' + child; // Keep child case-sensitive
    } else {
      queryName = normalizedName.toUpperCase(); // Regular assets are uppercase
    }

    // Fetch asset details from Counterparty API
    const assetInfo = await fetchAssetDetails(queryName);
    
    if (!assetInfo || !assetInfo.issuer) {
      return {
        isValid: false,
        error: 'Asset not found or has no issuer'
      };
    }

    return {
      isValid: true,
      ownerAddress: assetInfo.issuer,
      assetName: queryName
    };

  } catch (error) {
    return {
      isValid: false,
      error: 'Failed to lookup asset owner'
    };
  }
}

/**
 * Quick check if a value should trigger asset owner lookup
 * Only triggers for ASSET.xcp format (case insensitive)
 */
export function shouldTriggerAssetLookup(value: string): boolean {
  if (!value || value.length < 8) { // Minimum: "TEST.xcp" (4 char asset + .xcp)
    return false;
  }

  // Don't trigger on obvious Bitcoin addresses
  if (value.match(/^[13bc]/i) && value.length > 20) {
    return false;
  }
  
  // Must end with .xcp (case insensitive)
  if (!value.toLowerCase().endsWith('.xcp')) {
    return false;
  }
  
  // Use the proper validation - this is more lenient for UI responsiveness
  return looksLikeAssetName(value);
}