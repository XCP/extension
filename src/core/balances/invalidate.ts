/**
 * Forgetting everything cached about one address's balances.
 *
 * The balances on the home screen come from two independent caches, and a refresh that clears one
 * of them is worse than no refresh at all — it redraws, looks like it worked, and shows the same
 * stale number. The BTC row is the one that matters most here: it is what someone waiting on a
 * deposit is staring at, and it is the one served by the *other* cache.
 *
 * - Counterparty balances go through the API client's response cache, keyed by URL, 60s TTL.
 * - BTC comes from `core/bitcoin/balance`, which keeps its own keyed TTL cache per address.
 *
 * Anything added later that feeds a balance row belongs here too. That is the whole reason this is
 * one named operation rather than two calls at the call site: the next person adding a cache should
 * find one obvious place that already means "forget this address".
 */

import { clearBalanceCache } from '@/core/bitcoin/balance';
import { clearApiCacheMatching } from '@/core/counterparty/api';

/**
 * Drop every cached balance for an address, so the next read goes to the network.
 *
 * Matching is by substring on the API cache keys, which are URLs containing the address. That is
 * broader than balances alone — orders, dispensers and anything else keyed on this address go too.
 * Deliberate: a manual refresh means "I do not trust what is on screen", and a partially refreshed
 * screen is the confusing outcome.
 */
export function invalidateAddressBalances(address: string): void {
  if (!address) return;
  clearApiCacheMatching(address);
  clearBalanceCache(address);
}
