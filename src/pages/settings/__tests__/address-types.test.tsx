import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { formatAddress } from '@/core/format';
import { mockBrowserLocale, render } from '@/i18n/test-utils';
import AddressTypesPage from '../address-types';

const fixture = vi.hoisted(() => ({
  wallet: {
    id: 'wallet',
    type: 'mnemonic',
    addressFormat: 'p2wpkh',
    addressCount: 3,
    addresses: [0, 1, 2].map((index) => ({
      name: `Address ${index + 1}`,
      address: `active-${index}`,
      path: `m/84'/0'/0'/0/${index}`,
      pubKey: `02${index}`,
    })),
  },
  activeAddress: 'active-0',
  preview: vi.fn(async (_wallet: string, format: string, index?: number) => `preview:${format}:${index}`),
  update: vi.fn(async () => {}),
  header: vi.fn(),
}));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({
  activeWallet: fixture.wallet,
  activeAddress: fixture.wallet.addresses.find((address) => address.address === fixture.activeAddress) ?? null,
  getPreviewAddressForFormat: fixture.preview,
  updateWalletAddressFormat: fixture.update,
}) }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: fixture.header }) }));

function LivePage() {
  return <AddressTypesPage />;
}
const open = () => render(<MemoryRouter><LivePage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  fixture.wallet.addressFormat = AddressFormat.P2WPKH;
  fixture.activeAddress = 'active-0';
  mockBrowserLocale({ language: 'en', numberLocale: 'de-DE' });
});
afterEach(() => { cleanup(); mockBrowserLocale({ language: 'en', numberLocale: 'auto' }); });

describe('localized address-type settings', () => {
  it('updates language in place without changing the selected format or deriving new addresses', async () => {
    open();
    await screen.findByText('Native SegWit (P2WPKH)');
    const selected = screen.getByRole('option', { selected: true });
    const previewCalls = fixture.preview.mock.calls.map(call => [...call]);
    for (const [language, native, nested, legacy] of [
      ['ja', 'ネイティブSegWit', 'ネスト型SegWit', 'レガシー'],
      ['zh-CN', '原生 SegWit', '嵌套 SegWit', '传统'],
      ['zh-TW', '原生 SegWit', '巢狀 SegWit', '傳統'],
      ['zh-HK', '原生 SegWit', '嵌套 SegWit', '傳統'],
      ['en', 'Native SegWit', 'Nested SegWit', 'Legacy'],
    ]) {
      await act(async () => { mockBrowserLocale({ language, numberLocale: 'de-DE' }); });
      expect(screen.getByText(`${native} (P2WPKH)`)).toBeInTheDocument();
      expect(screen.getByText(`${nested} (P2SH-P2WPKH)`)).toBeInTheDocument();
      expect(screen.getByText(`${legacy} (P2PKH)`)).toBeInTheDocument();
      expect(screen.getByText('Taproot (P2TR)')).toBeInTheDocument();
      expect(screen.getByRole('option', { selected: true })).toBe(selected);
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
    mockBrowserLocale({ language: 'ja', numberLocale: 'auto' });
    open();
    await screen.findByText(legacy);
    expect(screen.getByText(segwit)).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(fixture.update).not.toHaveBeenCalled();
  });
});

describe('address-type previews', () => {
  it('previews every format at the active address index, which a switch keeps', async () => {
    fixture.activeAddress = 'active-2';
    open();
    await screen.findByText('Native SegWit (P2WPKH)');
    expect(fixture.preview.mock.calls.map(([, format, index]) => [format, index])).toEqual([
      [AddressFormat.P2TR, 2],
      [AddressFormat.P2WPKH, 2],
      [AddressFormat.P2SH_P2WPKH, 2],
      [AddressFormat.P2PKH, 2],
    ]);
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
      formatAddress(`preview:${AddressFormat.P2WPKH}:2`)
    );
  });
});

describe('address-type listbox', () => {
  it('moves focus with the arrow keys and switches only on Enter, Space or a click', async () => {
    open();
    await screen.findByText('Native SegWit (P2WPKH)');
    expect(screen.getByRole('listbox', { name: 'Address Type' })).toBeInTheDocument();
    const selected = screen.getByRole('option', { selected: true });
    const options = screen.getAllByRole('option');
    const next = options[options.indexOf(selected) + 1]!;
    act(() => selected.focus());
    await act(async () => { fireEvent.keyDown(selected, { key: 'ArrowDown' }); });
    expect(next).toHaveFocus();
    expect(fixture.update).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { selected: true })).toBe(selected);

    await act(async () => { fireEvent.keyDown(next, { key: 'Enter' }); });
    expect(fixture.update).toHaveBeenCalledTimes(1);
    expect(fixture.update).toHaveBeenCalledWith('wallet', AddressFormat.P2SH_P2WPKH);
  });

  it('does not re-save the format already in use', async () => {
    open();
    await screen.findByText('Native SegWit (P2WPKH)');
    const selected = screen.getByRole('option', { selected: true });
    await act(async () => { fireEvent.click(selected); });
    await act(async () => { fireEvent.keyDown(selected, { key: ' ' }); });
    expect(fixture.update).not.toHaveBeenCalled();
  });
});

describe('Back after choosing a type', () => {
  function Where() {
    return <output data-testid="where">{useLocation().pathname}</output>;
  }
  const openAt = () => render(
    <MemoryRouter initialEntries={['/settings/address-type']}><LivePage /><Where /></MemoryRouter>,
  );
  const back = () => act(async () => { fixture.header.mock.lastCall?.[0].onBack(); });

  it('goes home when Back is pressed while the switch is still re-deriving the wallet', async () => {
    fixture.update.mockImplementationOnce(() => new Promise<void>(() => {}));
    openAt();
    fireEvent.click(await screen.findByText('Legacy (P2PKH)'));
    await back();
    expect(screen.getByTestId('where').textContent).toBe('/index');
  });

  it('returns to settings when the switch failed', async () => {
    fixture.update.mockRejectedValueOnce(new Error('refused'));
    openAt();
    fireEvent.click(await screen.findByText('Legacy (P2PKH)'));
    await screen.findByText('refused');
    await back();
    expect(screen.getByTestId('where').textContent).toBe('/settings');
  });
});
