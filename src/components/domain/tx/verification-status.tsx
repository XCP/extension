/**
 * Verification Status Component
 *
 * Displays the result of local transaction verification.
 * Used in provider approval pages to show whether a transaction
 * was successfully verified locally.
 */

import type { ReactElement } from 'react';
import { FiShield, FiShieldOff } from '@/components/icons';

/*
 * The passed state is intentionally low-weight — a small inline badge, not a
 * full banner — so the normal (verified) case doesn't compete visually with
 * the exceptional warning/danger banners. Only failures render a full box.
 */

export interface VerificationStatusProps {
  /** Whether verification passed */
  passed?: boolean;
  /** Warning/error message to display */
  warning?: string;
  /** Whether strict mode is enabled (blocks signing on failure) */
  isStrict?: boolean;
}

/**
 * Displays verification status with appropriate styling.
 *
 * - Green: Verification passed
 * - Orange: Verification failed (non-strict mode, warning only)
 * - Red: Verification failed (strict mode, signing blocked)
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

  // Verification passed — compact inline badge, not a full banner.
  if (passed === true) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-success-700">
        <FiShield className="size-4 flex-shrink-0" aria-hidden="true" />
        Verified locally — no tampering detected
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
