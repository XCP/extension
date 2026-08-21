import type { ProviderVerificationResult } from '@/core/counterparty/unpack/providerVerify';

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
      <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">Decoder differences</h4>
      <div className="rounded bg-gray-50 p-2 text-xs text-gray-600">
        <p>
          {verification.repackProved
            ? 'The Counterparty service described some fields differently. The wallet rebuilt its local decode to the exact payload bytes, so these differences do not block signing.'
            : 'The wallet and Counterparty service described some fields differently, and the wallet could not rebuild its local decode to the exact payload bytes.'}
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
