/**
 * Approval rules for spending locked coins. A proved exact-offer authorization may reuse
 * its own origin's funding slot, and a proved offer invalidation may retire its own origin's
 * offer coins. All other locked spends require acknowledgement; manual locks never receive
 * that exemption.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { activeCoinLocks } from '@/core/bitcoin/coinLocks';
import type { MarketplaceApprovalReview, MarketplaceIntentClaimV1 } from '@/core/counterparty/marketplace/intentTypes';
import type { BumpAcceptanceFeeIntentClaim } from '@/core/counterparty/marketplaceBundle';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';
import type { CoinLock, CoinLockKind } from '@/types/coinLocks';

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
  /** The wallet's review of the intent against the transaction, when it made one. */
  review?: Pick<MarketplaceApprovalReview, 'status'>;
  inputIndex: number;
}

/**
 * Only a fully proved review may bypass the locked-coin acknowledgement. An authorization that
 * still carries a caution must ask, even when it comes from the site that created the lock.
 */
const proved = (review: LockedCoinSpendContext['review']): boolean =>
  review?.status === 'proved';

/** Whether signing this input may go ahead without the user unlocking `lock` first. */
export function lockedCoinSpendAllowed(lock: CoinLock, spend: LockedCoinSpendContext): boolean {
  if (lock.unlocked) return true;
  if (lock.manual || lock.kind === 'manual' || lock.origin !== spend.origin) return false;
  const { intent } = spend;
  // Spending the coin back to its owner is how the site ends offers it alone made on it. Its review
  // proved every input is a claimed funding coin, so the coin is one of them; another site's offer
  // sharing the coin would end too, and asks.
  if (intent?.action === 'invalidate_offers') return proved(spend.review) && !lock.sharedOrigins?.length;
  if (lock.kind !== 'offer_slot') return false;
  if (intent?.action !== 'authorize_exact_offer' || spend.inputIndex !== 0 || !proved(spend.review)) return false;
  const slot = intent.bitcoinInvalidation.outpoint;
  return `${slot.txid.toLowerCase()}:${slot.vout}` === lock.outpoint;
}

/** One PSBT or transaction of a request: what it spends, which inputs the wallet signs, and why. */
export interface LockCheckedItem {
  intent?: MarketplaceIntentClaimV1 | BumpAcceptanceFeeIntentClaim;
  review?: LockedCoinSpendContext['review'];
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
        if (!lock || lockedCoinSpendAllowed(lock, { origin, intent: item.intent, review: item.review, inputIndex })) continue;
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
 * user may mean it, and confirming unlocks the coins (providerSigningService.execute), unless
 * `releasedOnSpend`: then the coins stay locked until the spend confirms, which releases them.
 */
export function lockedCoinWarning(
  coins: readonly LockedCoinSpend[],
  { releasedOnSpend = false }: { releasedOnSpend?: boolean } = {},
): SecurityWarning | null {
  if (coins.length === 0) return null;
  const offers = coins.some(coin => coin.kind !== 'manual');
  return {
    severity: 'warning',
    code: 'locked_coin_spend',
    title: coins.length === 1 ? 'Spends a locked coin' : 'Spends locked coins',
    message: offers
      ? 'This spends a coin locked for your offer. Your offer will be cancelled when this confirms.'
      : 'This spends a coin you locked.',
    data: { coins: [...coins], ...(releasedOnSpend ? { releasedOnSpend: true as const } : {}) },
  };
}

/**
 * Whether a request's locked spends should leave the locks until the spend confirms. An offer
 * invalidation is handed back to the site to broadcast; if it never does, its offers live on, so
 * signing it must not free the coins (core/bitcoin/coinLockStore.ts releases them once spent).
 */
export const releasedOnSpend = (items: readonly LockCheckedItem[]): boolean =>
  items.length > 0 && items.every(item => item.intent?.action === 'invalidate_offers');

/** The coins a review's warnings would unlock on confirmation, by address. */
export function lockedCoinsToUnlock(warnings: readonly SecurityWarning[]): Map<string, string[]> {
  const byAddress = new Map<string, string[]>();
  for (const warning of warnings) {
    if (warning.code !== 'locked_coin_spend' || warning.data.releasedOnSpend) continue;
    for (const coin of warning.data.coins) {
      byAddress.set(coin.address, [...new Set([...(byAddress.get(coin.address) ?? []), coin.outpoint])]);
    }
  }
  return byAddress;
}
