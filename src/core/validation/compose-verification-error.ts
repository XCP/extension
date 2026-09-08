import type { FeeVerificationDiagnostic } from '@/core/bitcoin/feeVerification';
import type { OutputPolicyDiagnostic } from '@/core/counterparty/outputPolicy';

export type ComposeVerificationDiagnostic = FeeVerificationDiagnostic | OutputPolicyDiagnostic;

/** Preserve the precise original reason for diagnostics; UI presentation uses only explicit codes. */
export class ComposeVerificationError extends Error {
  constructor(message: string, readonly diagnostic?: ComposeVerificationDiagnostic) {
    super(message);
    this.name = 'ComposeVerificationError';
  }
}
