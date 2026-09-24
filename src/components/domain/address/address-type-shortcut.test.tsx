import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { formatAddress } from '@/core/format';
import { mockBrowserLocale, render } from '@/i18n/test-utils';
import AddressTypesPage from '@/pages/settings/address-types';
import { AddressTypeShortcut } from './address-type-shortcut';

type WalletType = 'mnemonic' | 'privateKey' | 'hardware';

const fixture = vi.hoisted(() => ({
  wallet: { id: 'wallet', type: 'mnemonic' as WalletType, addressFormat: 'p2wpkh' as string } as
    | { id: string; type: WalletType; addressFormat: string }
    | null,
  keychainLocked: false,
  onlyOneFormat: false,
  preview: vi.fn(async (_wallet: string, format: string) => `address-for-${format}-end`),
  update: vi.fn(async (_wallet: string, _format: string) => {}),
}));

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: fixture.wallet,
    keychainLocked: fixture.keychainLocked,
    getPreviewAddressForFormat: fixture.preview,
    updateWalletAddressFormat: fixture.update,
  }),
}));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: vi.fn() }) }));
vi.mock('@/core/wallet/addressFormatChoices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/wallet/addressFormatChoices')>();
  return {
    ...actual,
    selectableAddressFormats: (format: Parameters<typeof actual.selectableAddressFormats>[0]) =>
      fixture.onlyOneFormat ? [format] : actual.selectableAddressFormats(format),
  };
});

const previewFor = (format: string) => `address-for-${format}-end`;
const BUTTON_NAME = 'Change address type';
const shortcutButton = () => screen.queryByRole('button', { name: BUTTON_NAME });

function setWallet(type: WalletType, addressFormat: string) {
  fixture.wallet = { id: 'wallet', type, addressFormat };
}

async function openShortcut() {
  fireEvent.click(screen.getByRole('button', { name: BUTTON_NAME }));
  const group = await screen.findByRole('radiogroup', { name: 'Address Type' });
  await waitFor(() => expect(group).toHaveAttribute('aria-busy', 'false'));
  return group;
}

beforeEach(() => {
  vi.clearAllMocks();
  setWallet('mnemonic', AddressFormat.P2WPKH);
  fixture.keychainLocked = false;
  fixture.onlyOneFormat = false;
  fixture.update.mockImplementation(async () => {});
  mockBrowserLocale({ language: 'en' });
});
afterEach(() => cleanup());

describe('AddressTypeShortcut visibility', () => {
  it('shows for an unlocked mnemonic wallet with several formats', () => {
    render(<AddressTypeShortcut />);
    expect(shortcutButton()).toBeInTheDocument();
    expect(fixture.preview).not.toHaveBeenCalled();
  });

  it('hides while the keychain is locked', () => {
    fixture.keychainLocked = true;
    render(<AddressTypeShortcut />);
    expect(shortcutButton()).toBeNull();
  });

  it('hides when no wallet is active', () => {
    fixture.wallet = null;
    render(<AddressTypeShortcut />);
    expect(shortcutButton()).toBeNull();
  });

  it('hides when the wallet supports only one address type', () => {
    fixture.onlyOneFormat = true;
    render(<AddressTypeShortcut />);
    expect(shortcutButton()).toBeNull();
  });

  it.each<WalletType>(['hardware', 'privateKey'])('hides for a %s wallet, which cannot switch', (type) => {
    setWallet(type, AddressFormat.P2WPKH);
    render(<AddressTypeShortcut />);
    expect(shortcutButton()).toBeNull();
  });
});

describe('AddressTypeShortcut popover', () => {
  it('lists the supported formats with previews and checks the current one', async () => {
    render(<AddressTypeShortcut />);
    const group = await openShortcut();
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual([
      ['Taproot (P2TR)', AddressFormat.P2TR],
      ['Native SegWit (P2WPKH)', AddressFormat.P2WPKH],
      ['Nested SegWit (P2SH-P2WPKH)', AddressFormat.P2SH_P2WPKH],
      ['Legacy (P2PKH)', AddressFormat.P2PKH],
    ].map(([label, format]) => `${label}${formatAddress(previewFor(format as string))}`));
    expect(within(group).getByRole('radio', { checked: true })).toHaveTextContent('Native SegWit (P2WPKH)');
    expect(fixture.preview.mock.calls.map(([, format]) => format)).toEqual([
      AddressFormat.P2TR,
      AddressFormat.P2WPKH,
      AddressFormat.P2SH_P2WPKH,
      AddressFormat.P2PKH,
    ]);
  });

  it('moves focus into the popover and closes on Escape, returning focus to the button', async () => {
    render(<AddressTypeShortcut />);
    const group = await openShortcut();
    await waitFor(() => expect(group.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement ?? group, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    expect(document.activeElement).toBe(shortcutButton());
  });

  it('closes on an outside click', async () => {
    render(<div><p>outside</p><AddressTypeShortcut /></div>);
    await openShortcut();
    fireEvent.pointerDown(screen.getByText('outside'));
    fireEvent.pointerUp(screen.getByText('outside'));
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
  });

  it('switches through the shared wallet update path and closes', async () => {
    render(<AddressTypeShortcut />);
    const group = await openShortcut();
    await act(async () => {
      fireEvent.click(within(group).getByRole('radio', { name: /Taproot/ }));
    });
    expect(fixture.update).toHaveBeenCalledTimes(1);
    expect(fixture.update).toHaveBeenCalledWith('wallet', AddressFormat.P2TR);
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
  });

  it('keeps the popover open, reverts the check and shows the error when the switch fails', async () => {
    fixture.update.mockImplementation(async () => { throw new Error('Wallet is locked. Please unlock first.'); });
    render(<AddressTypeShortcut />);
    const group = await openShortcut();
    await act(async () => {
      fireEvent.click(within(group).getByRole('radio', { name: /Legacy/ }));
    });
    expect(await screen.findByText('Wallet is locked. Please unlock first.')).toBeInTheDocument();
    expect(within(group).getByRole('radio', { checked: true })).toHaveTextContent('Native SegWit (P2WPKH)');
  });
});

describe('parity with Settings → Address type', () => {
  async function settingsOptions() {
    const view = render(<MemoryRouter><AddressTypesPage /></MemoryRouter>);
    const radios = await screen.findAllByRole('radio');
    const texts = radios.map((radio) => radio.textContent);
    // Whether settings lets a choice through: click another format and see if it reaches the wallet.
    const other = radios.find((radio) => radio.getAttribute('aria-checked') !== 'true');
    if (other) {
      await act(async () => { fireEvent.click(other); });
    }
    const allowsSwitch = fixture.update.mock.calls.length > 0;
    view.unmount();
    fixture.update.mockClear();
    return { texts, allowsSwitch };
  }

  async function shortcutOptions() {
    const view = render(<AddressTypeShortcut />);
    if (!shortcutButton()) {
      view.unmount();
      return null;
    }
    const group = await openShortcut();
    const texts = within(group).getAllByRole('radio').map((radio) => radio.textContent);
    view.unmount();
    return texts;
  }

  it.each(Object.values(AddressFormat))('offers the same choices as settings for a mnemonic %s wallet', async (format) => {
    setWallet('mnemonic', format);
    const settings = await settingsOptions();
    const shortcut = await shortcutOptions();
    expect(settings.allowsSwitch).toBe(true);
    expect(shortcut).toEqual(settings.texts);
  });

  it('offers nothing where settings refuses the choice (hardware)', async () => {
    setWallet('hardware', AddressFormat.P2WPKH);
    const settings = await settingsOptions();
    expect(settings.allowsSwitch).toBe(false);
    expect(await shortcutOptions()).toBeNull();
  });

  it('offers nothing where the wallet refuses every switch settings forwards (private key)', async () => {
    // WalletManager.updateWalletAddressFormat re-derives from a mnemonic and refuses other types;
    // settings forwards the click and shows that refusal, so the shortcut does not offer it at all.
    fixture.update.mockImplementation(async () => { throw new Error('Only mnemonic wallets can change address type.'); });
    setWallet('privateKey', AddressFormat.P2WPKH);
    render(<MemoryRouter><AddressTypesPage /></MemoryRouter>);
    const radios = await screen.findAllByRole('radio');
    await act(async () => { fireEvent.click(radios[0] as HTMLElement); });
    expect(await screen.findByText('Only mnemonic wallets can change address type.')).toBeInTheDocument();
    cleanup();
    expect(await shortcutOptions()).toBeNull();
  });
});
