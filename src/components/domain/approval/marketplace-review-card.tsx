import { Button } from '@/components/ui/button';
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';
import { t } from '@/i18n';
import { ApprovalFacts } from './approval-facts';
import { ApprovalNotice } from './approval-notice';
/** Semantic review produced after the wallet independently evaluates the marketplace family. */
export function MarketplaceReviewCard({ review, onRetry, retrying = false, retryError }: {
  review: MarketplaceApprovalReview;
  onRetry?: () => void;
  retrying?: boolean;
  retryError?: string | null;
}) {
  const proved = review.status === 'proved';
  const caution = review.status === 'caution';
  const retry = review.status === 'retry';
  const showFacts = proved || caution;
  if (!showFacts) {
    return (
      <div>
        <ApprovalNotice blocked statusLabel={retry ? t('approval_marketplace_review_card_verification_incomplete_retry') : t('common_marketplace_terms_did_not_verify')} items={
          (review.blockers.length > 0 ? review.blockers : [review.title]).map((reason, index) => ({
            key: `marketplace-blocker-${index}`, severity: retry ? 'warning' : 'danger',
            title: reason,
            ...(index === 0 ? { description: retry ? `${review.title}. Signing stays unavailable until verification succeeds.` : `${review.title}. Signing is blocked.` } : {}),
          }))
        } />
        {retry && onRetry && <Button color="gray" onClick={onRetry} disabled={retrying} className="mt-3 text-sm" fullWidth>
          {retrying ? t('common_verifying') : t('common_retry_verification')}
        </Button>}
        {retry && retryError && <p role="alert" className="mt-2 text-sm leading-5 text-danger-800">{retryError}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">{review.title}</p>
      <div className="mt-3 border-t border-gray-100 pt-3"><ApprovalFacts fields={review.facts} /></div>
      {caution && review.notices.map((notice, index) => (
        <p key={`${notice.severity}-${index}`} className="mt-3 border-t border-gray-100 pt-3 text-sm leading-5 text-gray-600">{notice.message}</p>
      ))}
    </div>
  );
}
