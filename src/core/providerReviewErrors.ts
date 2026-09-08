/** Stable wallet-authored review diagnostics; presentation belongs to the UI. */
export const PROVIDER_REVIEW_MESSAGES = {
  identity_changed: 'The active address changed after this request was made. Switch back to the authorized address, or reconnect the site.',
  connection_revoked: 'This site is no longer connected. Reconnect it before signing.',
  paired_revoked: 'Paired address access was revoked. Reconnect the site before signing.',
  wallet_locked: 'Wallet is locked',
  invalid_id: 'Invalid signing request ID',
  missing_id: 'No signing request ID provided',
  wrong_screen: 'This request belongs to a different approval screen',
  load_failed: 'Unable to load signing request',
  nothing_to_verify: 'No signing request to verify',
  not_reviewed: 'No reviewed signing request',
  verifying: 'Verification is in progress. Wait before signing.',
  retry_required: 'Retry verification successfully before signing.',
  cancelled: 'Signing request cancelled',
  unavailable: 'Signing request not found or no longer pending',
  missing_sighash: 'Missing sighash entry for a requested input',
  invalid_message: 'Invalid or reserved message signing request',
  expired_during_review: 'Signing request expired during review',
  invalid_decision: 'Invalid signing decision',
  verification_failed: 'This request did not pass transaction verification',
  review_changed: 'The transaction review changed. Reload this approval and review it again.',
  acknowledge_risks: 'Review and acknowledge the transaction risks before signing',
  missing_attachment: 'Missing attachment parent',
  interrupted: 'Signing request was cancelled or expired',
  expired_completion: 'Signing request expired before completion',
  expired_delivery: 'Signing request expired before delivery',
} as const;

export type ProviderReviewCode = keyof typeof PROVIDER_REVIEW_MESSAGES;

export function isProviderReviewCode(value: unknown): value is ProviderReviewCode {
  return typeof value === 'string' && Object.hasOwn(PROVIDER_REVIEW_MESSAGES, value);
}

/** Retain existing RPC error codes and raw messages alongside the local diagnostic. */
export function withProviderReviewCode<T extends Error>(error: T, reviewCode: ProviderReviewCode): T & { reviewCode: ProviderReviewCode } {
  return Object.assign(error, { reviewCode });
}

export function providerReviewCode(error: unknown): ProviderReviewCode | undefined {
  if (!(error instanceof Error) || !('reviewCode' in error)) return undefined;
  return isProviderReviewCode(error.reviewCode) ? error.reviewCode : undefined;
}

export class ProviderReviewError extends Error {
  constructor(readonly reviewCode: ProviderReviewCode) {
    super(PROVIDER_REVIEW_MESSAGES[reviewCode]);
    this.name = 'ProviderReviewError';
  }
}
