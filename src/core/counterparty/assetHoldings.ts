/**
 * Whether an address has anything on Counterparty to lose: a balance, or ownership of an asset.
 *
 * One row of each is enough to answer, so both reads ask for one; they go through the API's
 * shared request gate and response cache like every other read. Fail-safe: when either cannot be
 * answered, the address is treated as holding something, since an unknown holding is not an empty
 * one and the caller's warning is the cheaper mistake.
 */

import { fetchOwnedAssets, fetchTokenBalances } from '@/core/counterparty/api';

export async function addressHoldsCounterpartyAssets(address: string): Promise<boolean> {
  try {
    const [balances, owned] = await Promise.all([
      fetchTokenBalances(address, { limit: 1, verbose: false }),
      fetchOwnedAssets(address, { limit: 1, verbose: false }),
    ]);
    return balances.length > 0 || owned.length > 0;
  } catch {
    return true;
  }
}
