/**
 * Wallet-side proof for versioned Counterparty marketplace intent claims.
 *
 * An intent is display context from a website, never authority. The parser only bounds its wire
 * shape; the analyzer independently matches every security-relevant term to PSBT bytes, requested
 * signatures, prevouts, and Counterparty UTXO balances.
 */

import { analyzeExactOfferIntent } from '@/core/counterparty/marketplace/exactOfferAnalysis';
import { analyzeFundOffersIntent, analyzePrepareBulkFanoutIntent } from '@/core/counterparty/marketplace/fundingAnalysis';
import type { MarketplaceAnalysisInput, MarketplaceApprovalReview } from '@/core/counterparty/marketplace/intentTypes';
import {
  analyzeAttachIntent,
  analyzeBuyListingsIntent,
  analyzeCreateListingIntent,
} from '@/core/counterparty/marketplace/listingAnalysis';
import {
  analyzeAcceptPolicyOfferIntent,
  analyzeFundPolicyOfferIntent,
} from '@/core/counterparty/marketplace/policyOfferAnalysis';

export { describeCanonicalPolicy, formatExpiry, policyOfferStandingNotice } from '@/core/counterparty/marketplace/format';
export { parseMarketplaceIntent } from '@/core/counterparty/marketplace/intentParser';
export {
  type AcceptExactOfferIntentClaim,
  type AcceptPolicyOfferIntentClaim,
  type AttachForListingIntentClaim,
  type AuthorizeExactOfferIntentClaim,
  type BuyListingsIntentClaim,
  type CreateListingIntentClaim,
  type FundOffersIntentClaim,
  type FundOffersTargetClaim,
  type FundPolicyOfferAlternativeClaim,
  type FundPolicyOfferIntentClaim,
  MARKETPLACE_INTENT_STANDARD,
  MARKETPLACE_INTENT_VERSION,
  type MarketplaceAnalysisInput,
  type MarketplaceApprovalReview,
  type MarketplaceAssetClaim,
  type MarketplaceIntentClaimV1,
  type MarketplaceOutpointClaim,
  type MarketplaceSettlementDelivery,
  type PolicyOfferWalletContext,
  type PrepareAssetIntentClaim,
  type PrepareBulkFanoutIntentClaim,
} from '@/core/counterparty/marketplace/intentTypes';
export { marketplaceTransactionHeaderProblem } from '@/core/counterparty/marketplace/proofs';

export function analyzeMarketplaceIntent(input: MarketplaceAnalysisInput): MarketplaceApprovalReview {
  const review = analyzeMarketplaceIntentClaim(input);
  // An input the wallet never looked up because the transaction has too many can only ever read
  // as "retry", and retrying cannot clear it. Say what it is. Still blocked either way.
  if (review.status === 'retry' && input.attachedAssets.some(entry => entry.overLimit)) {
    return { ...review, status: 'blocked', blockKind: 'input_limit' };
  }
  return review;
}

function analyzeMarketplaceIntentClaim(input: MarketplaceAnalysisInput): MarketplaceApprovalReview {
  switch (input.intent.action) {
    case 'attach_for_listing':
    case 'prepare_asset':
      return analyzeAttachIntent(input, input.intent);
    case 'buy_listings':
      return analyzeBuyListingsIntent(input, input.intent);
    case 'create_listing':
      return analyzeCreateListingIntent(input, input.intent);
    case 'authorize_exact_offer':
    case 'accept_exact_offer':
      return analyzeExactOfferIntent(input, input.intent);
    case 'prepare_bulk_fanout':
      return analyzePrepareBulkFanoutIntent(input, input.intent);
    case 'fund_offers':
      return analyzeFundOffersIntent(input, input.intent);
    case 'fund_policy_offer':
      return analyzeFundPolicyOfferIntent(input, input.intent);
    case 'accept_policy_offer':
      return analyzeAcceptPolicyOfferIntent(input, input.intent);
  }
}
