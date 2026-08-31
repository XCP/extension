/** Homogeneous multi-PSBT marketplace phases. Every item proves independently first. */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import {
  type AttachForListingIntentClaim,
  type CreateListingIntentClaim,
  type MarketplaceApprovalReview,
  type PrepareBulkFanoutIntentClaim,
  parseMarketplaceIntent,
} from '@/core/counterparty/marketplaceIntent';
import { sum, toSafeInteger } from '@/core/numeric';

export type MarketplaceBatchIntent =
  | PrepareBulkFanoutIntentClaim
  | AttachForListingIntentClaim
  | CreateListingIntentClaim;

export type MarketplaceBatchKind = 'bulk-fanout' | 'bulk-attach' | 'bulk-listing';

const sameAddress = (left: string, right: string): boolean =>
  normalizeAddressForComparison(left) === normalizeAddressForComparison(right);

/** Parse an untrusted request array and admit only bounded homogeneous signing phases. */
export function parseMarketplaceBatchIntents(values: unknown[]): {
  kind: MarketplaceBatchKind;
  intents: MarketplaceBatchIntent[];
} {
  if (values.length < 1 || values.length > 8) {
    throw new Error('marketplace batch must contain 1..8 requests');
  }
  const parsed = values.map(parseMarketplaceIntent);
  const action = parsed[0]!.action;
  if (!parsed.every(intent => intent.action === action)) {
    throw new Error('marketplace batch requests must use one semantic action');
  }
  if (!['prepare_bulk_fanout', 'attach_for_listing', 'create_listing'].includes(action)) {
    throw new Error('marketplace action is not supported in a multi-PSBT phase');
  }
  const intents = parsed as MarketplaceBatchIntent[];
  const seller = intents[0]!.seller;
  if (!intents.every(intent => sameAddress(intent.seller, seller))) {
    throw new Error('marketplace batch requests must use one seller identity');
  }
  if (new Set(intents.map(intent => intent.operationId)).size !== intents.length) {
    if (action !== 'prepare_bulk_fanout') {
      throw new Error('marketplace batch contains a duplicate operation id');
    }
  }

  if (action === 'prepare_bulk_fanout') {
    if (intents.length > 5) throw new Error('bulk fan-out phase supports at most 5 parents');
    const fanouts = intents as PrepareBulkFanoutIntentClaim[];
    const operationId = fanouts[0]!.operationId;
    if (!fanouts.every(intent => intent.operationId === operationId)) {
      throw new Error('bulk fan-out parents must belong to one operation');
    }
    if (fanouts.some((intent, index) => intent.batchIndex !== index)) {
      throw new Error('bulk fan-out batch indices must be ordered from zero');
    }
    if (new Set(fanouts.map(intent => intent.fundingOutpoint.txid + ':' + intent.fundingOutpoint.vout)).size
      !== fanouts.length) {
      throw new Error('bulk fan-out parents must spend distinct funding outpoints');
    }
    return { kind: 'bulk-fanout', intents: fanouts };
  }
  const semanticTargets = action === 'attach_for_listing'
    ? (intents as AttachForListingIntentClaim[]).map(intent =>
        `${intent.expectedAttachedOutpoint.txid}:${intent.expectedAttachedOutpoint.vout}`)
    : (intents as CreateListingIntentClaim[]).map(intent => {
        const target = intent.assets[0].sourceOutpoint;
        return `${target.txid}:${target.vout}`;
      });
  if (new Set(semanticTargets).size !== semanticTargets.length) {
    throw new Error('marketplace batch contains a duplicate transaction target');
  }
  return {
    kind: action === 'attach_for_listing' ? 'bulk-attach' : 'bulk-listing',
    intents,
  };
}

const exactSafeSum = (values: number[], label: string): number => {
  const total = toSafeInteger(sum(values).toFixed(0));
  if (total === undefined) throw new Error(`${label} exceeds the safe integer range`);
  return total;
};

const formatXcpRaw = (values: string[]): string => {
  const raw = sum(values).toFixed(0);
  const padded = raw.padStart(9, '0');
  const whole = padded.slice(0, -8);
  const fraction = padded.slice(-8).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction} XCP` : `${whole} XCP`;
};

/** Aggregate already-independent item proofs without weakening any item status. */
export function analyzeMarketplaceBatch(
  kind: MarketplaceBatchKind,
  intents: MarketplaceBatchIntent[],
  reviews: MarketplaceApprovalReview[],
): MarketplaceApprovalReview {
  if (intents.length !== reviews.length || intents.length < 1) {
    throw new Error('marketplace batch proof count does not match its intents');
  }
  const blockers = reviews.flatMap((review, index) =>
    review.blockers.map(problem => `item ${index + 1}: ${problem}`));
  const status = reviews.some(review => review.status === 'blocked')
    ? 'blocked'
    : reviews.some(review => review.status === 'retry')
      ? 'retry'
      : reviews.some(review => review.status === 'caution')
        ? 'caution'
        : 'proved';
  const seller = intents[0]!.seller;
  const facts: MarketplaceApprovalReview['facts'] = [
    { label: 'Transactions', value: intents.length.toLocaleString() },
    { label: 'Seller wallet', value: seller },
  ];
  let title: string;
  let notice: string;

  if (kind === 'bulk-fanout') {
    const fanouts = intents as PrepareBulkFanoutIntentClaim[];
    const slots = exactSafeSum(fanouts.map(intent => intent.slotCount), 'slot count');
    const fees = exactSafeSum(fanouts.map(intent => intent.networkFeeSats), 'network fee');
    title = `Create ${slots} listing UTXO${slots === 1 ? '' : 's'}`;
    facts.push(
      { label: 'New UTXOs', value: slots.toLocaleString() },
      { label: 'Total network fees', value: `${fees.toLocaleString()} sats` },
    );
    notice = 'Every fan-out input and same-wallet output was proved before this batch can sign. No Counterparty asset moves in this phase.';
  } else if (kind === 'bulk-attach') {
    const attaches = intents as AttachForListingIntentClaim[];
    const fees = exactSafeSum(attaches.map(intent => intent.networkFeeSats), 'network fee');
    title = `Attach ${attaches.length} collectibles for listing`;
    facts.push(
      { label: 'Total network fees', value: `${fees.toLocaleString()} sats` },
      {
        label: 'Total quoted XCP fees',
        value: formatXcpRaw(attaches.map(intent => intent.protocolFee.quotedAmountRaw)),
      },
    );
    notice = 'Every attach proves its source, clean funding, new UTXO, miner fee, and local Counterparty message. XCP fees remain block-dependent until confirmation.';
  } else {
    const listings = intents as CreateListingIntentClaim[];
    const gross = exactSafeSum(listings.map(intent => intent.priceSats), 'listing prices');
    // A batch where every item replaces an existing authorization is a reprice, and saying
    // "listings" would describe it as putting new items up for sale. Mixed batches stay generic.
    const allReprice = listings.every(intent => intent.listingContext?.mode === 'reprice');
    title = allReprice
      ? `Authorize ${listings.length} listing reprice${listings.length === 1 ? '' : 's'}`
      : `Authorize ${listings.length} marketplace listings`;
    // Proved reviews speak through facts, not notices, so the durable-signature boundary has to
    // live here — the same rows the single-listing screen shows.
    facts.push(
      { label: 'Combined asking prices', value: `${gross.toLocaleString()} sats` },
      { label: 'Buyer controls', value: 'Funding, fees, and detach destination' },
      { label: 'Broadcast now', value: 'None' },
      { label: 'Signature invalidation', value: 'Spend each attached asset UTXO' },
    );
    notice = 'Every listing independently guarantees its seller payment. Each flexible signature remains valid until its attached asset outpoint is spent.';
  }

  return {
    status,
    family: 'marketplace_batch',
    title,
    facts,
    notices: blockers.length > 0 ? [] : [{ severity: status === 'caution' ? 'warning' : 'info', message: notice }],
    blockers,
  };
}
