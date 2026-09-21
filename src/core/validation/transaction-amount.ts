import {
  AmountValidationError,
  type DecimalPlaces,
  parseAmountDraft,
} from '@/core/amount-contract/amounts';
import { TransactionInputError } from '@/core/validation/transaction-input-error';

/** A complete user draft, converted once after its asset scale is known. */
export function exactQuantity(value: string, divisible: boolean | undefined, field = 'Amount'): string {
  if (typeof divisible !== 'boolean') throw new TransactionInputError('asset_divisibility_unknown', `${field}: wait for asset details and try again.`);
  const result = parseAmountDraft(value, { decimals: divisible ? 8 : 0 });
  if (result.status !== 'valid') {
    const code = result.status === 'invalid' ? result.code : 'amount_syntax';
    const error = new AmountValidationError(code);
    const message = code === 'amount_range' ? 'Exceeds the maximum asset supply.'
      : code === 'amount_too_long' ? 'The value is too long.'
        : divisible ? 'Use digits and a dot, up to 8 decimals.' : 'Enter whole numbers only.';
    error.message = `${field}: ${message}`;
    throw error;
  }
  return result.raw.toString();
}

export function validAmountDraft(value: string, decimals: number, allowZero = false): boolean {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) return false;
  return parseAmountDraft(value, { decimals: decimals as DecimalPlaces, minRaw: allowZero ? 0n : 1n }).status === 'valid';
}
