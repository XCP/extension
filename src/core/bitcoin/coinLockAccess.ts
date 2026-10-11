import type { UTXO } from '@/core/bitcoin/utxo';
import type { CoinLock } from '@/types/coinLocks';

type LockedOutpointsReader = (address: string, utxos?: readonly UTXO[]) => Promise<Map<string, CoinLock>>;
let readLockedOutpoints: LockedOutpointsReader = async () => new Map();

/** Installed by the entrypoint that owns the runtime store. */
export function setLockedOutpointsReader(reader: LockedOutpointsReader): void {
  readLockedOutpoints = reader;
}

export function lockedOutpoints(address: string, utxos?: readonly UTXO[]): Promise<Map<string, CoinLock>> {
  return readLockedOutpoints(address, utxos);
}
