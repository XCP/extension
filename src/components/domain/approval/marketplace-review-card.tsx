import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';

/** Semantic review shown only after the wallet has independently proved the marketplace family. */
export function MarketplaceReviewCard({ review }: { review: MarketplaceApprovalReview }) {
  const healthy = review.status === 'proved' || review.status === 'caution';
  const proved = review.status === 'proved';
  const palette = proved
    ? {
        box: 'border-blue-200 bg-blue-50',
        heading: 'text-blue-950',
        body: 'text-blue-900',
        border: 'border-blue-200',
        muted: 'text-blue-700',
      }
    : healthy
      ? {
          box: 'border-amber-200 bg-amber-50',
          heading: 'text-amber-950',
          body: 'text-amber-900',
          border: 'border-amber-200',
          muted: 'text-amber-700',
        }
      : {
          box: 'border-danger-200 bg-danger-50',
          heading: 'text-danger-900',
          body: 'text-danger-800',
          border: 'border-danger-200',
          muted: 'text-danger-700',
        };
  return (
    <div className={`rounded-lg border p-4 ${palette.box}`}>
      <p className={`text-sm font-semibold ${palette.heading}`}>
        {healthy ? 'Marketplace terms verified' : 'Marketplace terms did not verify'}
      </p>
      <p className={`mt-1 text-sm ${palette.body}`}>
        {review.title}
      </p>
      {healthy && (
        <dl className={`mt-3 space-y-2 border-t pt-3 text-xs ${palette.border}`}>
          {review.facts.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-3">
              <dt className={palette.muted}>{fact.label}</dt>
              <dd className={`max-w-[65%] break-all text-right font-medium ${palette.heading}`}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {review.notices.map((notice, index) => (
        <p key={`${notice.severity}-${index}`} className={`mt-3 text-xs ${palette.body}`}>
          {notice.message}
        </p>
      ))}
      <p className={`mt-3 text-xs ${palette.muted}`}>
        The website supplied the label. The wallet independently checked the transaction bytes,
        signer scope, attached assets, payments, fees, and delivery terms that apply to this action.
      </p>
    </div>
  );
}
