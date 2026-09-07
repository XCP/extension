import {
  AmountValidationError,
  type DecimalPlaces,
  parseAmountDraft,
} from '@/core/amount-contract/amounts';

/** A complete user draft, converted once after its asset scale is known. */
export function exactQuantity(value: string, divisible: boolean | undefined, field = 'Amount'): string {
  if (typeof divisible !== 'boolean') throw new Error(`${field}: asset divisibility is unknown. Wait for asset details and try again.`);
  const result = parseAmountDraft(value, { decimals: divisible ? 8 : 0 });
  if (result.status !== 'valid') {
    const code = result.status === 'invalid' ? result.code : 'amount_syntax';
    const error = new AmountValidationError(code);
    error.message = `${field}: enter ${divisible ? 'digits and a decimal point with at most 8 decimal places' : 'whole digits only'}, within the asset supply limit (${code}).`;
    throw error;
  }
  return result.raw.toString();
}

export function validAmountDraft(value: string, decimals: number, allowZero = false): boolean {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) return false;
  return parseAmountDraft(value, { decimals: decimals as DecimalPlaces, minRaw: allowZero ? 0n : 1n }).status === 'valid';
}
