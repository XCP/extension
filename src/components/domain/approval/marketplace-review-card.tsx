import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';

/** Semantic review shown only after the wallet has independently proved the marketplace family. */
export function MarketplaceReviewCard({ review }: { review: MarketplaceApprovalReview }) {
  const healthy = review.status === 'proved' || review.status === 'caution';
  return (
    <div className={`rounded-lg border p-4 ${
      healthy ? 'border-amber-200 bg-amber-50' : 'border-danger-200 bg-danger-50'
    }`}>
      <p className={`text-sm font-semibold ${healthy ? 'text-amber-950' : 'text-danger-900'}`}>
        {healthy ? 'Marketplace terms verified' : 'Marketplace terms did not verify'}
      </p>
      <p className={`mt-1 text-sm ${healthy ? 'text-amber-900' : 'text-danger-800'}`}>
        {review.title}
      </p>
      {healthy && (
        <dl className="mt-3 space-y-2 border-t border-amber-200 pt-3 text-xs">
          {review.facts.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-3">
              <dt className="text-amber-700">{fact.label}</dt>
              <dd className="max-w-[65%] text-right font-medium text-amber-950">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {review.notices.map((notice, index) => (
        <p key={`${notice.severity}-${index}`} className="mt-3 text-xs text-amber-800">
          {notice.message}
        </p>
      ))}
      <p className={`mt-3 text-xs ${healthy ? 'text-amber-700' : 'text-danger-700'}`}>
        The website supplied the label. The wallet proved the outpoint, asset, signature scope,
        and exact seller payment from the PSBT and independent balance lookup.
      </p>
    </div>
  );
}
