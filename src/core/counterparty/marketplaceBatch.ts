/** Homogeneous multi-PSBT marketplace phases. Every item proves independently first. */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { MarketplaceBundleReview } from '@/core/counterparty/marketplaceBundleReview';
import {
  type AttachForListingIntentClaim,
  type CreateListingIntentClaim,
  type MarketplaceApprovalReview,
  type PrepareAssetIntentClaim,
  type PrepareBulkFanoutIntentClaim,
  parseMarketplaceIntent,
} from '@/core/counterparty/marketplaceIntent';
import { sum, toSafeInteger } from '@/core/numeric';

export type MarketplaceBatchIntent =
  | PrepareBulkFanoutIntentClaim
  | PrepareAssetIntentClaim
  | AttachForListingIntentClaim
  | CreateListingIntentClaim;

export type MarketplaceBatchKind =
  | 'attach-and-list'
  | 'bulk-fanout'
  | 'prepare-assets'
  | 'bulk-attach'
  | 'bulk-listing';

const sameAddress = (left: string, right: string): boolean =>
  normalizeAddressForComparison(left) === normalizeAddressForComparison(right);

const batchIdentity = (intent: MarketplaceBatchIntent): string =>
  intent.action === 'prepare_asset' ? intent.carrierOwner : intent.seller;

/** Parse an untrusted request array and admit only bounded homogeneous signing phases. */
export function parseMarketplaceBatchIntents(values: unknown[]): {
  kind: MarketplaceBatchKind;
  intents: MarketplaceBatchIntent[];
} {
  if (values.length < 1 || values.length > 8) {
    throw new Error('marketplace batch must contain 1..8 requests');
  }
  const parsed = values.map(parseMarketplaceIntent);
  if (
    parsed.length === 2
    && parsed[0]!.action === 'attach_for_listing'
    && parsed[1]!.action === 'create_listing'
  ) {
    const attach = parsed[0] as AttachForListingIntentClaim;
    const listing = parsed[1] as CreateListingIntentClaim;
    const listedAsset = listing.assets[0];
    if (
      attach.operationId !== listing.operationId
      || !sameAddress(attach.seller, listing.seller)
      || !sameAddress(attach.carrierAddress, listing.seller)
      || attach.assets[0].asset !== listedAsset.asset
      || attach.assets[0].quantityRaw !== listedAsset.quantityRaw
      || attach.expectedAttachedOutpoint.txid !== listedAsset.sourceOutpoint.txid
      || attach.expectedAttachedOutpoint.vout !== listedAsset.sourceOutpoint.vout
      || attach.carrierValueSats !== listing.carrierValueSats
      || listing.listingContext !== undefined
    ) {
      throw new Error('attach-and-list requests do not describe one dependent listing');
    }
    return { kind: 'attach-and-list', intents: [attach, listing] };
  }
  const action = parsed[0]!.action;
  if (!parsed.every(intent => intent.action === action)) {
    throw new Error('marketplace batch requests must use one semantic action');
  }
  if (!['prepare_bulk_fanout', 'prepare_asset', 'attach_for_listing', 'create_listing'].includes(action)) {
    throw new Error('marketplace action is not supported in a multi-PSBT phase');
  }
  const intents = parsed as MarketplaceBatchIntent[];
  const seller = batchIdentity(intents[0]!);
  if (!intents.every(intent => sameAddress(batchIdentity(intent), seller))) {
    throw new Error('marketplace batch requests must use one seller identity');
  }
  if (new Set(intents.map(intent => intent.operationId)).size !== intents.length) {
    if (action !== 'prepare_bulk_fanout' && action !== 'prepare_asset') {
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
    // Resuming filters out completed parents while preserving their original indices. Each
    // remaining parent proves independently, so gaps do not imply a missing dependency.
    if (fanouts.some((intent, index) => index > 0 && intent.batchIndex <= fanouts[index - 1]!.batchIndex)) {
      throw new Error('bulk fan-out batch indices must be unique and ordered');
    }
    if (new Set(fanouts.map(intent => intent.fundingOutpoint.txid + ':' + intent.fundingOutpoint.vout)).size
      !== fanouts.length) {
      throw new Error('bulk fan-out parents must spend distinct funding outpoints');
    }
    return { kind: 'bulk-fanout', intents: fanouts };
  }
  if (action === 'prepare_asset') {
    const prepares = intents as PrepareAssetIntentClaim[];
    const operationId = prepares[0]!.operationId;
    const assetSource = prepares[0]!.assetSource;
    if (!prepares.every(intent =>
      intent.operationId === operationId
      && sameAddress(intent.assetSource, assetSource)
    )) {
      throw new Error('prepare-assets requests must belong to one operation and asset source');
    }
  }
  const semanticTargets = action === 'attach_for_listing' || action === 'prepare_asset'
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
    kind: action === 'prepare_asset'
      ? 'prepare-assets'
      : action === 'attach_for_listing' ? 'bulk-attach' : 'bulk-listing',
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
): MarketplaceBundleReview {
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
  const seller = batchIdentity(intents[0]!);
  const identityFacts: MarketplaceApprovalReview['facts'] = [
    { kind: 'text' as const, label: 'Transactions', value: intents.length.toLocaleString() },
    { kind: 'address' as const, label: 'Seller wallet', value: seller },
  ];
  const facts: MarketplaceApprovalReview['facts'] = kind === 'attach-and-list' ? [] : [...identityFacts];
  let title: string;
  let notice: string;
  let summary: MarketplaceBundleReview['bundleSummary'];

  if (kind === 'attach-and-list') {
    const [attach, listing] = intents as [
      AttachForListingIntentClaim,
      CreateListingIntentClaim,
    ];
    title = `Attach and list ${attach.assets[0].asset}`;
    if (status === 'proved' || status === 'caution') {
      summary = {
        outcome: {
          kind: 'amount', label: 'Your payout if sold',
          value: `${listing.guaranteedSellerPaymentSats.toLocaleString()} sats`, emphasis: 'primary',
        },
        action: title,
        amounts: [
          { kind: 'amount', label: 'Listing price', value: `${listing.priceSats.toLocaleString()} sats` },
          { kind: 'amount', label: 'UTXO returned', value: `${listing.carrierValueSats.toLocaleString()} sats` },
          { kind: 'amount', label: 'Attach fee', value: `${attach.networkFeeSats.toLocaleString()} sats` },
          { kind: 'amount', label: 'XCP fee quote', value: formatXcpRaw([attach.protocolFee.quotedAmountRaw]) },
        ],
        timing: 'Attach costs are paid first; payout requires a sale. The XCP fee may change at confirmation.',
      };
    }
    facts.push(
      { kind: 'amount', label: 'Your payout if sold', value: `${listing.guaranteedSellerPaymentSats.toLocaleString()} sats`, emphasis: 'primary' },
      { kind: 'amount' as const, label: 'Listing price', value: `${listing.priceSats.toLocaleString()} sats` },
      {
        kind: 'amount', label: 'Your UTXO sats returned',
        value: `${listing.carrierValueSats.toLocaleString()} sats`, layout: 'stacked',
      },
      { kind: 'amount' as const, label: 'Attach network fee', value: `${attach.networkFeeSats.toLocaleString()} sats` },
      { kind: 'amount' as const, label: 'Quoted XCP fee', value: formatXcpRaw([attach.protocolFee.quotedAmountRaw]) },
      ...identityFacts,
      ...(sameAddress(attach.assetSource, attach.seller)
        ? []
        : [{ kind: 'address' as const, label: 'Asset source', value: attach.assetSource }]),
      { kind: 'text' as const, label: 'Broadcast now', value: 'Attach transaction only' },
      { kind: 'paragraph' as const, label: 'Listing activation', value: 'After confirmation and Counterparty verification' },
      { kind: 'paragraph' as const, label: 'Signature invalidation', value: 'Spend the attached asset UTXO' },
    );
    notice = 'The attach transaction is broadcast first. The listing becomes available after confirmation and independent verification of the attached asset.';
  } else if (kind === 'bulk-fanout') {
    const fanouts = intents as PrepareBulkFanoutIntentClaim[];
    const slots = exactSafeSum(fanouts.map(intent => intent.slotCount), 'slot count');
    const fees = exactSafeSum(fanouts.map(intent => intent.networkFeeSats), 'network fee');
    title = `Create ${slots} listing UTXO${slots === 1 ? '' : 's'}`;
    facts.push(
      { kind: 'amount' as const, label: 'New UTXOs', value: slots.toLocaleString() },
      { kind: 'amount' as const, label: 'Total network fees', value: `${fees.toLocaleString()} sats` },
    );
    notice = 'Every fan-out input and same-wallet output was proved before this batch can sign. No Counterparty asset moves in this phase.';
  } else if (kind === 'bulk-attach' || kind === 'prepare-assets') {
    const attaches = intents as Array<AttachForListingIntentClaim | PrepareAssetIntentClaim>;
    const fees = exactSafeSum(attaches.map(intent => intent.networkFeeSats), 'network fee');
    title = kind === 'prepare-assets'
      ? `Prepare ${attaches.length} collectible${attaches.length === 1 ? '' : 's'}`
      : `Attach ${attaches.length} collectibles for listing`;
    facts.push(
      { kind: 'amount' as const, label: 'Total network fees', value: `${fees.toLocaleString()} sats` },
      {
        kind: 'amount' as const, label: 'Total quoted XCP fees',
        value: formatXcpRaw(attaches.map(intent => intent.protocolFee.quotedAmountRaw)),
      },
    );
    notice = 'Every attach proves its source, clean funding, new UTXO, miner fee, and local Counterparty message. XCP fees remain block-dependent until confirmation.';
  } else {
    const listings = intents as CreateListingIntentClaim[];
    const gross = exactSafeSum(listings.map(intent => intent.priceSats), 'listing prices');
    const returned = exactSafeSum(listings.map(intent => intent.carrierValueSats), 'asset UTXO values');
    const payouts = exactSafeSum(listings.map(intent => intent.guaranteedSellerPaymentSats), 'seller payouts');
    // A batch where every item replaces an existing authorization is a reprice, and saying
    // "listings" would describe it as putting new items up for sale. Mixed batches stay generic.
    const allReprice = listings.every(intent => intent.listingContext?.mode === 'reprice');
    title = allReprice
      ? `Authorize ${listings.length} listing reprice${listings.length === 1 ? '' : 's'}`
      : `Authorize ${listings.length} marketplace listings`;
    // Proved reviews speak through facts, not notices, so the durable-signature boundary has to
    // live here — the same rows the single-listing screen shows.
    facts.push(
      { kind: 'amount' as const, label: 'Combined asking prices', value: `${gross.toLocaleString()} sats` },
      {
        kind: 'amount', label: 'Your UTXO sats returned', value: `${returned.toLocaleString()} sats`,
      },
      { kind: 'amount', label: 'Your payout if all sell', value: `${payouts.toLocaleString()} sats`, emphasis: 'primary' },
      { kind: 'paragraph' as const, label: 'Buyer controls', value: 'Funding, fees, and delivery destination' },
      { kind: 'text' as const, label: 'Broadcast', value: 'Not broadcast now.' },
      { kind: 'paragraph' as const, label: 'Signature invalidation', value: 'Spend each attached asset UTXO' },
    );
    notice = 'Every listing independently guarantees its seller payment. Each flexible signature remains valid until its attached asset outpoint is spent.';
  }

  return {
    status,
    family: 'marketplace_batch',
    title,
    ...(summary ? { bundleSummary: summary } : {}),
    facts,
    notices: blockers.length > 0 ? [] : [{ severity: status === 'caution' ? 'warning' : 'info', message: notice }],
    blockers,
  };
}
