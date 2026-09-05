import { Collapsible } from '@/components/ui/collapsible';
import type { MarketplaceBundleReview } from '@/core/counterparty/marketplaceBundleReview';
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
      <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-sm leading-5">
        {summary.amounts.map(field => (
          <div key={field.label} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <dt className="text-gray-600">{field.label}</dt>
            <dd className="ml-auto min-w-0 text-right font-medium tabular-nums text-gray-900 [overflow-wrap:anywhere]">{field.value}</dd>
          </div>
        ))}
      </dl>
      {summary.timing && <p className="mt-3 text-xs leading-4 text-gray-600">{summary.timing}</p>}
      <Collapsible className="mt-3 border-t border-gray-100 pt-3" title="Payout and fee details">
        <ApprovalFacts fields={review.facts.filter(field => field.emphasis !== 'primary')} />
      </Collapsible>
    </div>
  );
}
