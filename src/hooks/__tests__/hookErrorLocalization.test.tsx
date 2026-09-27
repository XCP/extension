import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';
import { getBtcPrice } from '@/core/bitcoin/price';
import { fetchAssetDetails, fetchUtxoBalances } from '@/core/counterparty/api';
import { getXCPPrice } from '@/core/counterparty/price';
import { MIN_PASSWORD_LENGTH } from '@/core/encryption/encryption';
import { mockBrowserLocale, renderHook } from '@/i18n/test-utils';
import ja from '../../../public/_locales/ja/messages.json';
import { useAssetOwnerLookup } from '../useAssetOwnerLookup';
import { useBlockHeight } from '../useBlockHeight';
import { useMarketPrices } from '../useMarketPrices';
import { useSecretReveal } from '../useSecretReveal';
import { useUtxoSource } from '../useUtxoSource';

vi.mock('@/core/bitcoin/blockHeight', () => ({ getCurrentBlockHeight: vi.fn() }));
vi.mock('@/core/bitcoin/price', () => ({ getBtc24hStats: vi.fn(), getBtcPrice: vi.fn() }));
vi.mock('@/core/counterparty/price', () => ({ getXCPPrice: vi.fn() }));
vi.mock('@/core/counterparty/api', () => ({ fetchAssetDetails: vi.fn(), fetchUtxoBalances: vi.fn() }));

/** The Japanese catalog's text, with $1 filled in the way Chrome does. */
const inJapanese = (key: keyof typeof ja, ...subs: string[]) =>
  ja[key].message.replace(/\$(\d)/g, (_, index: string) => subs[Number(index) - 1] ?? '');

// Hooks that own the text a screen shows put it in the reader's language, as the newer hooks do.
describe('hook errors in the reader\'s language', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockBrowserLocale({ language: 'ja' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    mockBrowserLocale({ language: 'en' });
  });

  it('useBlockHeight', async () => {
    vi.mocked(getCurrentBlockHeight).mockRejectedValue(new Error('socket hang up'));
    const { result } = renderHook(() => useBlockHeight());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe(inJapanese('block_height_unable_to_fetch'));
  });

  it('useMarketPrices', async () => {
    vi.mocked(getBtcPrice).mockRejectedValue(new Error('503'));
    vi.mocked(getXCPPrice).mockRejectedValue(new Error('503'));
    const { result } = renderHook(() => useMarketPrices('usd'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(inJapanese('market_prices_unavailable'));
  });

  it('useUtxoSource', async () => {
    vi.mocked(fetchUtxoBalances).mockRejectedValue(new Error('503'));
    const { result } = renderHook(() => useUtxoSource(`${'a'.repeat(64)}:0`, undefined));
    await waitFor(() => expect(result.current.isLoadingBalances).toBe(false));
    expect(result.current.error).toBe(inJapanese('utxo_source_balances_unavailable'));
  });

  describe('useAssetOwnerLookup', () => {
    it('an asset with no owner', async () => {
      vi.mocked(fetchAssetDetails).mockResolvedValue(null);
      const { result } = renderHook(() => useAssetOwnerLookup({ debounceMs: 0 }));
      act(() => result.current.performLookup('NOOWNER.xcp'));
      await waitFor(() => expect(result.current.error).toBe(inJapanese('asset_owner_lookup_not_found')));
    });

    it('a lookup that failed', async () => {
      vi.mocked(fetchAssetDetails).mockRejectedValue(new Error('503'));
      const { result } = renderHook(() => useAssetOwnerLookup({ debounceMs: 0 }));
      act(() => result.current.performLookup('DROPLISTER.xcp'));
      await waitFor(() => expect(result.current.error).toBe(inJapanese('asset_owner_lookup_failed')));
    });
  });

  describe('useSecretReveal', () => {
    const form = (password?: string) => {
      const data = new FormData();
      if (password !== undefined) data.set('password', password);
      return data;
    };
    const submit = async (walletId: string | undefined, password: string | undefined, reveal: (p: string) => Promise<boolean>) => {
      const { result } = renderHook(() => useSecretReveal({ walletId, reveal }));
      await act(() => result.current.formAction(form(password)));
      return result.current.submissionError;
    };
    const accepts = async () => true;

    it('each gate before the background is asked', async () => {
      expect(await submit(undefined, 'correct horse battery', accepts)).toBe(inJapanese('secret_reveal_invalid_wallet'));
      expect(await submit('wallet-1', undefined, accepts)).toBe(inJapanese('common_password_is_required'));
      expect(await submit('wallet-1', 'short', accepts)).toBe(inJapanese('common_password_must_be_at_least', String(MIN_PASSWORD_LENGTH)));
    });

    it('a wrong password, and a failure with no message of its own', async () => {
      expect(await submit('wallet-1', 'correct horse battery', async () => false)).toBe(inJapanese('secret_reveal_incorrect_password'));
      expect(await submit('wallet-1', 'correct horse battery', () => Promise.reject('boom'))).toBe(inJapanese('secret_reveal_failed'));
    });

    it('keeps a message the page already chose', async () => {
      expect(await submit('wallet-1', 'correct horse battery', () => Promise.reject(new Error('既に翻訳済み')))).toBe('既に翻訳済み');
    });
  });
});
