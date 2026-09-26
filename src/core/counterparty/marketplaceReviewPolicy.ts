/**
 * The one answer to "does this marketplace review need a separate acknowledgement step?".
 *
 * Execution policy (`providerApprovalPolicy`) and every approval screen read this, so the screen
 * can never offer a one-click signature that the signing service then refuses with
 * `acknowledge_risks`, or force a second click the policy does not require.
 */
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';

type Family = MarketplaceApprovalReview['family'];

/**
 * Families whose fully checked outcome is `caution` rather than `proved`, because the caution is
 * a routine protocol fact the review card already states — not an exception to act on:
 *
 * - `attach_for_listing` / `prepare_asset`: the XCP attach fee is a block-dependent quote.
 * - `authorize_exact_offer`: the buyer's signature stays usable by the named seller until the
 *   offer expires or its funding UTXO is spent; the review's cancellation fact names the way out.
 * - `fund_policy_offer`: the market key can complete the offer without the bidder for up to its
 *   value until a funding UTXO is spent; the review's notice names the requesting site's verified
 *   origin, the abbreviated key, and that amount.
 *
 * Only a `caution` review is exempted. `blocked` and `retry` still block, and every non-marketplace
 * warning (fees, verification exceptions, flexible funds, safety findings) is still gated.
 */
const ROUTINE_CAUTION_FAMILIES: ReadonlySet<Family> = new Set<Family>([
  'attach_for_listing',
  'prepare_asset',
  'authorize_exact_offer',
  'fund_policy_offer',
]);

/** A proved attach quote: routine, disclosed on the card, and labeled as an attach. */
export function isRoutineAttachFamily(family: Family | undefined): boolean {
  return family === 'attach_for_listing' || family === 'prepare_asset';
}

/** True when the marketplace review itself (apart from any generic warning) needs acknowledgement. */
export function marketplaceReviewRequiresAcknowledgement(
  review: Pick<MarketplaceApprovalReview, 'status' | 'family'> | undefined,
): boolean {
  return review?.status === 'caution' && !ROUTINE_CAUTION_FAMILIES.has(review.family);
}
