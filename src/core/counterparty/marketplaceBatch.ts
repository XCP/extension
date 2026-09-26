/** Homogeneous multi-PSBT marketplace phases. Every item proves independently first. */

import { sameAddress } from '@/core/bitcoin/address';
import { formatXcpRaw, grouped, satsValue } from '@/core/counterparty/marketplace/format';
import type { MarketplaceBundleReview } from '@/core/counterparty/marketplaceBundleReview';
import {
  type AttachForListingIntentClaim,
  type AuthorizeExactOfferIntentClaim,
  type CreateListingIntentClaim,
  describeCanonicalPolicy,
  type FundPolicyOfferIntentClaim,
  formatExpiry,
  type MarketplaceApprovalReview,
  type PolicyOfferWalletContext,
  type PrepareAssetIntentClaim,
  type PrepareBulkFanoutIntentClaim,
  parseMarketplaceIntent,
  policyOfferStandingNotice,
} from '@/core/counterparty/marketplaceIntent';
import { MAX_POLICY_ALTERNATIVES } from '@/core/counterparty/policyOffer';
import { isRecord } from '@/core/isRecord';
import { sum, toSafeInteger } from '@/core/numeric';
import { t } from '@/i18n';

export type MarketplaceBatchIntent =
  | PrepareBulkFanoutIntentClaim
  | PrepareAssetIntentClaim
  | AttachForListingIntentClaim
  | CreateListingIntentClaim
  | AuthorizeExactOfferIntentClaim
  | FundPolicyOfferIntentClaim;

export type MarketplaceBatchKind =
  | 'attach-and-list'
  | 'bulk-fanout'
  | 'prepare-assets'
  | 'bulk-attach'
  | 'bulk-listing'
  | 'authorize-offers'
  | 'fund-policy-offer';

/** Every linked phase but a policy-offer funding set, whose alternatives may number 1..100. */
export const MAX_MARKETPLACE_BATCH_REQUESTS = 8;

/** How many requests one phase of this kind may carry. */
export const maxMarketplaceBatchRequests = (kind: string): number =>
  kind === 'fund-policy-offer' ? MAX_POLICY_ALTERNATIVES : MAX_MARKETPLACE_BATCH_REQUESTS;

const batchIdentity = (intent: MarketplaceBatchIntent): string =>
  intent.action === 'prepare_asset'
    ? intent.utxoOwner
    : intent.action === 'authorize_exact_offer' || intent.action === 'fund_policy_offer'
      ? intent.bidder
      : intent.seller;

const outpointKey = (outpoint: { txid: string; vout: number }): string =>
  `${outpoint.txid}:${outpoint.vout}`;

const sameDelivery = (
  left: AuthorizeExactOfferIntentClaim['delivery'],
  right: AuthorizeExactOfferIntentClaim['delivery'],
): boolean =>
  left.mode === right.mode
  && sameAddress(left.address, right.address)
  && (left.mode === 'detached' || (right.mode === 'attached' && left.utxoValueSats === right.utxoValueSats));

/**
 * Several exact targets backed by one bidder funding outpoint. Every item spends the same input 0,
 * so the signatures are mutually exclusive by construction: the first one a seller completes
 * spends the funding UTXO and invalidates every sibling. Each item still proves on its own bytes
 * (only input 0, ALL, never 0x83); this admits only the shared economic terms the review
 * summarizes once, and refuses a batch whose items could not all be that same offer.
 */
function parseAuthorizeOffers(offers: AuthorizeExactOfferIntentClaim[]): AuthorizeExactOfferIntentClaim[] {
  const first = offers[0]!;
  const funding = outpointKey(first.bitcoinInvalidation.outpoint);
  for (const offer of offers) {
    if (!sameAddress(offer.bidder, first.bidder)) {
      throw new Error('exact-offer authorizations must share one bidder');
    }
    if (outpointKey(offer.bitcoinInvalidation.outpoint) !== funding) {
      throw new Error('exact-offer authorizations must share one funding outpoint');
    }
    if (!sameDelivery(offer.delivery, first.delivery)) {
      throw new Error('exact-offer authorizations must share one delivery');
    }
    if (offer.priceSats !== first.priceSats || offer.platformFeeSats !== first.platformFeeSats) {
      throw new Error('exact-offer authorizations must share one price and platform fee');
    }
  }
  if (new Set(offers.map(offer => offer.authorizationId)).size !== offers.length) {
    throw new Error('exact-offer batch contains a duplicate authorization id');
  }
  if (new Set(offers.map(offer => offer.operationId)).size !== offers.length) {
    throw new Error('marketplace batch contains a duplicate operation id');
  }
  const targets = offers.map(offer => outpointKey(offer.assets[0].sourceOutpoint));
  if (new Set(targets).size !== targets.length) {
    throw new Error('exact-offer batch contains a duplicate target outpoint');
  }
  if (targets.includes(funding)) {
    throw new Error('exact-offer target cannot be its own funding outpoint');
  }
  if (new Set(offers.map(offer => offer.expectedTxid)).size !== offers.length) {
    throw new Error('exact-offer batch contains a duplicate transaction');
  }
  return offers;
}

/**
 * The alternatives of one policy-offer funding set, one request per parent (spec §7.1).
 *
 * Every alternative spends the identical funding inputs and anchor, so at most one can ever be
 * mined: the requests are admitted only when they share every term but the alternative itself.
 * Two wire forms are accepted and normalized to one alternative per item. In the reference form
 * each request repeats the complete claim and request i signs alternative i; that repetition grows
 * with the square of the count and passes the wallet's 1 MB request limit near 30 alternatives. In
 * the compact form each request carries the shared claim with only its own alternative, which
 * scales to the protocol's 100.
 */
function parseFundPolicyOffers(parsed: FundPolicyOfferIntentClaim[]): FundPolicyOfferIntentClaim[] {
  const first = parsed[0]!;
  const count = parsed.length;
  const shared = (claim: FundPolicyOfferIntentClaim): string => JSON.stringify([
    claim.operationId, claim.bidder, claim.internalKey, claim.marketKey, claim.delivery,
    claim.fundingInputs, claim.anchor, claim.marketplaceFee,
  ]);
  const sharedTerms = shared(first);
  const completeForm = count > 1 && first.alternatives.length === count;
  const completeList = JSON.stringify(first.alternatives);
  const items = parsed.map((claim, index) => {
    if (shared(claim) !== sharedTerms) {
      throw new Error('policy-offer alternatives must share one bidder, keys, delivery, funding set, and anchor');
    }
    if (completeForm) {
      if (JSON.stringify(claim.alternatives) !== completeList) {
        throw new Error('policy-offer requests describe different alternative lists');
      }
      return { ...claim, alternatives: [claim.alternatives[index]!] };
    }
    if (claim.alternatives.length !== 1) {
      throw new Error('each policy-offer request must carry its own alternative or the complete list');
    }
    return claim;
  });
  const parents = items.map(item => item.alternatives[0]!.expectedParentTxid);
  if (new Set(parents).size !== parents.length) {
    throw new Error('policy-offer batch contains a duplicate parent transaction');
  }
  return items;
}

/** Parse an untrusted request array and admit only bounded homogeneous signing phases. */
export function parseMarketplaceBatchIntents(values: unknown[]): {
  kind: MarketplaceBatchKind;
  intents: MarketplaceBatchIntent[];
} {
  const head = values[0];
  const policyOffers = isRecord(head) && head.action === 'fund_policy_offer';
  const limit = policyOffers ? MAX_POLICY_ALTERNATIVES : MAX_MARKETPLACE_BATCH_REQUESTS;
  if (values.length < 1 || values.length > limit) {
    throw new Error(`marketplace batch must contain 1..${limit} requests`);
  }
  const parsed = values.map(parseMarketplaceIntent);
  if (policyOffers) {
    if (!parsed.every(intent => intent.action === 'fund_policy_offer')) {
      throw new Error('marketplace batch requests must use one semantic action');
    }
    return {
      kind: 'fund-policy-offer',
      intents: parseFundPolicyOffers(parsed as FundPolicyOfferIntentClaim[]),
    };
  }
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
  if (action === 'authorize_exact_offer') {
    return {
      kind: 'authorize-offers',
      intents: parseAuthorizeOffers(parsed as AuthorizeExactOfferIntentClaim[]),
    };
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

/** The total of raw XCP fee quotes, as XCP. */
const xcpTotal = (values: string[]): string => formatXcpRaw(sum(values).toFixed(0));

/** Aggregate already-independent item proofs without weakening any item status. */
export function analyzeMarketplaceBatch(
  kind: MarketplaceBatchKind,
  intents: MarketplaceBatchIntent[],
  reviews: MarketplaceApprovalReview[],
  /** The requesting site's wallet-verified origin, named on a policy-offer review. */
  context: Pick<PolicyOfferWalletContext, 'origin'> = {},
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
    { kind: 'text' as const, label: t('marketplace_batch_transactions'), value: grouped(intents.length) },
    { kind: 'address' as const, label: t('marketplace_batch_seller_wallet'), value: seller },
  ];
  const facts: MarketplaceApprovalReview['facts'] =
    kind === 'attach-and-list' || kind === 'authorize-offers' || kind === 'fund-policy-offer'
      ? []
      : [...identityFacts];
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
          value: satsValue(listing.guaranteedSellerPaymentSats), emphasis: 'primary',
        },
        action: title,
        amounts: [
          { kind: 'amount', label: t('marketplace_batch_listing_price'), value: satsValue(listing.priceSats) },
          { kind: 'amount', label: t('marketplace_batch_utxo_returned'), value: satsValue(listing.utxoValueSats) },
          { kind: 'amount', label: t('marketplace_batch_attach_fee'), value: satsValue(attach.networkFeeSats) },
          {
            kind: 'amount', label: t('marketplace_batch_xcp_fee'),
            value: xcpTotal([attach.protocolFee.quotedAmountRaw]),
          },
        ],
        timing: t('marketplace_batch_attach_costs_are_paid_first'),
      };
    }
    facts.push(
      {
        kind: 'amount', label: t('marketplace_batch_your_payout_if_sold'),
        value: satsValue(listing.guaranteedSellerPaymentSats), emphasis: 'primary',
      },
      { kind: 'amount' as const, label: t('marketplace_batch_listing_price'), value: satsValue(listing.priceSats) },
      {
        kind: 'amount', label: t('marketplace_batch_utxo_returned'),
        value: satsValue(listing.utxoValueSats),
      },
      {
        kind: 'amount' as const, label: t('marketplace_batch_attach_fee'),
        value: satsValue(attach.networkFeeSats),
      },
      {
        kind: 'amount' as const, label: t('marketplace_batch_xcp_fee'),
        value: xcpTotal([attach.protocolFee.quotedAmountRaw]),
      },
      ...identityFacts,
      ...(sameAddress(attach.assetSource, attach.seller)
        ? []
        : [{ kind: 'address' as const, label: t('marketplace_batch_asset_source'), value: attach.assetSource }]),
      {
        kind: 'text' as const, label: t('marketplace_batch_sent_now'),
        value: t('marketplace_batch_attach_only'),
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
  } else if (kind === 'authorize-offers') {
    // The parser admitted only items sharing bidder, funding outpoint, delivery, price, and fee,
    // and each item proved those against its own bytes, so the first item speaks for all of them.
    const offers = intents as AuthorizeExactOfferIntentClaim[];
    const first = offers[0]!;
    const buyerCost = exactSafeSum([first.priceSats, first.platformFeeSats], 'offer cost');
    const deliveryUtxoSats = first.delivery.mode === 'attached' ? first.delivery.utxoValueSats : 0;
    const funding = first.bitcoinInvalidation.outpoint;
    const expiries = offers.map(offer => offer.marketplaceExpiresAt);
    const latestExpiry = Math.max(...expiries);
    title = offers.length === 1
      ? t('marketplace_batch_authorize_1_exact_offer')
      : t('marketplace_batch_authorize_exact_offers', grouped(offers.length));
    facts.push(
      {
        kind: 'amount', label: t('marketplace_intent_you_pay_if_accepted'),
        value: satsValue(buyerCost), emphasis: 'primary',
      },
      { kind: 'amount' as const, label: t('marketplace_intent_offer_price'), value: satsValue(first.priceSats) },
      ...(first.platformFeeSats > 0 ? [{
        kind: 'amount' as const, label: t('marketplace_intent_platform_fee'),
        value: satsValue(first.platformFeeSats), description: t('marketplace_intent_paid_by_the_buyer'),
      }] : []),
      ...(deliveryUtxoSats > 0 ? [{
        kind: 'amount' as const, label: t('marketplace_intent_asset_utxo'),
        value: satsValue(deliveryUtxoSats),
        description: t('marketplace_intent_still_yours_separate_from_the_offer_cost'),
      }] : []),
      {
        kind: 'paragraph' as const, label: t('marketplace_batch_settlement'),
        value: t('marketplace_batch_at_most_one_offer_can_be_accepted'),
      },
      { kind: 'text' as const, label: t('marketplace_batch_transactions'), value: grouped(offers.length) },
      // Each target under its ledger-proved quantity (the item proof's summary), never raw units.
      ...offers.map((offer, index) => ({
        kind: 'outpoint' as const,
        label: reviews[index]?.summary?.description ?? offer.assets[0].asset,
        value: `${offer.assets[0].sourceOutpoint.txid}:${offer.assets[0].sourceOutpoint.vout}`,
      })),
      {
        kind: 'address' as const, label: t('marketplace_intent_delivery'), value: first.delivery.address,
        description: first.delivery.mode === 'attached'
          ? t('marketplace_intent_asset_stays_attached_to_sat_utxo', grouped(deliveryUtxoSats))
          : t('marketplace_intent_asset_detaches_to_this_address'),
      },
      {
        kind: 'outpoint' as const, label: t('marketplace_intent_funding_utxo'),
        value: `${funding.txid}:${funding.vout}`,
      },
      {
        // Expiries may differ per target; name the latest rather than imply one shared deadline.
        kind: 'date' as const,
        label: expiries.every(expiry => expiry === latestExpiry)
          ? t('marketplace_intent_expires')
          : t('marketplace_batch_latest_expiry'),
        value: formatExpiry(latestExpiry),
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_intent_cancellation'),
        value: t('marketplace_intent_withdraw_by_spending_your_funding_utxo'),
      },
    );
    // No notice, as for listings: each item is `caution` by design (a durable buyer signature),
    // and the settlement and cancellation facts above are what that caution says.
    notice = '';
  } else if (kind === 'fund-policy-offer') {
    // The parser admitted only items sharing bidder, keys, delivery, funding set, and anchor, and
    // each item proved its own alternative against its own bytes.
    const offers = intents as FundPolicyOfferIntentClaim[];
    const first = offers[0]!;
    const alternatives = offers.map(offer => offer.alternatives[0]!);
    const only = alternatives.length === 1 ? alternatives[0]! : undefined;
    const expiries = alternatives.map(alternative => alternative.expiresAt);
    const latestExpiry = Math.max(...expiries);
    title = only
      ? t('marketplace_intent_title_policy_offer', [satsValue(only.priceSats), describeCanonicalPolicy(only.policy)])
      : t('marketplace_batch_make_alternative_offers', grouped(offers.length));
    facts.push(
      ...(only ? [
        {
          kind: 'amount' as const, label: t('marketplace_intent_offer_price'), value: satsValue(only.priceSats),
          emphasis: 'primary' as const,
        },
        { kind: 'text' as const, label: t('marketplace_intent_offer_policy'), value: describeCanonicalPolicy(only.policy) },
      ] : alternatives.map((alternative, index) => ({
        kind: 'amount' as const, label: t('marketplace_batch_offer_n', grouped(index + 1)),
        value: satsValue(alternative.priceSats), description: describeCanonicalPolicy(alternative.policy),
      }))),
      {
        kind: 'text' as const, label: t('marketplace_intent_network_fee'), value: t('marketplace_intent_none_now'),
        description: t('marketplace_intent_seller_pays_marketplace_and_network_fees'),
      },
      ...(only ? [] : [{
        kind: 'paragraph' as const, label: t('marketplace_batch_settlement'),
        value: t('marketplace_batch_policy_alternatives_at_most_one_fills'),
      }]),
      {
        kind: 'address' as const, label: t('marketplace_intent_delivery'), value: first.delivery.address,
        description: t('marketplace_intent_asset_detaches_to_this_address'),
      },
      ...first.fundingInputs.map(funding => ({
        kind: 'outpoint' as const, label: t('marketplace_intent_funding_utxo'),
        value: `${funding.txid}:${funding.vout}`,
      })),
      {
        kind: 'date' as const,
        label: expiries.every(expiry => expiry === latestExpiry)
          ? t('marketplace_intent_expires')
          : t('marketplace_batch_latest_expiry'),
        value: formatExpiry(latestExpiry),
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_intent_cancellation'),
        value: t('marketplace_intent_policy_cancel_by_spending_funding'),
      },
    );
    // What these signatures leave standing: one of them can be filled without another prompt
    // until the latest alternative expires or a funding input is spent. A caution by design.
    // Without a verified origin every item is already blocked, so there is nothing to disclose.
    notice = context.origin ? policyOfferStandingNotice(latestExpiry) : '';
  } else if (kind === 'bulk-fanout') {
    const fanouts = intents as PrepareBulkFanoutIntentClaim[];
    const slots = exactSafeSum(fanouts.map(intent => intent.slotCount), 'slot count');
    const fees = exactSafeSum(fanouts.map(intent => intent.networkFeeSats), 'network fee');
    title = slots === 1
      ? t('marketplace_batch_create_1_listing_utxo')
      : t('marketplace_batch_create_listing_utxos', grouped(slots));
    facts.push(
      { kind: 'amount' as const, label: t('marketplace_batch_new_utxos'), value: grouped(slots) },
      { kind: 'amount' as const, label: t('marketplace_batch_network_fees'), value: satsValue(fees) },
    );
    notice = t('marketplace_batch_every_fan_out_input_and');
  } else if (kind === 'bulk-attach' || kind === 'prepare-assets') {
    const attaches = intents as Array<AttachForListingIntentClaim | PrepareAssetIntentClaim>;
    const fees = exactSafeSum(attaches.map(intent => intent.networkFeeSats), 'network fee');
    title = kind !== 'prepare-assets'
      ? t('marketplace_batch_attach_collectibles_for_listing', grouped(attaches.length))
      : attaches.length === 1
        ? t('marketplace_batch_prepare_1_collectible')
        : t('marketplace_batch_prepare_collectibles', grouped(attaches.length));
    facts.push(
      { kind: 'amount' as const, label: t('marketplace_batch_network_fees'), value: satsValue(fees) },
      {
        kind: 'amount' as const, label: t('marketplace_batch_xcp_fees'),
        value: xcpTotal(attaches.map(intent => intent.protocolFee.quotedAmountRaw)),
        description: t('common_xcp_fee_may_change'),
      },
      // The key that signs input 0 when the assets sit on the paired Legacy/SegWit sibling; the
      // single attach and attach-and-list screens already name it.
      ...[...new Set(attaches.map(intent => intent.assetSource))]
        .filter(source => !sameAddress(source, seller))
        .map(source => ({ kind: 'address' as const, label: t('marketplace_batch_asset_source'), value: source })),
    );
    // No notice. Every clean attach is `caution` by design, which turns any notice here amber —
    // and a recital of the checks that just passed reads as an alarm about a batch where nothing
    // is wrong. The single-attach review says the same thing by carrying `notices: []`, and the
    // XCP fee, with its may-change note, is already a fact above.
    notice = '';
  } else {
    const listings = intents as CreateListingIntentClaim[];
    const gross = exactSafeSum(listings.map(intent => intent.priceSats), 'listing prices');
    const returned = exactSafeSum(listings.map(intent => intent.utxoValueSats), 'asset UTXO values');
    const payouts = exactSafeSum(listings.map(intent => intent.guaranteedSellerPaymentSats), 'seller payouts');
    // A batch where every item replaces an existing authorization is a reprice, and saying
    // "listings" would describe it as putting new items up for sale. Mixed batches stay generic.
    const allReprice = listings.every(intent => intent.listingContext?.mode === 'reprice');
    title = !allReprice
      ? t('marketplace_batch_authorize_marketplace_listings', grouped(listings.length))
      : listings.length === 1
        ? t('marketplace_batch_authorize_1_listing_reprice')
        : t('marketplace_batch_authorize_listing_reprices', grouped(listings.length));
    // Proved reviews speak through facts, not notices, so the durable-signature boundary has to
    // live here — the same rows the single-listing screen shows.
    facts.push(
      { kind: 'amount' as const, label: t('marketplace_batch_total_asking'), value: satsValue(gross) },
      {
        kind: 'amount', label: t('marketplace_batch_utxo_returned'), value: satsValue(returned),
      },
      {
        kind: 'amount', label: t('marketplace_batch_your_payout_if_all_sell'),
        value: satsValue(payouts), emphasis: 'primary',
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_batch_buyer_controls'),
        value: t('marketplace_batch_funding_fees_and_delivery_destination'),
      },
      {
        kind: 'text' as const, label: t('marketplace_batch_broadcast'),
        value: t('marketplace_batch_not_now'),
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_batch_signature_invalidation'),
        value: t('marketplace_batch_spend_each_attached_asset_utxo'),
      },
    );
    // No notice, for the reason stated above the facts: the durable-signature boundary is the
    // `Signature invalidation` row, and the per-listing guarantee is what the payout rows say.
    // Restating both in an amber box warned about a batch that had verified completely.
    notice = '';
  }

  // One kind of block across every blocked item names the batch's block; a mix is a mismatch.
  const blockKinds = new Set(reviews.filter(review => review.status === 'blocked').map(review => review.blockKind));
  const [blockKind] = blockKinds;
  return {
    status,
    ...(status === 'blocked' && blockKinds.size === 1 && blockKind ? { blockKind } : {}),
    family: 'marketplace_batch',
    title,
    ...(summary ? { bundleSummary: summary } : {}),
    facts,
    notices: blockers.length > 0 || !notice
      ? []
      : [{ severity: status === 'caution' ? 'warning' : 'info', message: notice }],
    blockers,
  };
}
