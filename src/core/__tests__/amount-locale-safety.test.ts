import { describe, expect, it } from 'vitest';
import { formatAmount, formatForInput, isComposableAmount } from '@/core/format';
import { toBigNumber, toSatoshis } from '@/core/numeric';

/**
 * A number someone typed must compose as the number they typed.
 *
 * Not ten times it, not a hundred times it. The wallet signs what comes out of
 * these fields, so this is not a formatting nicety — it is the wrong amount,
 * agreed to by someone reading a screen that showed the right one.
 *
 * The defect was two correct-looking halves meeting. `formatAmount` given no
 * locale falls through to Intl's default, which is the BROWSER's locale, so on
 * a French, German, Spanish, Portuguese or Russian browser it writes a comma
 * for the decimal point. `toBigNumber` then deletes commas and spaces, which
 * is right for the English grouping it was written against and catastrophic
 * for a decimal comma. Neither half is wrong on its own.
 */

/** What compose finally sends: an integer, in satoshis. */
const composed = (typed: string) => toSatoshis(toBigNumber(typed));

/** What `formatAmount` produced with no locale, on a comma-decimal browser. */
const asDisplayedOn = (locale: string, value: number, decimals = 8) =>
  formatAmount({ value, maximumFractionDigits: decimals, minimumFractionDigits: 0, useGrouping: false, locale });

describe('the defect this file exists to prevent', () => {
  it('showed one number and composed another, by a factor of ten or a hundred', () => {
    // Exactly what the Max button and the fee field used to put in the field.
    expect(asDisplayedOn('fr-FR', 0.5)).toBe('0,5');
    expect(asDisplayedOn('fr-FR', 1.5, 2)).toBe('1,5');
    expect(asDisplayedOn('de-DE', 1234.56)).toBe('1234,56');

    // And what the parser made of it.
    expect(toBigNumber('0,5').toNumber()).toBe(5);
    expect(toBigNumber('1,5').toNumber()).toBe(15);
    expect(toBigNumber('1234,56').toNumber()).toBe(123456);
  });
});

describe('a machine value is not written in anybody’s language', () => {
  it('writes a period decimal and no grouping, whatever the browser is set to', () => {
    expect(formatForInput(0.5, 8)).toBe('0.5');
    expect(formatForInput(1.5, 2)).toBe('1.5');
    expect(formatForInput(1234.56, 8)).toBe('1234.56');
    expect(formatForInput('995269258.11111111', 8)).toBe('995269258.11111111');
    expect(formatForInput(1000000, 0)).toBe('1000000');
  });

  it('round-trips through compose without changing the amount', () => {
    for (const value of ['0.5', '1.5', '1234.56', '0.00000001', '21000000']) {
      expect(composed(formatForInput(value, 8))).toBe(toSatoshis(value));
    }
  });

  it('is unmoved by the locale that broke the display format', () => {
    for (const value of [0.5, 1.5, 1234.56]) {
      expect(formatForInput(value, 8)).toBe(String(value));
    }
  });
});

describe('the gate on the way in is the shape compose reads', () => {
  it('takes digits, one period, and the precision the asset has', () => {
    expect(isComposableAmount('', 8)).toBe(true);
    expect(isComposableAmount('1', 8)).toBe(true);
    expect(isComposableAmount('1.', 8)).toBe(true);
    expect(isComposableAmount('0.00000001', 8)).toBe(true);
  });

  it('refuses a ninth decimal, which compose would truncate in silence', () => {
    expect(isComposableAmount('0.000000001', 8)).toBe(false);
  });

  it('refuses any decimal at all on an indivisible asset', () => {
    expect(isComposableAmount('1', 0)).toBe(true);
    expect(isComposableAmount('1.0', 0)).toBe(false);
  });

  it('refuses everything a language or a slip would add', () => {
    for (const bad of ['1,5', '1 234', '1.2.3', '1e5', '-1', '+1', '1.5 ', 'abc']) {
      expect(isComposableAmount(bad, 8)).toBe(false);
    }
  });

  it('accepts exactly what formatForInput writes', () => {
    for (const value of ['0.5', '1234.56', '0.00000001', '21000000', '100']) {
      expect(isComposableAmount(formatForInput(value, 8), 8)).toBe(true);
    }
  });
});
