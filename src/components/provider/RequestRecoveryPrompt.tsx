/**
 * Request Recovery Prompt
 *
 * Shows when user has a pending provider request after:
 * - Closing the popup
 * - Wallet auto-lock
 * - Walking away
 */

import { type ReactElement } from 'react';
import { FiClock, FiAlertCircle, FiArrowRight, FiX } from '@/components/icons';
import { Button } from '@/components/button';

interface RequestRecoveryPromptProps {
  origin: string;
  requestType: 'sign-message' | 'sign-psbt';
  requestAge: number; // seconds
  onResume: () => void;
  onCancel: () => void;
}

/**
 * RequestRecoveryPrompt shows when user has a pending provider request.
 * Displayed after popup close, wallet auto-lock, or inactivity.
 *
 * @param props - The component props
 * @returns A ReactElement representing the recovery prompt modal
 */
export function RequestRecoveryPrompt({
  origin,
  requestType,
  requestAge,
  onResume,
  onCancel
}: RequestRecoveryPromptProps): ReactElement {
  const hostname = new URL(origin).hostname;
  const ageDisplay = formatAge(requestAge);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn overscroll-behavior-contain">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-slideUp">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0">
              <FiAlertCircle className="size-6 text-orange-500" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">
                Pending Request Found
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                You have an incomplete {requestType === 'sign-psbt' ? 'transaction signing' : 'message signature'} request
              </p>
            </div>
          </div>

          {/* Request Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">From:</span>
                <span className="text-sm font-medium text-gray-900">{hostname}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Type:</span>
                <span className="text-sm font-medium text-gray-900">
                  {requestType === 'sign-psbt' ? 'Transaction Signing' : 'Message Signature'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Age:</span>
                <span className="text-sm font-medium text-gray-900 flex items-center gap-1">
                  <FiClock className="size-3" aria-hidden="true" />
                  {ageDisplay}
                </span>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="text-sm text-gray-600 mb-6">
            This request was interrupted when you {getInterruptionReason(requestAge)}.
            Would you like to resume where you left off?
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={onResume}
              color="blue"
              fullWidth
              className="flex items-center justify-center gap-2"
            >
              <FiArrowRight className="size-4" aria-hidden="true" />
              Resume Request
            </Button>
            <Button
              onClick={onCancel}
              color="gray"
              fullWidth
              className="flex items-center justify-center gap-2"
            >
              <FiX className="size-4" aria-hidden="true" />
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds ago`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  } else {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
}

function getInterruptionReason(ageSeconds: number): string {
  // Guess based on age
  if (ageSeconds < 30) {
    return 'closed the wallet';
  } else if (ageSeconds < 120) {
    return 'closed the wallet or navigated away';
  } else if (ageSeconds < 360) {
    return 'left the wallet inactive';
  } else {
    return 'left the wallet and it locked';
  }
}