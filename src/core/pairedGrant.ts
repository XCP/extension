import { normalizeAddressForComparison } from '@/core/bitcoin/address';

/** The persisted shape of a site's paired-address grant (`settings.providerCapabilities[origin]`). */
export interface PairedGrant {
  pairedAddresses?: boolean;
  walletId?: string;
  /** The address that was active when the user approved the grant. */
  address?: string;
  /** Its Legacy/SegWit sibling at the same derivation index, recorded at approval time. */
  pairedAddress?: string;
}

/**
 * A paired grant covers one derivation index, not one address. The user approves both halves on
 * the connect screen, so the grant must keep working whichever half is active afterwards: a site
 * that connected on the Legacy account must not lose its source address, or refuse a signature
 * it already showed, because the user switched to the SegWit sibling in the extension.
 *
 * Grants written before the sibling was recorded carry only `address`; they keep matching that
 * half exactly and are upgraded the next time the site connects.
 */
export function pairedGrantCovers(grant: PairedGrant | undefined, walletId: string, address: string): boolean {
  if (grant?.pairedAddresses !== true || grant.walletId !== walletId) return false;
  const wanted = normalizeAddressForComparison(address);
  return [grant.address, grant.pairedAddress].some(
    candidate => typeof candidate === 'string' && normalizeAddressForComparison(candidate) === wanted,
  );
}
