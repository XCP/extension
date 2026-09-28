import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { AddressFormat } from '@/core/bitcoin/addressFormat';
import { getPairedAddressFormats } from '@/core/wallet/addressDeriver';

/** Whether the wallet can derive the active index's Legacy/SegWit sibling pair. */
export const walletSupportsPair = (wallet: { type: string; addressFormat: AddressFormat }): boolean =>
  wallet.type === 'mnemonic' && Boolean(getPairedAddressFormats(wallet.addressFormat));

interface PairedTargets<T extends { address: string }> {
  legacy: T;
  segwit: T;
}

export interface SignerScope<T extends { address: string }> {
  /** Every address a site may name as a signer: the active address, then its pair when loaded. */
  allowed: string[];
  /** The paired sibling `address` names, compared the way addresses are compared everywhere. */
  findPairedTarget: (address: string) => T | undefined;
  /** Whether any signer in `signInputs` is a paired sibling rather than the active address. */
  usesPairedSigner: (signInputs: Record<string, unknown>) => boolean;
}

/**
 * The addresses a signing request may sign for: the active address, plus its Legacy/SegWit pair
 * when the caller loaded one. Loading the pair and checking the site's grant for it stay with the
 * caller, since each method decides when the pair is worth loading.
 */
export function signerScope<T extends { address: string }>(
  activeAddress: string,
  paired: PairedTargets<T> | null,
): SignerScope<T> {
  const pairedTargets = paired ? [paired.legacy, paired.segwit] : [];
  const normalizedActive = normalizeAddressForComparison(activeAddress);
  const pairedSet = new Set(pairedTargets.map(target => normalizeAddressForComparison(target.address)));
  return {
    allowed: [activeAddress, ...pairedTargets.map(target => target.address)],
    findPairedTarget: (address) => {
      const normalized = normalizeAddressForComparison(address);
      return pairedTargets.find(target => normalizeAddressForComparison(target.address) === normalized);
    },
    usesPairedSigner: (signInputs) => Object.keys(signInputs).some(address => {
      const normalized = normalizeAddressForComparison(address);
      return normalized !== normalizedActive && pairedSet.has(normalized);
    }),
  };
}
