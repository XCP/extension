import { afterEach, describe, expect, it } from 'vitest';
import { AmountValidationError } from '@/core/amount-contract/amounts';
import { formatAmountExact, formatForInput } from '@/core/format';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { exactQuantity } from '@/core/validation/transaction-amount';
import { TransactionInputError } from '@/core/validation/transaction-input-error';
import { configureLocale, currentNumberLocale, t } from '@/i18n';
import { feeErrorMessage, transactionErrorMessage } from './transaction-error-message';

afterEach(() => configureLocale({}));

describe('presentation preferences cannot affect transaction values', () => {
  it.each(['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'])('keeps exact input/raw values in %s with German number formatting', language => {
    configureLocale({ language, numberLocale: 'de-DE' });
    expect(currentNumberLocale()).toBe('de-DE');
    expect(DEFAULT_SETTINGS.fiat).toBe('usd');
    expect(formatAmountExact('100000000.00000001')).toBe('100.000.000,00000001');
    expect(formatForInput('100000000.00000001', 8)).toBe('100000000.00000001');
    expect(exactQuantity('100000000.00000001', true)).toBe('10000000000000001');
    for (const draft of ['-5', '1e5', '0,5', '1,234', '0.000000001']) {
      expect(() => exactQuantity(draft, true)).toThrow();
    }
    expect(() => exactQuantity('1.5', false)).toThrow();
    expect(exactQuantity('100', false)).toBe('100');
  });

  it.each(['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'])('translates codes, not arbitrary API text, in %s', language => {
    configureLocale({ language });
    expect(transactionErrorMessage(new AmountValidationError('amount_precision'))).toBe(t('safety_amount_precision'));
    expect(transactionErrorMessage(new TransactionInputError('asset_divisibility_unknown', 'internal field details'))).toBe(t('safety_divisibility_unknown'));
    expect(transactionErrorMessage(new TransactionInputError('fraction_inexact', 'internal'))).toBe(t('safety_fraction_inexact'));
    expect(transactionErrorMessage(new Error('amount_precision'))).toBeUndefined();
    expect(feeErrorMessage({ isValid: false, errorCode: 'fee_minimum', limit: 0.1 })).toContain('0.1');
  });
});
