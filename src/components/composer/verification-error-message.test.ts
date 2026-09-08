import { afterEach, describe, expect, it } from 'vitest';
import { type ComposeVerificationDiagnostic, ComposeVerificationError } from '@/core/validation/compose-verification-error';
import { configureLocale } from '@/i18n';
import { transactionErrorMessage } from './transaction-error-message';

const ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const OTHER = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const RAW = 'Original verifier diagnostic; do not rewrite for non-UI callers.';
const languages = ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'];

afterEach(() => configureLocale({}));

describe('structured compose diagnostics', () => {
  it.each(languages)('translates every local reason in %s while preserving the raw error', language => {
    configureLocale({ language, numberLocale: 'de-DE' });
    const diagnostics: ComposeVerificationDiagnostic[] = [
      { code: 'fee_inputs_unavailable' },
      { code: 'fee_inputs_unreadable' },
      { code: 'fee_outputs_exceed_inputs' },
      { code: 'fee_out_of_range' },
      { code: 'fee_abnormally_high', data: { feeSats: 99_975_233, approximateRate: '389008' } },
      { code: 'fee_exceeds_selected_rate', data: { feeSats: 150_001, selectedRate: 0.125 } },
      { code: 'output_recovery_key_mismatch' },
      { code: 'output_recipient_missing', data: { expected: ADDRESS } },
      { code: 'output_recipient_position', data: { expected: ADDRESS, preceding: [{ address: OTHER, value: 546 }] } },
      { code: 'output_recipient_position', data: { expected: ADDRESS, preceding: [{ address: OTHER, value: 546 }, { address: ADDRESS, value: 400_001 }] } },
      { code: 'output_unexplained', data: { outputs: [{ index: 0, address: OTHER, value: 123_456_789 }] } },
      { code: 'output_unexplained', data: { outputs: [{ index: 0, address: OTHER, value: 546 }, { index: 2, address: null, value: 400_001 }] } },
    ];
    for (const diagnostic of diagnostics) {
      const before = structuredClone(diagnostic);
      const error = new ComposeVerificationError(RAW, diagnostic);
      const message = transactionErrorMessage(error);
      expect(message).toBeTruthy();
      expect(message).not.toContain('composer_verification_');
      expect(message).not.toMatch(/\$\d/);
      if (language !== 'en') expect(message).toMatch(/[\u3000-\u9fff]/);
      expect(error.message).toBe(RAW);
      expect(error.diagnostic).toEqual(before);
    }
  });

  it.each(languages)('preserves exact amounts, rates, addresses and every output in %s', language => {
    configureLocale({ language, numberLocale: 'de-DE' });
    const fee = transactionErrorMessage(new ComposeVerificationError(RAW, {
      code: 'fee_exceeds_selected_rate', data: { feeSats: 150_001, selectedRate: 0.125 },
    }));
    expect(fee).toContain('150001 sats');
    expect(fee).toContain('0.125 sat/vB');
    const absolute = transactionErrorMessage(new ComposeVerificationError(RAW, {
      code: 'fee_abnormally_high', data: { feeSats: 99_975_233, approximateRate: '389008' },
    }));
    expect(absolute).toContain('99975233 sats');
    expect(absolute).toContain('389008 sat/vB');
    const outputs = transactionErrorMessage(new ComposeVerificationError(RAW, {
      code: 'output_unexplained', data: { outputs: [
        { index: 0, address: ADDRESS, value: 123_456_789 },
        { index: 3, address: OTHER, value: 1 },
        { index: 4, address: null, value: 546 },
      ] },
    }));
    for (const detail of [ADDRESS, OTHER, '123456789 sats', '1 sats', '546 sats']) {
      expect(outputs).toContain(detail);
    }
    expect(outputs).not.toContain('undefined');
    expect(outputs).not.toContain('null');
    if (language !== 'en') expect(outputs).not.toContain('could not be decoded');
  });

  it('distinguishes one wrong recipient from multiple joined recipients, leaving original text intact', () => {
    configureLocale({ language: 'en' });
    const original = 'This transaction puts more than one output ahead of its data output';
    const error = new ComposeVerificationError(original, {
      code: 'output_recipient_position', data: { expected: ADDRESS, preceding: [{ address: OTHER, value: 546 }] },
    });
    expect(transactionErrorMessage(error)).toBe(`The output before this transaction's data (546 sats to ${OTHER}) does not identify ${ADDRESS} as the recipient. It was not accepted.`);
    expect(error.message).toBe(original);
    const multiple = new ComposeVerificationError(original, {
      code: 'output_recipient_position', data: { expected: ADDRESS, preceding: [{ address: OTHER, value: 546 }, { address: ADDRESS, value: 400_001 }] },
    });
    expect(transactionErrorMessage(multiple)).toContain(`546 sats to ${OTHER}; 400001 sats to ${ADDRESS}`);
    expect(transactionErrorMessage(multiple)).toContain('combined recipient');
  });

  it('keeps unknown codes, absent codes and lookalike API text available verbatim', () => {
    configureLocale({ language: 'ja' });
    const unknown = new ComposeVerificationError('future diagnostic: 9007199254740993 sats', {
      code: 'future_reason',
    } as unknown as ComposeVerificationDiagnostic);
    for (const error of [unknown, new ComposeVerificationError(RAW), new Error('fee_abnormally_high')]) {
      expect(transactionErrorMessage(error)).toBeUndefined();
      expect(transactionErrorMessage(error) ?? error.message).toBe(error.message);
    }
  });
});
