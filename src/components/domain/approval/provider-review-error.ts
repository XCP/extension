import { hardwareErrorMessage } from '@/components/ui/hardware-error-message';
import { providerReviewCode } from '@/core/providerReviewErrors';
import { t } from '@/i18n';

/** Translate only wallet-authored diagnostics. Unrecognized evidence stays intact. */
export function providerReviewErrorMessage(error: unknown, fallback = t('common_failed_to_sign_request')): string {
  switch (providerReviewCode(error)) {
    case 'identity_changed': return t('provider_review_identity_changed');
    case 'connection_revoked': return t('provider_review_connection_revoked');
    case 'paired_revoked': return t('provider_review_paired_revoked');
    case 'wallet_locked': return t('provider_review_wallet_locked');
    case 'invalid_id': return t('provider_review_invalid_id');
    case 'missing_id': return t('provider_review_missing_id');
    case 'wrong_screen': return t('provider_review_wrong_screen');
    case 'load_failed': return t('provider_review_load_failed');
    case 'nothing_to_verify': return t('provider_review_nothing_to_verify');
    case 'not_reviewed': return t('provider_review_not_reviewed');
    case 'verifying': return t('provider_review_verifying');
    case 'retry_required': return t('provider_review_retry_required');
    case 'cancelled': return t('provider_review_cancelled');
    case 'unavailable': return t('provider_review_unavailable');
    case 'missing_sighash': return t('provider_review_missing_sighash');
    case 'invalid_message': return t('provider_review_invalid_message');
    case 'expired_during_review': return t('provider_review_expired_during_review');
    case 'invalid_decision': return t('provider_review_invalid_decision');
    case 'verification_failed': return t('provider_review_verification_failed');
    case 'review_changed': return t('provider_review_review_changed');
    case 'acknowledge_risks': return t('provider_review_acknowledge_risks');
    case 'missing_attachment': return t('provider_review_missing_attachment');
    case 'interrupted': return t('provider_review_interrupted');
    case 'expired_completion': return t('provider_review_expired_completion');
    case 'expired_delivery': return t('provider_review_expired_delivery');
    default: return hardwareErrorMessage(error) ?? (error instanceof Error ? error.message : typeof error === 'string' ? error : fallback);
  }
}
