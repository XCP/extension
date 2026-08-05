/**
 * Verification Status Component
 *
 * Displays the result of local transaction verification.
 * Used in provider approval pages to show whether a transaction
 * was successfully verified locally.
 */

import type { ReactElement } from 'react';
import { FiInfo, FiShield, FiShieldOff } from '@/components/icons';

/*
 * The passed state is intentionally low-weight — a small inline badge, not a
 * full banner — so the normal (verified) case doesn't compete visually with
 * the exceptional warning/danger banners. Only failures render a full box.
 */

export interface VerificationStatusProps {
  /** Whether verification passed */
  passed?: boolean;
  /**
   * Whether a second decoding was actually compared against the local one.
   *
   * Passing with nothing to compare against is not the same as passing a comparison: when the API
   * decode is unavailable, the message decoded locally and that is all. Claiming "no tampering
   * detected" there asserts most where least was checked, so the two are shown differently.
   */
  comparedAgainstApi?: boolean;
  /**
   * Whether the decode was rebuilt into the exact bytes being signed.
   *
   * This, not the API comparison, is what justifies an affirmative message. Both decoders read the
   * same input, so agreement between them can only ever mean this project's unpacker has no bug —
   * never that the payload is honest. Rebuilding proves something the user actually cares about:
   * that the summary above accounts for every byte, and nothing is hiding in a field the decode
   * skipped. Absence of a proof is not evidence of tampering, so it is stated flatly.
   */
  repackProved?: boolean;
  /** Warning/error message to display */
  warning?: string;
  /** Whether strict mode is enabled (blocks signing on failure) */
  isStrict?: boolean;
}

/**
 * Displays verification status with appropriate styling.
 *
 * - Green: cross-checked and agreed
 * - Neutral: decoded locally, but no payload field was compared
 * - Orange: Verification failed (non-strict mode, warning only)
 * - Red: Verification failed (strict mode, signing blocked)
 */
export function VerificationStatus({
  passed,
  comparedAgainstApi = true,
  repackProved = false,
  warning,
  isStrict = true,
}: VerificationStatusProps): ReactElement | null {
  // Don't render anything if verification wasn't attempted
  // (e.g., non-Counterparty transactions)
  if (passed === undefined) {
    return null;
  }

  // Rebuilt into the exact bytes being signed. This is the only state that says something
  // affirmative, and it describes what was done rather than issuing a verdict: "no tampering
  // detected" was a promise this check cannot make, and a reassuring badge on every screen is
  // what teaches people to click through the one screen that matters.
  if (passed === true && repackProved) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-success-700">
        <FiShield className="size-4 flex-shrink-0" aria-hidden="true" />
        Rebuilt from these bytes — every byte accounted for
      </div>
    );
  }

  // Decoded, but nothing corroborated it: no adapter to rebuild this message type, or no payload
  // field was comparable. Neither an error nor a clean bill of health, and said plainly so the
  // absence of a proof is not mistaken for the presence of a problem.
  if (passed === true) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600">
        <FiInfo className="size-4 flex-shrink-0" aria-hidden="true" />
        {comparedAgainstApi
          ? 'Decoded locally — this type cannot be rebuilt to confirm'
          : 'Decoded locally — nothing to compare it against'}
      </div>
    );
  }

  // Verification failed
  const shouldBlock = isStrict;
  const bgColor = shouldBlock ? 'bg-danger-50' : 'bg-warning-50';
  const borderColor = shouldBlock ? 'border-danger-200' : 'border-warning-200';
  const iconColor = shouldBlock ? 'text-danger-600' : 'text-warning-600';
  const textColor = shouldBlock ? 'text-danger-800' : 'text-warning-800';

  return (
    <div className={`rounded-lg p-4 ${bgColor} border ${borderColor}`}>
      <div className="flex items-start">
        <FiShieldOff className={`size-5 mt-0.5 mr-2 flex-shrink-0 ${iconColor}`} aria-hidden="true" />
        <div className={`text-sm ${textColor}`}>
          <p className="font-medium">
            {shouldBlock ? 'Verification Failed - Signing Blocked' : 'Verification Warning'}
          </p>
          {warning && <p className="text-xs mt-1">{warning}</p>}
          {shouldBlock && (
            <p className="text-xs mt-2">
              Strict transaction verification is enabled. You can disable this in
              Settings &gt; Advanced to proceed with warnings only.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
