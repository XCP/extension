/**
 * Verification Status Component
 *
 * Displays the result of local transaction verification.
 * Used in provider approval pages to show whether a transaction
 * was successfully verified locally.
 */

import type { ReactElement } from 'react';
import { FiShieldOff } from '@/components/icons';

export interface VerificationStatusProps {
  /** Whether verification passed */
  passed?: boolean;
  /** Warning/error message to display */
  warning?: string;
  /** Whether strict mode is enabled (blocks signing on failure) */
  isStrict?: boolean;
}

/**
 * Speaks only when something is wrong.
 *
 * - Nothing: verification was not attempted, or it found no problem
 * - Orange: verification failed (non-strict mode, warning only)
 * - Red: verification failed (strict mode, signing blocked)
 */
export function VerificationStatus({
  passed,
  warning,
  isStrict = true,
}: VerificationStatusProps): ReactElement | null {
  // Don't render anything if verification wasn't attempted
  // (e.g., non-Counterparty transactions)
  if (passed === undefined) {
    return null;
  }

  // Nothing is wrong, so say nothing.
  //
  // Every previous version of this state was a line about our own machinery — what got compared,
  // what got rebuilt — which is not something a person can act on and not something most people
  // can read. Worse, a reassuring badge present on every screen is exactly what trains someone to
  // approve without looking, so it spends the user's attention to buy nothing and makes the one
  // screen that should alarm them look like all the others.
  //
  // Silence also happens to be the most honest option available: it claims nothing at all, which
  // is the right claim to make whether the decode was proved complete or merely not contradicted.
  // The outcome is still reported, quietly, inside Transaction Details for anyone who looks.
  if (passed === true) {
    return null;
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
