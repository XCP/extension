/**
 * The coins an offer signature commits, as the wallet proves them from what it just signed.
 *
 * Three intents commit coins that must stay unspent for the offer to live:
 *
 * - `fund_offers` sets aside exact-offer slots: outputs 0..slotCount-1 of the funding transaction,
 *   paid back to the bidder. The funding is not broadcast yet, so the slots are named by the
 *   unsigned transaction's id, which is final only when no input carries a scriptSig (every input
 *   SegWit or Taproot); otherwise nothing is locked.
 * - `authorize_exact_offer` pre-signs a spend of one slot as input 0; spending that slot is what
 *   cancels the offer (`bitcoinInvalidation`). The slot gains the authorization's id.
 * - `fund_policy_offer` signs a parent that spends the bidder's funding coins; the collection offer
 *   lives until any of them is spent.
 *
 * Intent fields only say which rule applies and what to call the offer. Every coin locked is one
 * the PSBT shows paying, or being signed by, an address of this wallet, and only an item whose
 * marketplace review proved (or passed with routine caution) locks anything. The optional
 * `commitments` hint adds offer ids and expiry to such a coin and nothing else.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { OfferCoinCommitment } from '@/core/bitcoin/coinLocks';
import type { DecodedInput, DecodedOutput } from '@/core/bitcoin/psbt';
import type {
  MarketplaceApprovalReview,
  MarketplaceCoinCommitmentClaim,
  MarketplaceIntentClaimV1,
} from '@/core/counterparty/marketplace/intentTypes';
import type { BumpAcceptanceFeeIntentClaim } from '@/core/counterparty/marketplaceBundle';

/** One PSBT the wallet signed, with what its review established. */
export interface SignedOfferItem {
  intent?: MarketplaceIntentClaimV1 | BumpAcceptanceFeeIntentClaim;
  /** Unsigned transaction id, computed locally from the PSBT. */
  transactionId: string;
  inputs: readonly DecodedInput[];
  outputs: readonly DecodedOutput[];
  /** The inputs the wallet signed, by signer address. */
  signInputs: Record<string, number[]>;
  review?: Pick<MarketplaceApprovalReview, 'status'>;
}

export interface OfferCoinLockContext {
  /** The requesting site's origin, as the provider verified it from the sender. */
  origin: string;
  /** This wallet's addresses that may own a committed coin. */
  ownedAddresses: readonly string[];
}

/** A commitment and the address whose lock it becomes. */
export interface AddressedCommitment {
  address: string;
  commitment: OfferCoinCommitment;
}

/** Input script types whose signatures leave the unsigned transaction id unchanged. */
const WITNESS_ONLY = new Set(['p2wpkh', 'p2tr']);

const later = (left: number | null, right: number | null): number | null =>
  left === null ? right : right === null ? left : Math.max(left, right);

/** Offer ids and expiry the intent's `commitments` hint gives a coin the wallet proved. */
function withHint(commitment: OfferCoinCommitment, hints: readonly MarketplaceCoinCommitmentClaim[]): OfferCoinCommitment {
  const hint = hints.filter(entry => `${entry.outpoint.txid}:${entry.outpoint.vout}` === commitment.outpoint);
  if (hint.length === 0) return commitment;
  return {
    ...commitment,
    refs: [...new Set([...commitment.refs, ...hint.flatMap(entry => entry.offerIds)])],
    expiresAt: hint.reduce((expiry, entry) => later(expiry, entry.expiresAt), commitment.expiresAt),
  };
}

function itemCommitments(item: SignedOfferItem, context: OfferCoinLockContext): AddressedCommitment[] {
  const { intent } = item;
  if (!intent || (item.review?.status !== 'proved' && item.review?.status !== 'caution')) return [];
  const owned = new Set(context.ownedAddresses.map(normalizeAddressForComparison));
  const ownedAddress = (address: string | undefined) =>
    address && owned.has(normalizeAddressForComparison(address)) ? normalizeAddressForComparison(address) : null;
  const signed = new Set(Object.values(item.signInputs).flat());
  const txid = item.transactionId.toLowerCase();
  const found: AddressedCommitment[] = [];

  if (intent.action === 'fund_offers') {
    if (!/^[0-9a-f]{64}$/.test(txid) || !item.inputs.every(input => input.scriptType && WITNESS_ONLY.has(input.scriptType))) {
      return [];
    }
    for (let vout = 0; vout < intent.slotCount; vout += 1) {
      const output = item.outputs[vout];
      const address = output && output.type !== 'op_return' ? ownedAddress(output.address) : null;
      if (!output || !address) continue;
      found.push({ address, commitment: {
        outpoint: `${txid}:${vout}`, kind: 'offer_slot', refs: [], valueSats: output.value,
        origin: context.origin, expiresAt: intent.marketplaceExpiresAt,
      } });
    }
  } else if (intent.action === 'authorize_exact_offer') {
    const slot = item.inputs[0];
    const invalidation = intent.bitcoinInvalidation.outpoint;
    const address = slot && signed.has(0) ? ownedAddress(slot.address) : null;
    if (slot && address && slot.txid.toLowerCase() === invalidation.txid.toLowerCase() && slot.vout === invalidation.vout) {
      found.push({ address, commitment: {
        outpoint: `${slot.txid.toLowerCase()}:${slot.vout}`, kind: 'offer_slot', refs: [intent.authorizationId],
        valueSats: slot.value ?? 0, origin: context.origin, expiresAt: intent.marketplaceExpiresAt,
      } });
    }
  } else if (intent.action === 'fund_policy_offer') {
    const expiresAt = intent.alternatives.reduce<number | null>((expiry, alternative) => later(expiry, alternative.expiresAt), null);
    for (let index = 0; index < intent.fundingInputs.length; index += 1) {
      const input = item.inputs[index];
      const address = input && signed.has(index) ? ownedAddress(input.address) : null;
      if (!input || !address) continue;
      found.push({ address, commitment: {
        outpoint: `${input.txid.toLowerCase()}:${input.vout}`, kind: 'collection_offer', refs: [intent.operationId],
        valueSats: input.value ?? 0, origin: context.origin, expiresAt,
      } });
    }
  }
  const hints = 'commitments' in intent ? intent.commitments ?? [] : [];
  return found.map(entry => ({ ...entry, commitment: withHint(entry.commitment, hints) }));
}

/**
 * Every coin the signed items commit, one per coin: a fund-and-authorize bundle's slot appears once
 * with the ids of the offers authorized on it, and a policy offer's alternatives, which all spend
 * the same funding, lock each coin once.
 */
export function offerCoinCommitments(items: readonly SignedOfferItem[], context: OfferCoinLockContext): AddressedCommitment[] {
  const byCoin = new Map<string, AddressedCommitment>();
  for (const entry of items.flatMap(item => itemCommitments(item, context))) {
    const key = `${entry.address} ${entry.commitment.outpoint}`;
    const existing = byCoin.get(key);
    byCoin.set(key, existing ? { ...existing, commitment: {
      ...existing.commitment,
      refs: [...new Set([...existing.commitment.refs, ...entry.commitment.refs])],
      valueSats: existing.commitment.valueSats || entry.commitment.valueSats,
      expiresAt: later(existing.commitment.expiresAt, entry.commitment.expiresAt),
    } } : entry);
  }
  return [...byCoin.values()];
}
