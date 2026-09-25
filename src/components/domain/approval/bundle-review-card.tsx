import { Collapsible } from '@/components/ui/collapsible';
import type { MarketplaceBundleReview } from '@/core/counterparty/marketplaceBundleReview';
import { t } from '@/i18n';
import { ApprovalFacts } from './approval-facts';
/** Keep the actual payout first; the complete proof facts remain available in one disclosure. */
export function BundleReviewCard({ review }: { review: MarketplaceBundleReview }) {
  if (review.status !== 'proved' && review.status !== 'caution') return null;
  const { bundleSummary: summary } = review;
  if (!summary) {
    return (
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">{review.title}</p>
        <div className="mt-3 border-t border-gray-100 pt-3">
          <ApprovalFacts fields={review.facts} />
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <ApprovalFacts fields={[summary.outcome]} />
      <p className="mt-1 text-sm text-gray-700 [overflow-wrap:anywhere]">{summary.action}</p>
      <div className="mt-3 border-t border-gray-100 pt-3">
        <ApprovalFacts fields={summary.amounts} />
      </div>
      {summary.timing && <p className="mt-3 text-xs leading-4 text-gray-600">{summary.timing}</p>}
      <Collapsible className="mt-3 border-t border-gray-100 pt-3" title={t('approval_bundle_review_card_payout_and_fee_details')}>
        <ApprovalFacts fields={review.facts.filter(field =>
          field.emphasis !== 'primary' && !summary.amounts.some(amount => amount.label === field.label))} />
      </Collapsible>
    </div>
  );
}
