import { AmountValidationError } from '@/core/amount-contract/amounts';
import type { FeeValidationResult } from '@/core/validation/fee';
import { TransactionInputError } from '@/core/validation/transaction-input-error';
import { t } from '@/i18n';

/** Unknown API diagnostics retain their original text; only explicit codes are translated. */
export function transactionErrorMessage(error: unknown): string | undefined {
  if (error instanceof AmountValidationError) {
    switch (error.code) {
      case 'amount_precision': return t('safety_amount_precision');
      case 'amount_range': return t('safety_amount_range');
      case 'amount_too_long': return t('safety_amount_too_long');
      default: return t('safety_amount_syntax');
    }
  }
  if (error instanceof TransactionInputError) {
    switch (error.code) {
      case 'asset_divisibility_unknown': return t('safety_divisibility_unknown');
      case 'fraction_inexact': return t('safety_fraction_inexact');
      case 'fee_invalid': return t('safety_fee_invalid');
    }
  }
  return undefined;
}

export function feeErrorMessage(result: FeeValidationResult): string {
  if (result.errorCode === 'fee_minimum') return t('safety_fee_minimum', [String(result.limit)]);
  if (result.errorCode === 'fee_maximum') return t('safety_fee_maximum', [String(result.limit)]);
  return t('safety_fee_invalid');
}
