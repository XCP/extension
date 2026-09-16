import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAmountDraft } from '@/core/amount-contract/amounts';
import { fetchBTCBalance } from '@/core/bitcoin/balance';
import { mockBrowserLocale } from '@/i18n/test-utils';
import { fetchAssetDetailsAndBalance } from '../utils/fetchAssetData';

vi.mock('@/core/bitcoin/balance', () => ({ fetchBTCBalance: vi.fn() }));
vi.mock('@/core/counterparty/api', () => ({ fetchAssetDetails: vi.fn(), fetchTokenBalance: vi.fn() }));
afterEach(() => { mockBrowserLocale({ language: 'en', numberLocale: 'auto' }); vi.clearAllMocks(); });

describe('BTC balances consumed by forms', () => {
  it.each(['en-US', 'de-DE', 'ja-JP', 'zh-CN'])('keeps all satoshis canonical under %s display preferences', async numberLocale => {
    mockBrowserLocale({ language: 'ja', numberLocale });
    vi.mocked(fetchBTCBalance).mockResolvedValue(123456789);
    const details = await fetchAssetDetailsAndBalance('BTC', '1CounterpartyXXXXXXXXXXXXXXXUWLpVr');
    expect(details.availableBalance).toBe('1.23456789');
    expect(parseAmountDraft(details.availableBalance, { decimals: 8 })).toMatchObject({ status: 'valid', raw: 123456789n });
  });

  it('keeps one satoshi without exponent notation or locale separators', async () => {
    mockBrowserLocale({ language: 'zh-TW', numberLocale: 'de-DE' });
    vi.mocked(fetchBTCBalance).mockResolvedValue(1);
    expect((await fetchAssetDetailsAndBalance('BTC', 'address')).availableBalance).toBe('0.00000001');
  });
});
