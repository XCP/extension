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
import { formatAmount } from '@/core/format';
import { sum, toSafeInteger } from '@/core/numeric';
import { t } from '@/i18n';

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
  intent.action === 'prepare_asset' ? intent.utxoOwner : intent.seller;

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
      || !sameAddress(attach.utxoAddress, listing.seller)
      || attach.assets[0].asset !== listedAsset.asset
      || attach.assets[0].quantityRaw !== listedAsset.quantityRaw
      || attach.expectedAttachedOutpoint.txid !== listedAsset.sourceOutpoint.txid
      || attach.expectedAttachedOutpoint.vout !== listedAsset.sourceOutpoint.vout
      || attach.utxoValueSats !== listing.utxoValueSats
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

/** Whole-unit counts and satoshi amounts, in the language the wallet is read in. */
const count = (value: number): string => formatAmount({ value, maximumFractionDigits: 0 });

const sats = (value: number): string => t('marketplace_batch_sats', count(value));

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
    { kind: 'text' as const, label: t('marketplace_batch_transactions'), value: count(intents.length) },
    { kind: 'address' as const, label: t('marketplace_batch_seller_wallet'), value: seller },
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
    title = t('marketplace_batch_attach_and_list_asset', attach.assets[0].asset);
    if (status === 'proved' || status === 'caution') {
      summary = {
        outcome: {
          kind: 'amount', label: t('marketplace_batch_your_payout_if_sold'),
          value: sats(listing.guaranteedSellerPaymentSats), emphasis: 'primary',
        },
        action: title,
        amounts: [
          { kind: 'amount', label: t('marketplace_batch_listing_price'), value: sats(listing.priceSats) },
          { kind: 'amount', label: t('marketplace_batch_utxo_returned'), value: sats(listing.utxoValueSats) },
          { kind: 'amount', label: t('marketplace_batch_attach_fee'), value: sats(attach.networkFeeSats) },
          {
            kind: 'amount', label: t('marketplace_batch_xcp_fee_quote'),
            value: formatXcpRaw([attach.protocolFee.quotedAmountRaw]),
          },
        ],
        timing: t('marketplace_batch_attach_costs_are_paid_first'),
      };
    }
    facts.push(
      {
        kind: 'amount', label: t('marketplace_batch_your_payout_if_sold'),
        value: sats(listing.guaranteedSellerPaymentSats), emphasis: 'primary',
      },
      { kind: 'amount' as const, label: t('marketplace_batch_listing_price'), value: sats(listing.priceSats) },
      {
        kind: 'amount', label: t('marketplace_batch_your_utxo_sats_returned'),
        value: sats(listing.utxoValueSats), layout: 'stacked',
      },
      {
        kind: 'amount' as const, label: t('marketplace_batch_attach_network_fee'),
        value: sats(attach.networkFeeSats),
      },
      {
        kind: 'amount' as const, label: t('marketplace_batch_quoted_xcp_fee'),
        value: formatXcpRaw([attach.protocolFee.quotedAmountRaw]),
      },
      ...identityFacts,
      ...(sameAddress(attach.assetSource, attach.seller)
        ? []
        : [{ kind: 'address' as const, label: t('marketplace_batch_asset_source'), value: attach.assetSource }]),
      {
        kind: 'text' as const, label: t('marketplace_batch_broadcast_now'),
        value: t('marketplace_batch_attach_transaction_only'),
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_batch_listing_activation'),
        value: t('marketplace_batch_after_confirmation_and_counterparty'),
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_batch_signature_invalidation'),
        value: t('marketplace_batch_spend_the_attached_asset_utxo'),
      },
    );
    notice = t('marketplace_batch_the_attach_transaction_is_broadcast');
  } else if (kind === 'bulk-fanout') {
    const fanouts = intents as PrepareBulkFanoutIntentClaim[];
    const slots = exactSafeSum(fanouts.map(intent => intent.slotCount), 'slot count');
    const fees = exactSafeSum(fanouts.map(intent => intent.networkFeeSats), 'network fee');
    title = slots === 1
      ? t('marketplace_batch_create_1_listing_utxo')
      : t('marketplace_batch_create_listing_utxos', count(slots));
    facts.push(
      { kind: 'amount' as const, label: t('marketplace_batch_new_utxos'), value: count(slots) },
      { kind: 'amount' as const, label: t('marketplace_batch_total_network_fees'), value: sats(fees) },
    );
    notice = t('marketplace_batch_every_fan_out_input_and');
  } else if (kind === 'bulk-attach' || kind === 'prepare-assets') {
    const attaches = intents as Array<AttachForListingIntentClaim | PrepareAssetIntentClaim>;
    const fees = exactSafeSum(attaches.map(intent => intent.networkFeeSats), 'network fee');
    title = kind !== 'prepare-assets'
      ? t('marketplace_batch_attach_collectibles_for_listing', count(attaches.length))
      : attaches.length === 1
        ? t('marketplace_batch_prepare_1_collectible')
        : t('marketplace_batch_prepare_collectibles', count(attaches.length));
    facts.push(
      { kind: 'amount' as const, label: t('marketplace_batch_total_network_fees'), value: sats(fees) },
      {
        kind: 'amount' as const, label: t('marketplace_batch_total_quoted_xcp_fees'),
        value: formatXcpRaw(attaches.map(intent => intent.protocolFee.quotedAmountRaw)),
      },
    );
    notice = t('marketplace_batch_every_attach_proves_its_source');
  } else {
    const listings = intents as CreateListingIntentClaim[];
    const gross = exactSafeSum(listings.map(intent => intent.priceSats), 'listing prices');
    const returned = exactSafeSum(listings.map(intent => intent.utxoValueSats), 'asset UTXO values');
    const payouts = exactSafeSum(listings.map(intent => intent.guaranteedSellerPaymentSats), 'seller payouts');
    // A batch where every item replaces an existing authorization is a reprice, and saying
    // "listings" would describe it as putting new items up for sale. Mixed batches stay generic.
    const allReprice = listings.every(intent => intent.listingContext?.mode === 'reprice');
    title = !allReprice
      ? t('marketplace_batch_authorize_marketplace_listings', count(listings.length))
      : listings.length === 1
        ? t('marketplace_batch_authorize_1_listing_reprice')
        : t('marketplace_batch_authorize_listing_reprices', count(listings.length));
    // Proved reviews speak through facts, not notices, so the durable-signature boundary has to
    // live here — the same rows the single-listing screen shows.
    facts.push(
      { kind: 'amount' as const, label: t('marketplace_batch_combined_asking_prices'), value: sats(gross) },
      {
        kind: 'amount', label: t('marketplace_batch_your_utxo_sats_returned'), value: sats(returned),
      },
      {
        kind: 'amount', label: t('marketplace_batch_your_payout_if_all_sell'),
        value: sats(payouts), emphasis: 'primary',
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_batch_buyer_controls'),
        value: t('marketplace_batch_funding_fees_and_delivery_destination'),
      },
      {
        kind: 'text' as const, label: t('marketplace_batch_broadcast'),
        value: t('marketplace_batch_not_broadcast_now'),
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_batch_signature_invalidation'),
        value: t('marketplace_batch_spend_each_attached_asset_utxo'),
      },
    );
    notice = t('marketplace_batch_every_listing_independently_guarantees_its');
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
