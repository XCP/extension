import { AddressFormat, getAddressFromMnemonic, getDerivationPathForAddressFormat, hasAddressActivity } from '@/utils/blockchain/bitcoin';
import { fetchTokenBalances } from '@/utils/blockchain/counterparty/api';

interface AddressTypeCheck {
  format: AddressFormat;
  address: string;
  hasTransactions: boolean;
}

/**
 * Check if an address has any transaction history using existing API utilities
 * Returns true if any provider confirms transactions or token balances
 */
async function checkAddressActivity(address: string): Promise<boolean> {
  // First check Counterparty API for token balances - most specific indicator
  try {
    const balances = await fetchTokenBalances(address, { limit: 1 });
    if (balances && balances.length > 0) {
      console.log(`Address ${address} has Counterparty token activity`);
      return true;
    }
  } catch (error) {
    console.warn('Counterparty balance check failed:', error);
  }

  // Check Bitcoin transaction history using our balance module helper
  try {
    const hasActivity = await hasAddressActivity(address);
    if (hasActivity) {
      console.log(`Address ${address} has Bitcoin transaction history`);
      return true;
    }
  } catch (error) {
    console.warn('Bitcoin activity check failed:', error);
  }

  // No activity found
  return false;
}

/**
 * Detect the most likely address format for a mnemonic by checking blockchain activity
 * @param mnemonic The mnemonic phrase to check
 * @param cachedPreviews Optional cached address previews to avoid re-derivation
 * @returns The detected address format, or P2TR as default
 */
export async function detectAddressFormat(
  mnemonic: string,
  cachedPreviews?: Partial<Record<AddressFormat, string>>
): Promise<AddressFormat> {
  // Check these formats for activity (skip Taproot since it's the fallback)
  const addressFormatsToCheck: AddressFormat[] = [
    AddressFormat.P2PKH,        // Legacy (most common)
    AddressFormat.P2WPKH,       // Native SegWit (bc1)
    AddressFormat.P2SH_P2WPKH,  // Nested SegWit (3)
  ];

  // First, generate all preview addresses (or use cached ones)
  const formatAddressMap: Map<AddressFormat, string> = new Map();

  for (const format of addressFormatsToCheck) {
    try {
      let address: string;
      if (cachedPreviews?.[format]) {
        address = cachedPreviews[format];
      } else {
        // Generate the first address (index 0) for this format
        const path = `${getDerivationPathForAddressFormat(format)}/0`;
        address = getAddressFromMnemonic(mnemonic, path, format);
      }
      formatAddressMap.set(format, address);
    } catch (error) {
      console.warn(`Failed to generate address for ${format}:`, error);
    }
  }

  // Check each address for activity in order of priority
  for (const [format, address] of formatAddressMap.entries()) {
    try {
      const hasActivity = await checkAddressActivity(address);
      if (hasActivity) {
        console.log(`Detected address format: ${format}`);
        return format;
      }
    } catch (error) {
      console.warn(`Failed to check ${format}:`, error);
    }
  }

  // Default to P2TR (Taproot) for best efficiency
  console.log('No activity detected or API failed, defaulting to P2TR');
  return AddressFormat.P2TR;
}

/**
 * Get preview addresses for all address formats
 * Used in settings to show users what addresses would look like
 */
export function getPreviewAddresses(mnemonic: string): Record<AddressFormat, string> {
  const formats = [
    AddressFormat.P2PKH,
    AddressFormat.P2SH_P2WPKH,
    AddressFormat.P2WPKH,
    AddressFormat.P2TR,
    AddressFormat.Counterwallet,
  ];

  const previews: Partial<Record<AddressFormat, string>> = {};

  for (const format of formats) {
    try {
      const path = `${getDerivationPathForAddressFormat(format)}/0`;
      previews[format] = getAddressFromMnemonic(mnemonic, path, format);
    } catch (error) {
      console.warn(`Failed to generate preview for ${format}:`, error);
    }
  }

  return previews as Record<AddressFormat, string>;
}

/**
 * Detect address format from cached previews only (no derivation needed)
 * Useful for checking existing wallets where we already have the preview addresses
 */
export async function detectAddressFormatFromPreviews(
  previews: Partial<Record<AddressFormat, string>>
): Promise<AddressFormat> {
  // Check these formats for activity (skip Taproot since it's the fallback)
  const addressFormatsToCheck: AddressFormat[] = [
    AddressFormat.P2PKH,        // Legacy (most common)
    AddressFormat.P2WPKH,       // Native SegWit (bc1)
    AddressFormat.P2SH_P2WPKH,  // Nested SegWit (3)
  ];

  // Check each preview address for activity
  for (const format of addressFormatsToCheck) {
    const address = previews[format];
    if (!address) continue;

    try {
      const hasActivity = await checkAddressActivity(address);
      if (hasActivity) {
        console.log(`Detected format ${format} from cached preview`);
        return format;
      }
    } catch (error) {
      console.warn(`Failed to check ${format} preview:`, error);
    }
  }

  // Default to P2TR (Taproot) for best efficiency
  return AddressFormat.P2TR;
}