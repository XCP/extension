export type TransactionInputCode = 'asset_divisibility_unknown' | 'fraction_inexact' | 'fee_invalid';

/** Stable diagnostics are localized at the UI boundary, never by matching English text. */
export class TransactionInputError extends Error {
  constructor(readonly code: TransactionInputCode, message: string) {
    super(message);
    this.name = 'TransactionInputError';
  }
}
