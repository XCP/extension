import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { formatAddress } from '@/core/format';
import { mockBrowserLocale, render } from '@/i18n/test-utils';
import AddressTypesPage from '@/pages/settings/address-types';
import { AddressTypeShortcut } from './address-type-shortcut';

type WalletType = 'mnemonic' | 'privateKey' | 'hardware';

const fixture = vi.hoisted(() => {
  type Wallet = {
    id: string;
    type: 'mnemonic' | 'privateKey' | 'hardware';
    addressFormat: string;
    addressCount: number;
    addresses: { name: string; address: string; path: string; pubKey: string }[];
  };
  return {
    wallet: null as Wallet | null,
    activeAddress: 'active-0',
    keychainLocked: false,
    onlyOneFormat: false,
    preview: vi.fn(async (_wallet: string, format: string, index?: number) => `address-for-${format}-at-${index}`),
    update: vi.fn(async (_wallet: string, _format: string) => {}),
  };
});

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: fixture.wallet,
    activeAddress: fixture.wallet?.addresses.find((address) => address.address === fixture.activeAddress) ?? null,
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

const previewFor = (format: string, index = 0) => `address-for-${format}-at-${index}`;
const BUTTON_NAME = /^Change address type/;
const shortcutButton = () => screen.queryByRole('button', { name: BUTTON_NAME });

function setWallet(type: WalletType, addressFormat: string) {
  fixture.wallet = {
    id: 'wallet',
    type,
    addressFormat,
    addressCount: 3,
    addresses: [0, 1, 2].map((index) => ({
      name: `Address ${index + 1}`,
      address: `active-${index}`,
      path: `m/84'/0'/0'/0/${index}`,
      pubKey: `02${index}`,
    })),
  };
}

async function openShortcut() {
  fireEvent.click(screen.getByRole('button', { name: BUTTON_NAME }));
  const list = await screen.findByRole('listbox', { name: 'Address Type' });
  await waitFor(() => expect(list).toHaveAttribute('aria-busy', 'false'));
  return list;
}

const option = (list: HTMLElement, name: RegExp) => within(list).getByRole('option', { name });
const selectedOption = (list: HTMLElement) => within(list).getByRole('option', { selected: true });
const popoverClosed = () => expect(screen.queryByRole('listbox')).toBeNull();
function pressKey(key: string) {
  const target = document.activeElement;
  if (!target) throw new Error('nothing is focused');
  fireEvent.keyDown(target, { key });
}

beforeEach(() => {
  vi.clearAllMocks();
  setWallet('mnemonic', AddressFormat.P2WPKH);
  fixture.activeAddress = 'active-0';
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
  it('names the current address type on the button', () => {
    render(<AddressTypeShortcut />);
    expect(shortcutButton()).toHaveAccessibleName('Change address type (current: Native SegWit (P2WPKH))');
    expect(shortcutButton()).toHaveAttribute('title', 'Change address type (current: Native SegWit (P2WPKH))');
  });

  it('lists the supported formats with previews and marks the current one', async () => {
    render(<AddressTypeShortcut />);
    const list = await openShortcut();
    const options = within(list).getAllByRole('option');
    expect(options.map((element) => element.textContent)).toEqual([
      ['Taproot (P2TR)', AddressFormat.P2TR],
      ['Native SegWit (P2WPKH)', AddressFormat.P2WPKH],
      ['Nested SegWit (P2SH-P2WPKH)', AddressFormat.P2SH_P2WPKH],
      ['Legacy (P2PKH)', AddressFormat.P2PKH],
    ].map(([label, format]) => `${label}${formatAddress(previewFor(format as string))}`));
    expect(selectedOption(list)).toHaveTextContent('Native SegWit (P2WPKH)');
    expect(fixture.preview.mock.calls.map(([, format]) => format)).toEqual([
      AddressFormat.P2TR,
      AddressFormat.P2WPKH,
      AddressFormat.P2SH_P2WPKH,
      AddressFormat.P2PKH,
    ]);
  });

  it('previews each type at the active address index, so the current row is the address in use', async () => {
    fixture.activeAddress = 'active-2';
    render(<AddressTypeShortcut />);
    const list = await openShortcut();
    expect(fixture.preview.mock.calls.every(([, , index]) => index === 2)).toBe(true);
    expect(selectedOption(list)).toHaveTextContent(formatAddress(previewFor(AddressFormat.P2WPKH, 2)));
    expect(option(list, /Taproot/)).toHaveTextContent(formatAddress(previewFor(AddressFormat.P2TR, 2)));
  });

  it('does not re-derive previews when the wallet object is refreshed unchanged', async () => {
    const view = render(<AddressTypeShortcut />);
    await openShortcut();
    expect(fixture.preview).toHaveBeenCalledTimes(4);
    const wallet = fixture.wallet;
    if (!wallet) throw new Error('fixture wallet missing');
    fixture.wallet = { ...wallet, addresses: [...wallet.addresses] };
    view.rerender(<AddressTypeShortcut />);
    await act(async () => {});
    expect(fixture.preview).toHaveBeenCalledTimes(4);
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'false');
  });

  it('moves focus to the current type when it opens', async () => {
    render(<AddressTypeShortcut />);
    const list = await openShortcut();
    await waitFor(() => expect(document.activeElement).toBe(selectedOption(list)));
  });

  it('moves focus with the arrow, Home and End keys without switching', async () => {
    render(<AddressTypeShortcut />);
    const list = await openShortcut();
    await waitFor(() => expect(document.activeElement).toBe(selectedOption(list)));

    pressKey('ArrowDown');
    expect(document.activeElement).toBe(option(list, /Nested SegWit/));
    pressKey('ArrowDown');
    pressKey('ArrowDown');
    expect(document.activeElement).toBe(option(list, /Legacy/));
    pressKey('ArrowUp');
    expect(document.activeElement).toBe(option(list, /Nested SegWit/));
    pressKey('Home');
    expect(document.activeElement).toBe(option(list, /Taproot/));
    pressKey('ArrowUp');
    expect(document.activeElement).toBe(option(list, /Taproot/));
    pressKey('End');
    expect(document.activeElement).toBe(option(list, /Legacy/));
    await act(async () => {});

    expect(fixture.update).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBe(list);
    expect(selectedOption(list)).toHaveTextContent('Native SegWit (P2WPKH)');
    // Roving focus: only the focused option is in the tab order.
    expect(within(list).getAllByRole('option').map((element) => element.tabIndex)).toEqual([-1, -1, -1, 0]);
  });

  it.each(['Enter', ' '])('switches to the focused type on %j and closes', async (key) => {
    render(<AddressTypeShortcut />);
    const list = await openShortcut();
    await waitFor(() => expect(document.activeElement).toBe(selectedOption(list)));
    pressKey('ArrowUp');
    expect(fixture.update).not.toHaveBeenCalled();
    await act(async () => { pressKey(key); });
    expect(fixture.update).toHaveBeenCalledTimes(1);
    expect(fixture.update).toHaveBeenCalledWith('wallet', AddressFormat.P2TR);
    await waitFor(popoverClosed);
  });

  it('closes without switching when Enter is pressed on the current type', async () => {
    render(<AddressTypeShortcut />);
    const list = await openShortcut();
    await waitFor(() => expect(document.activeElement).toBe(selectedOption(list)));
    await act(async () => { pressKey('Enter'); });
    await waitFor(popoverClosed);
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it('closes on Escape without switching, after moving through the types, and returns focus', async () => {
    render(<AddressTypeShortcut />);
    const list = await openShortcut();
    await waitFor(() => expect(document.activeElement).toBe(selectedOption(list)));
    pressKey('ArrowDown');
    pressKey('Escape');
    await waitFor(popoverClosed);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(shortcutButton());
  });

  it('closes on an outside click', async () => {
    render(<div><p>outside</p><AddressTypeShortcut /></div>);
    await openShortcut();
    fireEvent.pointerDown(screen.getByText('outside'));
    fireEvent.pointerUp(screen.getByText('outside'));
    await waitFor(popoverClosed);
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it('switches on a click through the shared wallet update path and closes', async () => {
    render(<AddressTypeShortcut />);
    const list = await openShortcut();
    await act(async () => { fireEvent.click(option(list, /Taproot/)); });
    expect(fixture.update).toHaveBeenCalledTimes(1);
    expect(fixture.update).toHaveBeenCalledWith('wallet', AddressFormat.P2TR);
    await waitFor(popoverClosed);
  });

  it('keeps the popover open, reverts the selection and shows the error when the switch fails', async () => {
    fixture.update.mockImplementation(async () => { throw new Error('Wallet is locked. Please unlock first.'); });
    render(<AddressTypeShortcut />);
    const list = await openShortcut();
    await act(async () => { fireEvent.click(option(list, /Legacy/)); });
    expect(await screen.findByText('Wallet is locked. Please unlock first.')).toBeInTheDocument();
    expect(selectedOption(list)).toHaveTextContent('Native SegWit (P2WPKH)');
  });
});

describe('parity with Settings → Address type', () => {
  async function settingsOptions() {
    const view = render(<MemoryRouter><AddressTypesPage /></MemoryRouter>);
    const radios = await screen.findAllByRole('option');
    const texts = radios.map((radio) => radio.textContent);
    // Whether settings lets a choice through: click another format and see if it reaches the wallet.
    const other = radios.find((radio) => radio.getAttribute('aria-selected') !== 'true');
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
    const list = await openShortcut();
    const texts = within(list).getAllByRole('option').map((element) => element.textContent);
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
    const radios = await screen.findAllByRole('option');
    await act(async () => { fireEvent.click(radios[0] as HTMLElement); });
    expect(await screen.findByText('Only mnemonic wallets can change address type.')).toBeInTheDocument();
    cleanup();
    expect(await shortcutOptions()).toBeNull();
  });
});
