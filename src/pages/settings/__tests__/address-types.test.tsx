import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { configureLocale } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';
import AddressTypesPage from '../address-types';

const fixture = vi.hoisted(() => ({
  wallet: { id: 'wallet', type: 'mnemonic', addressFormat: 'p2wpkh' },
  preview: vi.fn(async (_wallet: string, format: string) => `preview:${format}`),
  update: vi.fn(async () => {}),
  header: vi.fn(),
}));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({
  activeWallet: fixture.wallet,
  getPreviewAddressForFormat: fixture.preview,
  updateWalletAddressFormat: fixture.update,
}) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: fixture.header }) }));

function LivePage() {
  useLocaleRevision();
  return <AddressTypesPage />;
}
const open = () => render(<MemoryRouter><LivePage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  fixture.wallet.addressFormat = AddressFormat.P2WPKH;
  configureLocale({ language: 'en', numberLocale: 'de-DE' });
});
afterEach(() => { cleanup(); configureLocale({ language: 'en', numberLocale: 'auto' }); });

describe('localized address-type settings', () => {
  it('updates language in place without changing the selected format or deriving new addresses', async () => {
    open();
    await screen.findByText('Native SegWit (P2WPKH)');
    const selected = screen.getByRole('radio', { checked: true });
    const previewCalls = fixture.preview.mock.calls.map(call => [...call]);
    for (const [language, native, nested, legacy] of [
      ['ja', 'ネイティブSegWit', 'ネスト型SegWit', 'レガシー'],
      ['zh-CN', '原生 SegWit', '嵌套 SegWit', '传统'],
      ['zh-TW', '原生 SegWit', '巢狀 SegWit', '傳統'],
      ['zh-HK', '原生 SegWit', 'Nested SegWit', '傳統'],
      ['en', 'Native SegWit', 'Nested SegWit', 'Legacy'],
    ]) {
      await act(async () => { configureLocale({ language, numberLocale: 'de-DE' }); });
      expect(screen.getByText(`${native} (P2WPKH)`)).toBeInTheDocument();
      expect(screen.getByText(`${nested} (P2SH-P2WPKH)`)).toBeInTheDocument();
      expect(screen.getByText(`${legacy} (P2PKH)`)).toBeInTheDocument();
      expect(screen.getByText('Taproot (P2TR)')).toBeInTheDocument();
      expect(screen.getByRole('radio', { checked: true })).toBe(selected);
    }
    expect(fixture.preview.mock.calls).toEqual(previewCalls);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.header.mock.lastCall?.[0].rightButton).toBeUndefined();
  });

  it.each([
    [AddressFormat.Counterwallet, 'CounterWallet (P2PKH)', 'CounterWallet SegWit (P2WPKH)'],
    [AddressFormat.FreewalletBIP39, 'FreeWallet (P2PKH)', 'FreeWallet SegWit (P2WPKH)'],
  ])('preserves wallet identity and format choices for %s', async (format, legacy, segwit) => {
    fixture.wallet.addressFormat = format;
    configureLocale({ language: 'ja', numberLocale: 'auto' });
    open();
    await screen.findByText(legacy);
    expect(screen.getByText(segwit)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(fixture.update).not.toHaveBeenCalled();
  });
});
