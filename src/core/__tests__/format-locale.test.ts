import { describe, expect, it } from 'vitest';
import { formatAmount, formatForInput, isComposableAmount } from '@/core/format';
import { toBigNumber, toSatoshis } from '@/core/numeric';

/**
 * A number a person typed must compose as the number they typed.
 *
 * Not a hundred times it, not a hundredth. The wallet signs what comes out of
 * these fields, so a formatting difference between languages is not a
 * cosmetic bug here — it is the wrong amount, agreed to by someone who read a
 * correct-looking screen.
 *
 * The seam is that a value can be formatted for a READER and then parsed as
 * if it were written for a MACHINE. `toBigNumber` deletes commas and spaces,
 * which is right for the English grouping it was written against and wrong
 * for every language that marks the decimal with a comma. Those two facts are
 * only safe together while no such language ships, which is exactly the kind
 * of safety that expires without warning.
 */

/** What compose finally sends: an integer, in satoshis. */
const composed = (typed: string) => toSatoshis(toBigNumber(typed));

describe('a machine value is not written in the reader’s language', () => {
  it('writes a period decimal and no grouping whatever the locale', () => {
    // formatForInput pins the locale; these are the values a field receives.
    expect(formatForInput(1.5, 8)).toBe('1.5');
    expect(formatForInput(1234.56, 8)).toBe('1234.56');
    expect(formatForInput('995269258.11111111', 8)).toBe('995269258.11111111');
    expect(formatForInput(1000000, 0)).toBe('1000000');
  });

  it('round-trips through compose without changing the amount', () => {
    for (const value of ['0.5', '1.5', '1234.56', '0.00000001', '21000000']) {
      expect(composed(formatForInput(value, 8))).toBe(toSatoshis(value));
    }
  });

  /**
   * The regression guard. Every locale the wallet ships today writes 1.5 the
   * same way, so the bug this pins is invisible right now — this asserts the
   * PROPERTY rather than the current behaviour, and fails the moment a
   * comma-decimal language is added without the producer rule being kept.
   */
  it('is unmoved by a locale that marks the decimal with a comma', () => {
    const reader = formatAmount({ value: 1234.56, locale: 'fr-FR', useGrouping: false });
    // What a display format would have put in the field, and what the parser
    // would have made of it: a hundred times the amount.
    expect(reader).not.toBe('1234.56');
    expect(composed(reader)).not.toBe(toSatoshis('1234.56'));
    // What the machine format puts there instead.
    expect(composed(formatForInput(1234.56, 8))).toBe(toSatoshis('1234.56'));
  });

  it('every shipped locale happens to agree, which is why this went unnoticed', () => {
    for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
      expect(formatAmount({ value: 1234.56, locale, useGrouping: false })).toBe('1234.56');
    }
  });
});

describe('the gate on the way in is the shape compose reads', () => {
  it("takes digits, one period, and the precision the asset has", () => {
    expect(isComposableAmount('', 8)).toBe(true);
    expect(isComposableAmount('1', 8)).toBe(true);
    expect(isComposableAmount('1.', 8)).toBe(true);
    expect(isComposableAmount('0.00000001', 8)).toBe(true);
    expect(isComposableAmount('21000000', 8)).toBe(true);
  });

  it('refuses a ninth decimal, which compose would truncate silently', () => {
    expect(isComposableAmount('0.000000001', 8)).toBe(false);
  });

  it('refuses any decimal at all on an indivisible asset', () => {
    expect(isComposableAmount('1', 0)).toBe(true);
    expect(isComposableAmount('1.0', 0)).toBe(false);
  });

  it('refuses everything a language or a slip would add', () => {
    for (const bad of ['1,5', '1 234', '1.2.3', '1e5', '-1', '+1', '1.5 ', 'abc', ' 1']) {
      expect(isComposableAmount(bad, 8)).toBe(false);
    }
  });

  it('accepts exactly what formatForInput writes, for every shape', () => {
    for (const value of ['0.5', '1234.56', '0.00000001', '21000000', '100']) {
      expect(isComposableAmount(formatForInput(value, 8), 8)).toBe(true);
    }
  });
});

describe('a number is read in the language the wallet is reading in', () => {
  it('groups and marks the decimal per locale for a reader', () => {
    expect(formatAmount({ value: 1234567.89, locale: 'en' })).toBe('1,234,567.89');
    expect(formatAmount({ value: 1234567.89, locale: 'ja' })).toBe('1,234,567.89');
    // Kept here as the shape a future locale takes, and the reason the
    // producer rule above exists.
    expect(formatAmount({ value: 1234567.89, locale: 'pt-BR' })).toBe('1.234.567,89');
  });

  it('defaults to English under a test runner, so existing assertions hold', () => {
    // Outside an extension context `t('appLocale')` falls back to the English
    // catalog, so unit tests keep asserting the copy they always did.
    expect(formatAmount({ value: 1234.5 })).toBe('1,234.5');
  });
});
