import { afterEach, describe, expect, it } from 'vitest';
import { formatFiatEstimate, formatForInput } from '@/core/format';
import { configureLocale } from '@/i18n';

describe('fiat estimates are secondary and unambiguous', () => {
  afterEach(() => configureLocale({ language: 'auto', numberLocale: 'auto' }));
  it('distinguishes CNY from JPY and USD from other dollar currencies', () => {
    configureLocale({ language: 'en', numberLocale: 'en-US' });
    expect(formatFiatEstimate('1234.56', 'cny')).toBe('≈ 1,234.56 CNY');
    expect(formatFiatEstimate('1234.56', 'jpy')).toBe('≈ 1,235 JPY');
    expect(formatFiatEstimate('1234.56', 'usd')).toBe('≈ 1,234.56 USD');
    expect(formatFiatEstimate('1234.56', 'cad')).toBe('≈ 1,234.56 CAD');
  });
  it('honors a separate number format without changing currency or input', () => {
    configureLocale({ language: 'zh-CN', numberLocale: 'de-DE' });
    expect(formatFiatEstimate('1234.56', 'usd')).toBe('≈ 1.234,56 USD');
    expect(formatForInput('1234.56', 8)).toBe('1234.56');
  });
});
