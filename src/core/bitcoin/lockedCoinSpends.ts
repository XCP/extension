/**
 * A site asking the wallet to sign a spend of one of its locked coins (core/bitcoin/coinLocks.ts).
 *
 * The wallet has no list of trusted marketplaces: a lock remembers the site whose signature
 * request made it, and only that site, asking for the one thing a lock is for, signs without a
 * word. That is an `authorize_exact_offer` whose input 0 is the offer slot it locked: the
 * authorization pre-signs the spend the offer settles with, and adds the offer to the slot's lock
 * rather than cancelling anything. Every other spend of an active lock (another site, another
 * intent, an offer funding that reuses the coin, a raw transaction) asks the user first, and the
 * acknowledgement is the unlock. A coin the user locked by hand never passes silently.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { activeCoinLocks, type CoinLock, type CoinLockKind } from '@/core/bitcoin/coinLocks';
import type { MarketplaceIntentClaimV1 } from '@/core/counterparty/marketplace/intentTypes';
import type { BumpAcceptanceFeeIntentClaim } from '@/core/counterparty/marketplaceBundle';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';

/** A locked coin a request would spend, as the approval names it. */
export interface LockedCoinSpend {
  outpoint: string;
  address: string;
  kind: CoinLockKind;
  manual: boolean;
  /** How many offers the coin backs, as far as the wallet knows their ids. */
  offers: number;
  valueSats: number;
}

/** One input the wallet would sign, and the request it belongs to. */
export interface LockedCoinSpendContext {
  /** The requesting site's origin, as the provider verified it from the sender. */
  origin: string;
  intent?: MarketplaceIntentClaimV1 | BumpAcceptanceFeeIntentClaim;
  inputIndex: number;
}

/** Whether signing this input may go ahead without the user unlocking `lock` first. */
export function lockedCoinSpendAllowed(lock: CoinLock, spend: LockedCoinSpendContext): boolean {
  if (lock.unlocked) return true;
  if (lock.manual || lock.kind !== 'offer_slot' || lock.origin !== spend.origin) return false;
  const { intent } = spend;
  if (intent?.action !== 'authorize_exact_offer' || spend.inputIndex !== 0) return false;
  const slot = intent.bitcoinInvalidation.outpoint;
  return `${slot.txid.toLowerCase()}:${slot.vout}` === lock.outpoint;
}

/** One PSBT or transaction of a request: what it spends, which inputs the wallet signs, and why. */
export interface LockCheckedItem {
  intent?: MarketplaceIntentClaimV1 | BumpAcceptanceFeeIntentClaim;
  inputs: ReadonlyArray<{ txid: string; vout: number; address?: string }>;
  /** The inputs the wallet would sign, by signer address. */
  signInputs: Record<string, number[]>;
}

/**
 * The locked coins the request would spend without the user's say-so, once each. `locks` are the
 * live locks of the signing addresses.
 */
export function findLockedCoinSpends(
  items: readonly LockCheckedItem[],
  locks: readonly CoinLock[],
  origin: string,
): LockedCoinSpend[] {
  const byOutpoint = new Map(activeCoinLocks(locks).map(lock => [`${lock.address} ${lock.outpoint}`, lock]));
  const found = new Map<string, LockedCoinSpend>();
  for (const item of items) {
    for (const [signer, indices] of Object.entries(item.signInputs)) {
      for (const inputIndex of indices) {
        const input = item.inputs[inputIndex];
        if (!input) continue;
        const address = normalizeAddressForComparison(input.address ?? signer);
        const outpoint = `${input.txid.toLowerCase()}:${input.vout}`;
        const lock = byOutpoint.get(`${address} ${outpoint}`);
        if (!lock || lockedCoinSpendAllowed(lock, { origin, intent: item.intent, inputIndex })) continue;
        found.set(`${address} ${outpoint}`, {
          outpoint, address, kind: lock.kind, manual: lock.manual,
          offers: lock.kind === 'manual' ? 0 : lock.refs.length, valueSats: lock.valueSats,
        });
      }
    }
  }
  return [...found.values()];
}

/**
 * The approval warning for `coins`, or null when there are none. A warning rather than a block: the
 * user may mean it, and confirming unlocks the coins (providerSigningService.execute).
 */
export function lockedCoinWarning(coins: readonly LockedCoinSpend[]): SecurityWarning | null {
  if (coins.length === 0) return null;
  const offers = coins.some(coin => coin.kind !== 'manual');
  return {
    severity: 'warning',
    code: 'locked_coin_spend',
    title: coins.length === 1 ? 'Spends a locked coin' : 'Spends locked coins',
    message: offers
      ? 'This spends a coin locked for your offer. Your offer will be cancelled when this confirms.'
      : 'This spends a coin you locked.',
    data: { coins: [...coins] },
  };
}

/** The coins a review's warnings would unlock on confirmation, by address. */
export function lockedCoinsToUnlock(warnings: readonly SecurityWarning[]): Map<string, string[]> {
  const byAddress = new Map<string, string[]>();
  for (const warning of warnings) {
    if (warning.code !== 'locked_coin_spend') continue;
    for (const coin of warning.data.coins) {
      byAddress.set(coin.address, [...new Set([...(byAddress.get(coin.address) ?? []), coin.outpoint])]);
    }
  }
  return byAddress;
}
