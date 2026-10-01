/**
 * Where the wallet's locked coins (core/bitcoin/coinLocks.ts) meet the Counterparty composer.
 *
 * Selection already leaves locked coins out of `inputs_set`, but the composer does not only build
 * from that: the retry ladder in `compose.ts` ends by letting it choose freely, and a detach or move
 * names no set at all. So every compose request also names the locked coins in `exclude_utxos`,
 * and every composed transaction is checked afterwards; one that spends a locked coin anyway is
 * refused rather than shown for signing. A shortfall the locks cause says so, with the split.
 */

import type { CoinLock } from '@/core/bitcoin/coinLocks';
import { outpointOf } from '@/core/bitcoin/coinLocks';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { CounterpartyApiError, UnofferedInputsError } from '@/core/errors';
import { formatAmount } from '@/core/format';
import { t } from '@/i18n';

/** The `exclude_utxos` a request sends: every locked coin, then what the caller excluded itself. */
export function withLockedExcluded(locks: ReadonlyMap<string, CoinLock>, excludeUtxos: readonly string[] = []): string[] {
  return [...new Set([...locks.keys(), ...excludeUtxos.map(outpoint => outpoint.toLowerCase())])];
}

/**
 * Refuse a composed transaction that spends a locked coin. Its own error type, so no fallback
 * mistakes it for the composer rejecting the request and retries with a wider choice.
 */
export function assertSpendsNoLockedCoin(
  rawTransaction: string,
  locks: ReadonlyMap<string, CoinLock>,
  endpoint: string,
): void {
  if (locks.size === 0) return;
  // An unparseable transaction cannot be signed either; the signer refuses it there.
  const spent = parseRawTransactionLocally(rawTransaction)?.inputs.map(outpointOf) ?? [];
  const locked = spent.filter(outpoint => locks.has(outpoint));
  if (locked.length === 0) return;
  const offers = locked.some(outpoint => locks.get(outpoint)?.kind !== 'manual');
  throw new UnofferedInputsError(offers
    ? t('coin_lock_compose_spends_offer_coin')
    : t('coin_lock_compose_spends_locked_coin'), endpoint);
}

const INSUFFICIENT = /insufficient (btc|funds|utxos)|not enough (btc|funds)/i;

/**
 * A composer's "insufficient funds" restated with what the locks hold back, when they hold back
 * anything: the user sees BTC in the wallet and needs to know why a send cannot use it. Anything
 * else passes through unchanged.
 */
export function explainLockedShortfall(
  error: unknown,
  locks: ReadonlyMap<string, CoinLock>,
  freeSats: number,
  endpoint: string,
): unknown {
  if (locks.size === 0) return error;
  const message = error instanceof Error ? error.message : '';
  if (!INSUFFICIENT.test(message)) return error;
  const lockedSats = [...locks.values()].reduce((sum, lock) => sum + lock.valueSats, 0);
  if (lockedSats <= 0) return error;
  const amounts = [
    formatAmount({ value: freeSats, maximumFractionDigits: 0 }),
    formatAmount({ value: lockedSats, maximumFractionDigits: 0 }),
  ];
  const offersOnly = [...locks.values()].every(lock => !lock.manual);
  return new CounterpartyApiError(
    offersOnly ? t('coin_lock_insufficient_offers', amounts) : t('coin_lock_insufficient', amounts),
    endpoint,
    error instanceof Error ? { cause: error } : {},
  );
}
