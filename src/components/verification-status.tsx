/**
 * Verification Status Component
 *
 * Displays the result of local transaction verification.
 * Used in provider approval pages to show whether a transaction
 * was successfully verified locally.
 */

import type { ReactElement } from 'react';
import { FiShield, FiShieldOff } from '@/components/icons';

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

  // Verification passed
  if (passed === true) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start">
          <FiShield className="w-5 h-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
          <div className="text-sm text-green-800">
            <p className="font-medium">Transaction Verified</p>
            <p className="text-xs mt-1">
              Local verification confirms this transaction matches the expected format.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Verification failed
  const shouldBlock = isStrict;
  const bgColor = shouldBlock ? 'bg-red-50' : 'bg-orange-50';
  const borderColor = shouldBlock ? 'border-red-200' : 'border-orange-200';
  const iconColor = shouldBlock ? 'text-red-600' : 'text-orange-600';
  const textColor = shouldBlock ? 'text-red-800' : 'text-orange-800';

  return (
    <div className={`rounded-lg p-4 ${bgColor} border ${borderColor}`}>
      <div className="flex items-start">
        <FiShieldOff className={`w-5 h-5 mt-0.5 mr-2 flex-shrink-0 ${iconColor}`} />
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
