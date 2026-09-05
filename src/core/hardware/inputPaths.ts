import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { VerifiedPsbtPrevout } from '@/core/bitcoin/psbtPrevouts';

export interface HardwareDerivedAddress {
  address: string;
  path: string;
}

/** Bind every hardware input to the derivation path that owns its verified prevout. */
export function mapVerifiedInputPaths(
  prevouts: VerifiedPsbtPrevout[],
  addresses: HardwareDerivedAddress[],
  parsePath: (path: string) => number[],
): Map<number, number[]> {
  const paths = new Map<number, number[]>();
  for (const prevout of prevouts) {
    const owner = prevout.address
      ? addresses.find((candidate) =>
          normalizeAddressForComparison(candidate.address)
          === normalizeAddressForComparison(prevout.address!)
        )
      : undefined;
    if (!owner) {
      throw new Error(
        `PSBT input ${prevout.index} does not belong to a derived address in this hardware wallet`,
      );
    }
    paths.set(prevout.index, parsePath(owner.path));
  }
  return paths;
}
