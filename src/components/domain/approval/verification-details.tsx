import type { ProviderVerificationResult } from '@/core/counterparty/unpack/providerVerify';

import { t } from '@/i18n';
/**
 * Keeps decoder disagreements available for an expert review without turning a
 * successfully rebuilt payload into an alarming top-level warning.
 */
export function VerificationDetails({
  verification,
}: {
  verification?: ProviderVerificationResult;
}) {
  if (!verification || verification.mismatches.length === 0) return null;

  return (
    <div>
      <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">{t('approval_verification_details_decoder_differences')}</h4>
      <div className="rounded bg-gray-50 p-2 text-xs text-gray-600">
        <p>
          {verification.repackProved
            ? t('approval_verification_details_the_counterparty_service_described_some')
            : t('approval_verification_details_the_wallet_and_counterparty_service')}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {verification.mismatches.map((mismatch, index) => (
            <li key={`${index}-${mismatch}`} className="break-words">
              {mismatch}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
